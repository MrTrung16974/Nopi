import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@nopi/db';
import { formatCardCode, generateCardCode, LIMITS, normalizeCode, TTL } from '@nopi/domain';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, RateLimiter, secureRandomInt, sha256, type Actor, type Clock } from '../../../platform/index.js';
import { SessionsService } from './sessions.service.js';

const { students, studentLoginCards, guardianInvites } = schema;

export interface IssuedCode {
  studentId: string;
  code: string; // dạng in: ACD-EFG-HJKM
  qrPayload: string;
  expiresAt: Date;
}

/**
 * Thông tin đăng nhập của học sinh và phiếu mời phụ huynh: thẻ QR cá nhân, mã PIN.
 * Mô-đun org gọi issueLoginCards, issueGuardianInvites, setPin sau khi đã kiểm tra quyền giáo viên/quản trị.
 */
@Injectable()
export class StudentCredentialsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditLog,
  ) {}

  private expiry(seconds: number) {
    return new Date(this.clock.now().getTime() + seconds * 1000);
  }

  /** Cấp thẻ QR mới cho các học sinh; thẻ cũ hết hiệu lực ngay ("Cấp lại"). */
  async issueLoginCards(studentIds: string[], actor: Actor): Promise<IssuedCode[]> {
    if (studentIds.length === 0) return [];
    const now = this.clock.now();
    const expiresAt = this.expiry(TTL.loginCard);
    return this.db.transaction(async (tx) => {
      await tx
        .update(studentLoginCards)
        .set({ revokedAt: now })
        .where(and(inArray(studentLoginCards.studentId, studentIds), isNull(studentLoginCards.revokedAt)));
      const issued = studentIds.map((studentId) => ({ studentId, code: generateCardCode(secureRandomInt) }));
      await tx.insert(studentLoginCards).values(
        issued.map((i) => ({
          studentId: i.studentId,
          tokenHash: sha256(i.code),
          expiresAt,
          createdBy: actor.kind === 'user' ? actor.userId : null,
        })),
      );
      return issued.map((i) => ({
        studentId: i.studentId,
        code: formatCardCode(i.code),
        qrPayload: `nopi://student-card/${i.code}`,
        expiresAt,
      }));
    });
  }

  /** Phiếu mời phụ huynh; phiếu cũ của các em đó hết hiệu lực. */
  async issueGuardianInvites(schoolId: string, studentIds: string[], actor: Actor): Promise<IssuedCode[]> {
    if (studentIds.length === 0) return [];
    const now = this.clock.now();
    const expiresAt = this.expiry(TTL.guardianInvite);
    return this.db.transaction(async (tx) => {
      await tx
        .update(guardianInvites)
        .set({ revokedAt: now })
        .where(and(inArray(guardianInvites.studentId, studentIds), isNull(guardianInvites.revokedAt)));
      const issued = studentIds.map((studentId) => ({ studentId, code: generateCardCode(secureRandomInt) }));
      await tx.insert(guardianInvites).values(
        issued.map((i) => ({
          schoolId,
          studentId: i.studentId,
          codeHash: sha256(i.code),
          expiresAt,
          createdBy: actor.kind === 'user' ? actor.userId : null,
        })),
      );
      return issued.map((i) => ({
        studentId: i.studentId,
        code: formatCardCode(i.code),
        qrPayload: `nopi://invite/${i.code}`,
        expiresAt,
      }));
    });
  }

  async setPin(studentId: string, pin: string, actor: Actor) {
    await this.db.update(students).set({ pinHash: await hash(pin) }).where(eq(students.id, studentId));
    await this.limiter.reset(`pin-fail:${studentId}`);
    await this.audit.record({ actor, action: 'student.pin.set', targetType: 'student', targetId: studentId, studentId });
  }

  private profile(s: typeof students.$inferSelect) {
    return { id: s.id, fullName: s.fullName, nickname: s.nickname, avatarKey: s.avatarKey };
  }

  async loginWithCard(rawCode: string) {
    const now = this.clock.now();
    const [card] = await this.db
      .select({ studentId: studentLoginCards.studentId, expiresAt: studentLoginCards.expiresAt })
      .from(studentLoginCards)
      .where(
        and(
          eq(studentLoginCards.tokenHash, sha256(normalizeCode(rawCode))),
          isNull(studentLoginCards.revokedAt),
          gt(studentLoginCards.expiresAt, now),
        ),
      );
    if (!card) throw new AppError('unauthenticated', 'Thẻ không dùng được nữa, con nhờ cô cấp thẻ mới nhé');
    const [s] = await this.db.select().from(students).where(eq(students.id, card.studentId));
    const { sessionId: _sid, ...tokens } = await this.sessions.createStudentSession(card.studentId, 'qr_card', {
      expiresAt: card.expiresAt,
    });
    return { ...tokens, student: this.profile(s!) };
  }

  /** Mã HS + PIN. Sai 5 lần thì khoá 15 phút theo từng học sinh. */
  async loginWithPin(studentCode: string, pin: string) {
    const [s] = await this.db.select().from(students).where(eq(students.studentCode, studentCode));
    const wrong = new AppError('unauthenticated', 'Mã học sinh hoặc mã PIN chưa đúng');
    if (!s?.pinHash) throw wrong;
    const key = `pin-fail:${s.id}`;
    const status = await this.limiter.peek(key, LIMITS.pinFailuresBeforeLock);
    if (!status.allowed) {
      const minutes = Math.ceil(status.retryAfterSeconds / 60);
      throw new AppError('rate_limited', `Nhập sai nhiều lần quá, đợi ${minutes} phút rồi thử lại, hoặc nhờ bố mẹ mở giúp nhé`);
    }
    if (!(await verify(s.pinHash, pin))) {
      await this.limiter.hit(key, LIMITS.pinFailuresBeforeLock, LIMITS.pinLockSeconds);
      throw wrong;
    }
    await this.limiter.reset(key);
    const { sessionId: _sid, ...tokens } = await this.sessions.createStudentSession(s.id, 'pin');
    return { ...tokens, student: this.profile(s) };
  }
}
