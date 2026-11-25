import { Inject, Injectable } from '@nestjs/common';
import { TTL } from '@nopi/domain';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, randomToken, sha256, TokenService, type Clock } from '../../../platform/index.js';

const { userSessions, studentSessions, users } = schema;

export type UserSessionMethod = 'otp' | 'google' | 'password' | 'qr_web';
export type StudentSessionMethod = 'guardian_device' | 'qr_card' | 'pin';

/**
 * Phiên đăng nhập. Refresh token có tiền tố cho biết loại phiên: "u." người lớn, "s." học sinh.
 * Mỗi lần refresh sẽ xoay token (token cũ hết hiệu lực ngay).
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: TokenService,
    private readonly audit: AuditLog,
  ) {}

  private expiry(seconds: number) {
    return new Date(this.clock.now().getTime() + seconds * 1000);
  }

  async createUserSession(
    user: { id: string; isSystemAdmin: boolean },
    method: UserSessionMethod,
    opts: { userAgent?: string } = {},
    tx: DbOrTx = this.db,
  ) {
    const refreshToken = `u.${randomToken()}`;
    const [s] = await tx
      .insert(userSessions)
      .values({
        userId: user.id,
        method,
        refreshTokenHash: sha256(refreshToken),
        userAgent: opts.userAgent?.slice(0, 300),
        expiresAt: this.expiry(TTL.adultSession),
      })
      .returning({ id: userSessions.id });
    const access = await this.tokens.signAccess({
      kind: 'user',
      userId: user.id,
      sessionId: s!.id,
      isSystemAdmin: user.isSystemAdmin,
    });
    return { ...access, refreshToken };
  }

  async createStudentSession(
    studentId: string,
    method: StudentSessionMethod,
    opts: { expiresAt?: Date } = {},
    tx: DbOrTx = this.db,
  ) {
    const refreshToken = `s.${randomToken()}`;
    const max = this.expiry(TTL.studentSession);
    const expiresAt = opts.expiresAt && opts.expiresAt < max ? opts.expiresAt : max;
    const [s] = await tx
      .insert(studentSessions)
      .values({ studentId, method, refreshTokenHash: sha256(refreshToken), expiresAt })
      .returning({ id: studentSessions.id });
    const access = await this.tokens.signAccess({ kind: 'student', studentId, sessionId: s!.id });
    return { ...access, refreshToken, sessionId: s!.id };
  }

  /**
   * Đổi refresh token lấy cặp token mới (xoay vòng). Token CŨ bị dùng lại sau khi đã xoay
   * = có người khác giữ token → thu hồi cả phiên (cả kẻ lấy cắp lẫn chủ thật phải đăng nhập lại).
   * Ân hạn 30 giây cho trường hợp hai tab/hai yêu cầu cùng refresh một lúc.
   */
  async refresh(refreshToken: string) {
    const now = this.clock.now();
    const next = `${refreshToken.slice(0, 2)}${randomToken()}`;
    const hash = sha256(refreshToken);
    const invalid = new AppError('unauthenticated', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

    if (refreshToken.startsWith('u.')) {
      const [row] = await this.db
        .update(userSessions)
        .set({ refreshTokenHash: sha256(next), prevRefreshTokenHash: hash, lastUsedAt: now })
        .where(and(eq(userSessions.refreshTokenHash, hash), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)))
        .returning({ id: userSessions.id, userId: userSessions.userId });
      if (!row) {
        const [reused] = await this.db.select().from(userSessions).where(and(eq(userSessions.prevRefreshTokenHash, hash), isNull(userSessions.revokedAt)));
        if (reused && !this.withinGrace(reused.lastUsedAt)) {
          await this.db.update(userSessions).set({ revokedAt: now }).where(eq(userSessions.id, reused.id));
          await this.audit.record({ actor: 'system', action: 'auth.refresh.reuse', targetType: 'user_session', targetId: reused.id, metadata: { userId: reused.userId } });
        }
        throw invalid;
      }
      const [u] = await this.db
        .select({ status: users.status, isSystemAdmin: users.isSystemAdmin })
        .from(users)
        .where(eq(users.id, row.userId));
      if (u?.status === 'locked') throw new AppError('forbidden', 'Tài khoản đã bị khoá, vui lòng liên hệ nhà trường');
      const access = await this.tokens.signAccess({
        kind: 'user',
        userId: row.userId,
        sessionId: row.id,
        isSystemAdmin: u?.isSystemAdmin ?? false,
      });
      return { ...access, refreshToken: next };
    }

    if (refreshToken.startsWith('s.')) {
      const [row] = await this.db
        .update(studentSessions)
        .set({ refreshTokenHash: sha256(next), prevRefreshTokenHash: hash, lastSeenAt: now })
        .where(and(eq(studentSessions.refreshTokenHash, hash), isNull(studentSessions.revokedAt), gt(studentSessions.expiresAt, now)))
        .returning({ id: studentSessions.id, studentId: studentSessions.studentId });
      if (!row) {
        const [reused] = await this.db.select().from(studentSessions).where(and(eq(studentSessions.prevRefreshTokenHash, hash), isNull(studentSessions.revokedAt)));
        if (reused && !this.withinGrace(reused.lastSeenAt)) {
          await this.db.update(studentSessions).set({ revokedAt: now }).where(eq(studentSessions.id, reused.id));
          await this.audit.record({ actor: 'system', action: 'auth.refresh.reuse', targetType: 'student_session', targetId: reused.id, studentId: reused.studentId });
        }
        throw invalid;
      }
      const access = await this.tokens.signAccess({ kind: 'student', studentId: row.studentId, sessionId: row.id });
      return { ...access, refreshToken: next };
    }
    throw invalid;
  }

  private withinGrace(lastRotatedAt: Date | null) {
    return lastRotatedAt !== null && this.clock.now().getTime() - lastRotatedAt.getTime() < 30_000;
  }

  async revokeUserSession(sessionId: string) {
    await this.db.update(userSessions).set({ revokedAt: this.clock.now() }).where(eq(userSessions.id, sessionId));
  }

  async revokeStudentSession(sessionId: string) {
    await this.db
      .update(studentSessions)
      .set({ revokedAt: this.clock.now() })
      .where(eq(studentSessions.id, sessionId));
  }

  async listActiveStudentSessions(studentId: string) {
    return this.db
      .select({
        id: studentSessions.id,
        method: studentSessions.method,
        createdAt: studentSessions.createdAt,
        lastSeenAt: studentSessions.lastSeenAt,
        expiresAt: studentSessions.expiresAt,
      })
      .from(studentSessions)
      .where(
        and(
          eq(studentSessions.studentId, studentId),
          isNull(studentSessions.revokedAt),
          gt(studentSessions.expiresAt, this.clock.now()),
        ),
      );
  }
}
