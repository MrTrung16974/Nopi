import { Inject, Injectable } from '@nestjs/common';
import type { ChildDto } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { CURRENT_POLICY_VERSION, normalizeCode } from '@nopi/domain';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, sha256, type Clock, type UserActor } from '../../../platform/index.js';
import { SessionsService } from './sessions.service.js';

const { guardians, students, guardianInvites } = schema;

/** Quan hệ phụ huynh–con và các việc phụ huynh làm cho con. */
@Injectable()
export class GuardianService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly audit: AuditLog,
  ) {}

  async listChildren(userId: string): Promise<ChildDto[]> {
    const rows = await this.db
      .select({
        studentId: students.id,
        fullName: students.fullName,
        nickname: students.nickname,
        avatarKey: students.avatarKey,
        relationship: guardians.relationship,
        policyVersion: guardians.policyVersion,
      })
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .where(and(eq(guardians.userId, userId), isNull(guardians.revokedAt)))
      .orderBy(students.fullName);
    return rows.map(({ policyVersion, ...r }) => ({ ...r, needsConsent: policyVersion !== CURRENT_POLICY_VERSION }));
  }

  /** Phụ huynh (còn hiệu lực) của các em: studentId → userId[]. */
  async guardiansOf(studentIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (studentIds.length === 0) return out;
    const rows = await this.db
      .select({ studentId: guardians.studentId, userId: guardians.userId })
      .from(guardians)
      .where(and(inArray(guardians.studentId, studentIds), isNull(guardians.revokedAt)));
    for (const r of rows) out.set(r.studentId, [...(out.get(r.studentId) ?? []), r.userId]);
    return out;
  }

  /** Người này có phải phụ huynh (còn hiệu lực) của học sinh không. */
  async isGuardian(userId: string, studentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ ok: sql<number>`1` })
      .from(guardians)
      .where(and(eq(guardians.userId, userId), eq(guardians.studentId, studentId), isNull(guardians.revokedAt)));
    return Boolean(row);
  }

  private async requireGuardian(userId: string, studentId: string, opts: { consented?: boolean } = {}) {
    const [g] = await this.db
      .select()
      .from(guardians)
      .where(and(eq(guardians.userId, userId), eq(guardians.studentId, studentId), isNull(guardians.revokedAt)));
    if (!g) throw new AppError('forbidden', 'Bạn chưa được liên kết với học sinh này');
    if (opts.consented && g.policyVersion !== CURRENT_POLICY_VERSION) {
      throw new AppError('forbidden', 'Vui lòng đọc và đồng ý điều khoản mới trước khi cho con học');
    }
    return g;
  }

  /** Phụ huynh quét phiếu mời → liên kết với con + đồng ý điều khoản. */
  async claimInvite(actor: UserActor, code: string, relationship: string): Promise<ChildDto> {
    const now = this.clock.now();
    const studentId = await this.db.transaction(async (tx) => {
      const [invite] = await tx
        .update(guardianInvites)
        .set({ claimCount: sql`${guardianInvites.claimCount} + 1` })
        .where(
          and(
            eq(guardianInvites.codeHash, sha256(normalizeCode(code))),
            isNull(guardianInvites.revokedAt),
            gt(guardianInvites.expiresAt, now),
          ),
        )
        .returning({ studentId: guardianInvites.studentId, schoolId: guardianInvites.schoolId });
      if (!invite) throw new AppError('not_found', 'Mã mời không đúng hoặc đã hết hạn, vui lòng hỏi lại cô giáo');

      await tx
        .insert(guardians)
        .values({ studentId: invite.studentId, userId: actor.userId, relationship, policyVersion: CURRENT_POLICY_VERSION, consentedAt: now })
        .onConflictDoUpdate({
          target: [guardians.studentId, guardians.userId],
          set: { relationship, policyVersion: CURRENT_POLICY_VERSION, consentedAt: now, revokedAt: null },
        });
      await this.audit.record(
        { actor, action: 'guardian.link', targetType: 'student', targetId: invite.studentId, studentId: invite.studentId, schoolId: invite.schoolId, metadata: { relationship, policyVersion: CURRENT_POLICY_VERSION } },
        tx,
      );
      return invite.studentId;
    });
    const child = (await this.listChildren(actor.userId)).find((c) => c.studentId === studentId);
    return child!;
  }

  /**
   * Bố mẹ tự tạo hồ sơ cho con (không gian gia đình): liên kết ngay, đồng ý điều khoản bản hiện tại.
   * Chỉ mô-đun org gọi, ngay sau khi tạo hồ sơ học sinh.
   */
  async linkAsCreator(actor: UserActor, studentId: string, relationship: string, tx: DbOrTx = this.db) {
    const now = this.clock.now();
    await tx
      .insert(guardians)
      .values({ studentId, userId: actor.userId, relationship, policyVersion: CURRENT_POLICY_VERSION, consentedAt: now })
      .onConflictDoNothing();
    await this.audit.record({ actor, action: 'guardian.link.creator', targetType: 'student', targetId: studentId, studentId, metadata: { policyVersion: CURRENT_POLICY_VERSION } }, tx);
  }

  async consent(actor: UserActor, studentId: string) {
    await this.requireGuardian(actor.userId, studentId);
    await this.db
      .update(guardians)
      .set({ policyVersion: CURRENT_POLICY_VERSION, consentedAt: this.clock.now() })
      .where(and(eq(guardians.userId, actor.userId), eq(guardians.studentId, studentId)));
    await this.audit.record({ actor, action: 'guardian.consent', targetType: 'student', targetId: studentId, studentId, metadata: { policyVersion: CURRENT_POLICY_VERSION } });
  }

  /** "Cho con học": mở phiên học sinh trên máy của bố mẹ. */
  async startChildSession(actor: UserActor, studentId: string) {
    await this.requireGuardian(actor.userId, studentId, { consented: true });
    const [s] = await this.db.select().from(students).where(eq(students.id, studentId));
    const tokens = await this.sessions.createStudentSession(studentId, 'guardian_device');
    await this.audit.record({ actor, action: 'student.session.start', targetType: 'student', targetId: studentId, studentId });
    const { sessionId: _sid, ...rest } = tokens;
    return { ...rest, student: { id: s!.id, fullName: s!.fullName, nickname: s!.nickname, avatarKey: s!.avatarKey } };
  }

  async listChildSessions(actor: UserActor, studentId: string) {
    await this.requireGuardian(actor.userId, studentId);
    const rows = await this.sessions.listActiveStudentSessions(studentId);
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  /** Thu hồi phiên của con từ xa (mất máy, đổi máy…). */
  async revokeChildSession(actor: UserActor, studentId: string, sessionId: string) {
    await this.requireGuardian(actor.userId, studentId);
    const sessions = await this.sessions.listActiveStudentSessions(studentId);
    if (!sessions.some((s) => s.id === sessionId)) throw new AppError('not_found', 'Không tìm thấy phiên đăng nhập này');
    await this.sessions.revokeStudentSession(sessionId);
    await this.audit.record({ actor, action: 'student.session.revoke', targetType: 'student_session', targetId: sessionId, studentId });
  }
}
