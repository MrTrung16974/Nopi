import { Inject, Injectable, Logger } from '@nestjs/common';
import { MUTABLE_TEMPLATES, type NotificationDto, type NotificationSettings, type NotificationTemplate } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { nextSendableTime, type QuietHours } from '@nopi/domain';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { APP_CONFIG, CLOCK, DB, type Actor, type AppConfig, type Clock } from '../../../platform/index.js';
import { UserDirectory } from '../../identity/public-api.js';
import { SpaceSettingsService } from '../../org/public-api.js';
import { PUSH_SENDER, type PushSender } from '../ports/push-sender.js';
import { ZALO_SENDER, type ZaloSender } from '../ports/zalo-sender.js';

const { notifications, devices, notificationPreferences } = schema;
const MAX_ATTEMPTS = 5;

export type Recipient = { kind: 'user'; userId: string; role: 'guardian' | 'teacher' } | { kind: 'student'; studentId: string };

export interface NotifyInput {
  template: NotificationTemplate;
  recipient: Recipient;
  title: string;
  body: string;
  data: { studentAssignmentId?: string; studentId?: string; assignmentId?: string; reportId?: string };
  schoolId: string | null;
  /** Khoá chống gửi trùng (sự kiện có thể được giao lại) */
  dedupeKey: string;
  /** Giờ yên lặng 21:00–6:30: dời tới sáng hôm sau (học sinh, phụ huynh). Bản tổng hợp cho giáo viên thì không. */
  respectQuietHours: boolean;
}

/**
 * Xếp hàng và gửi thông báo. Mỗi thông báo là một dòng trong bảng notifications (cũng là hộp thư của người nhận),
 * worker gửi theo lô: đẩy về app → không có app thì tin Zalo (phụ huynh) → không thì chỉ lưu hộp thư.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(ZALO_SENDER) private readonly zalo: ZaloSender,
    private readonly settings: SpaceSettingsService,
    private readonly users: UserDirectory,
  ) {}

  async enqueue(items: NotifyInput[]) {
    if (items.length === 0) return 0;
    const now = this.clock.now();
    const quiet = new Map<string, QuietHours>();
    for (const id of new Set(items.map((i) => i.schoolId).filter((x): x is string => Boolean(x)))) {
      quiet.set(id, (await this.settings.get(id)).quietHours);
    }
    const rows = items.map((i) => ({
      schoolId: i.schoolId,
      recipientUserId: i.recipient.kind === 'user' ? i.recipient.userId : null,
      recipientStudentId: i.recipient.kind === 'student' ? i.recipient.studentId : null,
      channel: 'push',
      template: i.template,
      title: i.title,
      body: i.body,
      payload: { ...i.data, role: i.recipient.kind === 'user' ? i.recipient.role : 'student' },
      dedupeKey: i.dedupeKey,
      sendAfter: i.respectQuietHours ? nextSendableTime(now, i.schoolId ? quiet.get(i.schoolId) : undefined) : now,
    }));
    const inserted = await this.db.insert(notifications).values(rows).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
    return inserted.length;
  }

  /** Worker gọi mỗi phút: gửi các thông báo tới giờ. Nhiều worker chạy song song vẫn an toàn (SKIP LOCKED). */
  async dispatchDue(limit = 200): Promise<{ sent: number; skipped: number; retry: number }> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.status, 'pending'), lte(notifications.sendAfter, this.clock.now())))
        .orderBy(notifications.sendAfter)
        .limit(limit)
        .for('update', { skipLocked: true });
      if (due.length === 0) return { sent: 0, skipped: 0, retry: 0 };

      const userIds = [...new Set(due.map((n) => n.recipientUserId).filter((x): x is string => Boolean(x)))];
      const studentIds = [...new Set(due.map((n) => n.recipientStudentId).filter((x): x is string => Boolean(x)))];
      const devs = await tx
        .select()
        .from(devices)
        .where(
          sql`(${userIds.length ? inArray(devices.userId, userIds) : sql`false`} OR ${studentIds.length ? inArray(devices.studentId, studentIds) : sql`false`}) AND ${devices.pushToken} IS NOT NULL`,
        );
      // Loại thông báo người nhận đã tắt: vẫn nằm trong hộp thư, không đẩy/nhắn tin
      const prefs = userIds.length ? await tx.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds)) : [];
      const mutedOf = new Map(prefs.map((p) => [p.userId, new Set(p.muted)]));
      const isMuted = (n: (typeof due)[number]) => Boolean(n.recipientUserId && mutedOf.get(n.recipientUserId)?.has(n.template));
      const tokensOf = (n: (typeof due)[number]) =>
        isMuted(n) ? [] :
        devs.filter((d) => (n.recipientUserId ? d.userId === n.recipientUserId : d.studentId === n.recipientStudentId)).map((d) => d.pushToken!);

      // 1) Đẩy về app (một lần gọi cho cả lô)
      const messages = due.flatMap((n) =>
        tokensOf(n).map((token) => ({ token, title: n.title, body: n.body, data: { notificationId: n.id, template: n.template, ...stringify(n.payload) } })),
      );
      let results: Awaited<ReturnType<PushSender['send']>> = [];
      let pushDown = false;
      if (messages.length) {
        try {
          results = await this.push.send(messages);
        } catch (err) {
          pushDown = true;
          this.logger.warn(`Dịch vụ đẩy tin lỗi: ${String(err)}`);
        }
      }
      const dead = results.filter((r) => r.unregistered).map((r) => r.token);
      if (dead.length) await tx.delete(devices).where(inArray(devices.pushToken, dead));

      // 2) Phụ huynh không có app (hoặc đẩy thất bại hết) → tin Zalo
      const phones = new Map((await this.users.findByIds(userIds, tx)).map((u) => [u.id, u.phone]));
      let sent = 0;
      let skipped = 0;
      let retry = 0;
      const now = this.clock.now();
      for (const n of due) {
        const tokens = tokensOf(n);
        const okPush = results.some((r) => r.ok && tokens.includes(r.token));
        const isGuardian = (n.payload as { role?: string }).role === 'guardian';
        const phone = n.recipientUserId ? phones.get(n.recipientUserId) : null;
        let status: 'sent' | 'skipped' | 'pending' | 'failed' = 'skipped';
        let channel = n.channel;
        let error: string | null = null;
        if (isMuted(n)) error = 'muted';
        else if (okPush) status = 'sent';
        else if (tokens.length && pushDown) {
          status = n.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
          error = 'push service down';
        } else if (isGuardian && phone && this.config.ZALO_NOTIFY_PROVIDER !== 'none') {
          try {
            await this.zalo.send(phone, n.template, { title: n.title, body: n.body });
            status = 'sent';
            channel = 'zalo';
          } catch (err) {
            status = n.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
            error = String(err);
          }
        }
        if (status === 'sent') sent++;
        else if (status === 'pending') retry++;
        else skipped++;
        await tx
          .update(notifications)
          .set({
            status,
            channel,
            attempts: n.attempts + 1,
            lastError: error,
            sentAt: status === 'sent' ? now : null,
            sendAfter: status === 'pending' ? new Date(now.getTime() + 5 * 60_000 * (n.attempts + 1)) : n.sendAfter,
          })
          .where(eq(notifications.id, n.id));
      }
      return { sent, skipped, retry };
    });
  }

  // ---------------- Hộp thư (người lớn) ----------------
  async inbox(userId: string): Promise<{ items: NotificationDto[]; unread: number }> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), lte(notifications.sendAfter, this.clock.now())))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const [{ unread } = { unread: 0 }] = await this.db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt), lte(notifications.sendAfter, this.clock.now())));
    return {
      unread,
      items: rows.map((n) => {
        const { role: _role, ...data } = n.payload as Record<string, string>;
        return { id: n.id, template: n.template as NotificationDto['template'], title: n.title, body: n.body, data, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null };
      }),
    };
  }

  async markRead(userId: string, input: { ids?: string[]; all?: boolean }) {
    const where = input.all
      ? and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt))
      : and(eq(notifications.recipientUserId, userId), inArray(notifications.id, input.ids ?? []));
    if (!input.all && !input.ids?.length) return;
    await this.db.update(notifications).set({ readAt: this.clock.now() }).where(where);
  }

  // ---------------- Tuỳ chọn thông báo ----------------
  async getSettings(userId: string): Promise<NotificationSettings> {
    const [p] = await this.db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    return { muted: (p?.muted ?? []).filter((t): t is NotificationSettings['muted'][number] => (MUTABLE_TEMPLATES as readonly string[]).includes(t)) };
  }

  async updateSettings(userId: string, input: NotificationSettings): Promise<NotificationSettings> {
    const muted = [...new Set(input.muted)];
    await this.db
      .insert(notificationPreferences)
      .values({ userId, muted, updatedAt: this.clock.now() })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { muted, updatedAt: this.clock.now() } });
    return { muted };
  }

  // ---------------- Thiết bị ----------------
  /** Ghi nhận mã nhận thông báo của máy. Một mã chỉ thuộc một người (máy đổi chủ thì chuyển). */
  async registerDevice(actor: Actor, input: { platform: string; pushToken: string; appVersion?: string }) {
    const owner = actor.kind === 'user' ? { userId: actor.userId, studentId: null } : { userId: null, studentId: actor.studentId };
    await this.db
      .insert(devices)
      .values({ ...owner, platform: input.platform, pushToken: input.pushToken, appVersion: input.appVersion ?? null, lastSeenAt: this.clock.now() })
      .onConflictDoUpdate({ target: devices.pushToken, set: { ...owner, platform: input.platform, appVersion: input.appVersion ?? null, lastSeenAt: this.clock.now() } });
  }

  async unregisterDevice(actor: Actor, pushToken: string) {
    const own = actor.kind === 'user' ? eq(devices.userId, actor.userId) : eq(devices.studentId, actor.studentId);
    await this.db.delete(devices).where(and(eq(devices.pushToken, pushToken), own));
  }
}

const stringify = (o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
