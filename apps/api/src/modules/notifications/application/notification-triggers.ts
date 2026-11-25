import { Inject, Injectable } from '@nestjs/common';
import type { NotificationTemplate } from '@nopi/contracts';
import { friendlyDue, vi } from '@nopi/copy';
import { fromVn, vnParts } from '@nopi/domain';
import { AppError, CLOCK, OnDomainEvent, RateLimiter, type Actor, type Clock, type DomainEvent } from '../../../platform/index.js';
import { AssignmentPublished, AssignmentsService, StudentWorkService } from '../../assignments/public-api.js';
import { EntitlementService } from '../../billing/public-api.js';
import { GuardianService, StudentDirectory } from '../../identity/public-api.js';
import { SpaceSettingsService, TeachingReader } from '../../org/public-api.js';
import { EvaluationSaved, SubmissionsService } from '../../submissions/public-api.js';
import { NotificationService, type NotifyInput } from './notification.service.js';

type Kind = 'assignmentPublished' | 'dueReminder' | 'teacherCommented' | 'redoRequested' | 'remindMissing';
const TEMPLATE: Record<Kind, NotificationTemplate> = {
  assignmentPublished: 'assignment_published',
  dueReminder: 'due_reminder',
  teacherCommented: 'teacher_commented',
  redoRequested: 'redo_requested',
  remindMissing: 'remind_missing',
};

/**
 * Quy tắc "khi nào gửi gì" (mục 6.4). Thêm loại thông báo = thêm một handler/việc định kỳ ở đây,
 * không sửa mô-đun giao bài hay chấm bài.
 */
@Injectable()
export class NotificationTriggers {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly notifications: NotificationService,
    private readonly assignments: AssignmentsService,
    private readonly work: StudentWorkService,
    private readonly guardians: GuardianService,
    private readonly students: StudentDirectory,
    private readonly teaching: TeachingReader,
    private readonly limiter: RateLimiter,
    private readonly submissions: SubmissionsService,
    private readonly entitlements: EntitlementService,
    private readonly settings: SpaceSettingsService,
  ) {}

  /** Một thông báo cho mỗi phụ huynh của mỗi em + một cho máy riêng của em. */
  private async forStudents(
    kind: Kind,
    rows: { studentId: string; saId?: string; assignmentId: string }[],
    keyPrefix: string,
  ): Promise<NotifyInput[]> {
    const briefs = await this.assignments.briefs([...new Set(rows.map((r) => r.assignmentId))]);
    const names = await this.students.namesOf([...new Set(rows.map((r) => r.studentId))]);
    const guardians = await this.guardians.guardiansOf([...names.keys()]);
    const now = this.clock.now();
    const out: NotifyInput[] = [];
    for (const r of rows) {
      const a = briefs.get(r.assignmentId);
      const s = names.get(r.studentId);
      if (!a || !s) continue;
      const params = { child: s.nickname ?? s.fullName.split(' ').pop()!, subject: a.subject, title: a.title, due: friendlyDue(a.dueAt, now).replace('Hạn: ', 'hạn ') };
      const data = { studentAssignmentId: r.saId, studentId: r.studentId, assignmentId: r.assignmentId };
      for (const userId of guardians.get(r.studentId) ?? []) {
        const m = vi.notify[kind].guardian(params);
        out.push({ template: TEMPLATE[kind], recipient: { kind: 'user', userId, role: 'guardian' }, ...m, data, schoolId: a.schoolId, dedupeKey: `${keyPrefix}:u:${userId}:${r.studentId}`, respectQuietHours: true });
      }
      const m = vi.notify[kind].student(params);
      out.push({ template: TEMPLATE[kind], recipient: { kind: 'student', studentId: r.studentId }, ...m, data, schoolId: a.schoolId, dedupeKey: `${keyPrefix}:s:${r.studentId}`, respectQuietHours: true });
    }
    return out;
  }

  /** Bài mới → phụ huynh + học sinh. */
  @OnDomainEvent(AssignmentPublished.type)
  async onPublished(e: DomainEvent) {
    const p = e.payload as { assignmentId: string; studentIds: string[] };
    const sa = await this.work.saIdsFor(p.assignmentId);
    const rows = p.studentIds.map((studentId) => ({ studentId, saId: sa.get(studentId), assignmentId: p.assignmentId }));
    await this.notifications.enqueue(await this.forStudents('assignmentPublished', rows, `ap:${p.assignmentId}`));
  }

  /** Cô đã chấm / yêu cầu làm lại → phụ huynh + học sinh (sửa nhận xét thì không báo lại). */
  @OnDomainEvent(EvaluationSaved.type)
  async onEvaluated(e: DomainEvent) {
    const p = e.payload as { evaluationId: string; studentAssignmentId: string; assignmentId: string; studentId: string; requiresRedo: boolean; isUpdate: boolean };
    if (p.isUpdate) return;
    await this.notifications.enqueue(
      await this.forStudents(p.requiresRedo ? 'redoRequested' : 'teacherCommented', [{ studentId: p.studentId, saId: p.studentAssignmentId, assignmentId: p.assignmentId }], `ev:${p.evaluationId}`),
    );
  }

  /** 18:00 mỗi ngày: nhắc bài có hạn vào NGÀY MAI mà em chưa nộp. */
  async dueReminders() {
    const p = vnParts(this.clock.now());
    const from = fromVn(p.year, p.month, p.day + 1, 0, 0);
    const to = fromVn(p.year, p.month, p.day + 2, 0, 0);
    const rows = await this.work.pendingDueBetween(from, to);
    const day = `${p.year}-${p.month + 1}-${p.day}`;
    const items = (await Promise.all(rows.map((r) => this.forStudents('dueReminder', [r], `rem:${r.saId}:${day}`)))).flat();
    return this.notifications.enqueue(items);
  }

  /**
   * Chạy mỗi giờ: MỘT bản tổng hợp/ngày cho mỗi giáo viên thay vì 30 thông báo lẻ, gửi vào giờ
   * `teacherDigestTime` của trường (mặc định 20:00, theo giờ tròn). Dạy nhiều trường: trường nào tới giờ trước thì gửi.
   */
  async teacherDigests() {
    const p = vnParts(this.clock.now());
    const startOfDay = fromVn(p.year, p.month, p.day, 0, 0);
    const day = `${p.year}-${p.month + 1}-${p.day}`;
    const hourOf = new Map<string, number>();
    const items: NotifyInput[] = [];
    for (const teacherId of await this.teaching.allCurrentTeacherIds()) {
      const schools = [...new Set((await this.teaching.currentFor(teacherId)).map((t) => t.schoolId))];
      let due = false;
      for (const id of schools) {
        if (!hourOf.has(id)) hourOf.set(id, Number((await this.settings.get(id)).teacherDigestTime.slice(0, 2)));
        if (hourOf.get(id) === p.hour) due = true;
      }
      if (!due) continue;
      const lines = await this.assignments.digestLines(teacherId, startOfDay);
      if (lines.length === 0) continue;
      const m = vi.notify.teacherDigest(lines);
      items.push({ template: 'teacher_digest', recipient: { kind: 'user', userId: teacherId, role: 'teacher' }, ...m, data: {}, schoolId: null, dedupeKey: `digest:${teacherId}:${day}`, respectQuietHours: false });
    }
    return this.notifications.enqueue(items);
  }

  /**
   * 09:00 mỗi ngày: báo phụ huynh trước 7 ngày khi ảnh/video bài nộp của con sắp bị xoá theo hạn lưu của trường,
   * để ai muốn giữ thì tải về. Một thông báo mỗi phụ huynh × con × ngày xoá.
   */
  async mediaExpiringWarnings(daysAhead = 7) {
    const p = vnParts(this.clock.now());
    const target = vnParts(fromVn(p.year, p.month, p.day + daysAhead, 12, 0));
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${target.year}-${pad(target.month + 1)}-${pad(target.day)}`;
    const rows = await this.submissions.expiringOn(date);
    if (rows.length === 0) return 0;
    const names = await this.students.namesOf([...new Set(rows.map((r) => r.studentId))]);
    const guardians = await this.guardians.guardiansOf([...names.keys()]);
    const items: NotifyInput[] = [];
    for (const r of rows) {
      const s = names.get(r.studentId);
      if (!s) continue;
      const m = vi.notify.mediaExpiring({ child: s.nickname ?? s.fullName.split(' ').pop()!, count: r.count, date: `${pad(target.day)}/${pad(target.month + 1)}` });
      for (const userId of guardians.get(r.studentId) ?? []) {
        items.push({ template: 'media_expiring', recipient: { kind: 'user', userId, role: 'guardian' }, ...m, data: { studentId: r.studentId }, schoolId: r.schoolId, dedupeKey: `expiring:${userId}:${r.studentId}:${r.schoolId}:${date}`, respectQuietHours: true });
      }
    }
    return this.notifications.enqueue(items);
  }

  /** 09:00 mỗi ngày: báo bố mẹ trước 3 ngày khi gói gia đình / dùng thử sắp hết mà không tự gia hạn. */
  async planExpiringWarnings(daysAhead = 3) {
    const now = this.clock.now();
    const rows = await this.entitlements.expiringBetween(now, new Date(now.getTime() + daysAhead * 86_400_000));
    const items: NotifyInput[] = rows.map((r) => {
      const p = vnParts(r.periodEnd);
      const date = `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}`;
      return {
        template: 'plan_expiring',
        recipient: { kind: 'user', userId: r.userId, role: 'guardian' },
        ...vi.notify.planExpiring({ plan: r.planName, date, trial: r.trial }),
        data: {},
        schoolId: r.schoolId,
        dedupeKey: `plan-expiring:${r.subscriptionId}:${r.periodEnd.toISOString()}`,
        respectQuietHours: true,
      };
    });
    return this.notifications.enqueue(items);
  }

  /** Giáo viên bấm "Nhắc các em chưa nộp" — gửi thẳng cho phụ huynh. Mỗi bài tối đa một lần / 2 giờ. */
  async remindMissing(actor: Actor, assignmentId: string) {
    await this.assignments.loadForTeacher(actor, assignmentId);
    const rl = await this.limiter.hit(`remind:${assignmentId}`, 1, 2 * 3600);
    if (!rl.allowed) throw new AppError('rate_limited', `Cô vừa nhắc rồi, có thể nhắc lại sau ${Math.ceil(rl.retryAfterSeconds / 60)} phút`);
    const rows = (await this.work.notSubmitted(assignmentId)).map((r) => ({ ...r, assignmentId }));
    const bucket = Math.floor(this.clock.now().getTime() / 3600_000);
    await this.notifications.enqueue(await this.forStudents('remindMissing', rows, `remind:${assignmentId}:${bucket}`));
    return { reminded: rows.length };
  }
}
