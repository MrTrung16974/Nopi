import { Inject, Injectable } from '@nestjs/common';
import type { UserAuthResponse } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { normalizeVnPhone } from '@nopi/domain';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { AppError, AuditLog, DB, RateLimiter } from '../../../platform/index.js';
import { GOOGLE_VERIFIER, type GoogleVerifier } from '../ports/google-verifier.js';
import { OtpService } from './otp.service.js';
import { SessionsService, type UserSessionMethod } from './sessions.service.js';
import { toProfile, UserDirectory } from './user-directory.js';

const { users, authIdentities } = schema;
type UserRow = typeof users.$inferSelect;

/** Đăng nhập người lớn: SĐT + OTP, Google, SĐT/email + mật khẩu. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleVerifier,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly directory: UserDirectory,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditLog,
  ) {}

  private async issue(user: UserRow, method: UserSessionMethod, isNewUser: boolean, tx: DbOrTx = this.db): Promise<UserAuthResponse> {
    if (user.status === 'locked') throw new AppError('forbidden', 'Tài khoản đã bị khoá, vui lòng liên hệ nhà trường');
    const tokens = await this.sessions.createUserSession(user, method, {}, tx);
    return { ...tokens, user: toProfile(user), isNewUser };
  }

  /** OTP đúng → tài khoản có sẵn (kể cả "được mời") thì kích hoạt, chưa có thì tạo mới. */
  async loginWithOtp(phone: string, code: string): Promise<UserAuthResponse> {
    await this.otp.verify(phone, code);
    const result = await this.db.transaction(async (tx) => {
      let user: UserRow | null | undefined = await this.directory.findByIdentity('phone', phone, tx);
      let isNew = false;
      if (!user) {
        user = (await this.directory.findByPhone(phone, tx)) ?? null;
        if (!user) {
          [user] = await tx.insert(users).values({ fullName: '', phone, status: 'active' }).returning();
          isNew = true;
        }
        await tx.insert(authIdentities).values({ userId: user!.id, provider: 'phone', providerUid: phone }).onConflictDoNothing();
      }
      if (user!.status === 'invited') {
        [user] = await tx.update(users).set({ status: 'active' }).where(eq(users.id, user!.id)).returning();
      }
      return this.issue(user!, 'otp', isNew, tx);
    });
    await this.audit.record({
      actor: { kind: 'user', userId: result.user.id, sessionId: '', isSystemAdmin: false },
      action: 'auth.login.otp',
      targetType: 'user',
      targetId: result.user.id,
    });
    return result;
  }

  async loginWithGoogle(idToken: string): Promise<UserAuthResponse> {
    const g = await this.google.verify(idToken).catch(() => {
      throw new AppError('unauthenticated', 'Không đăng nhập được bằng Google, vui lòng thử lại');
    });
    return this.db.transaction(async (tx) => {
      let user: UserRow | null | undefined = await this.directory.findByIdentity('google', g.sub, tx);
      let isNew = false;
      if (!user && g.email && g.emailVerified) {
        const [byEmail] = await tx.select().from(users).where(eq(users.email, g.email));
        user = byEmail ?? null;
      }
      if (!user) {
        [user] = await tx
          .insert(users)
          .values({ fullName: g.name ?? '', email: g.emailVerified ? g.email : null, status: 'active' })
          .returning();
        isNew = true;
      }
      await tx.insert(authIdentities).values({ userId: user!.id, provider: 'google', providerUid: g.sub }).onConflictDoNothing();
      if (user!.status === 'invited') {
        [user] = await tx.update(users).set({ status: 'active' }).where(eq(users.id, user!.id)).returning();
      }
      return this.issue(user!, 'google', isNew, tx);
    });
  }

  async loginWithPassword(login: string, password: string): Promise<UserAuthResponse> {
    const key = `pwd-fail:${login.toLowerCase()}`;
    const rl = await this.limiter.peek(key, 10);
    if (!rl.allowed) throw new AppError('rate_limited', 'Bạn đã nhập sai nhiều lần, vui lòng thử lại sau 15 phút hoặc đăng nhập bằng mã OTP');

    const phone = normalizeVnPhone(login);
    const [user] = await this.db
      .select()
      .from(users)
      .where(phone ? eq(users.phone, phone) : eq(users.email, login.trim()));
    const ok = user?.passwordHash ? await verify(user.passwordHash, password) : false;
    if (!user || !ok) {
      await this.limiter.hit(key, 10, 15 * 60);
      throw new AppError('unauthenticated', 'Số điện thoại/email hoặc mật khẩu chưa đúng');
    }
    await this.limiter.reset(key);
    return this.issue(user, 'password', false);
  }

  async setPassword(userId: string, password: string) {
    await this.db.update(users).set({ passwordHash: await hash(password) }).where(eq(users.id, userId));
  }

  async updateProfile(userId: string, fullName: string) {
    const [u] = await this.db.update(users).set({ fullName }).where(eq(users.id, userId)).returning();
    return toProfile(u!);
  }

  /** Dùng cho đăng nhập web bằng QR: app đã duyệt, cấp phiên mới cho trình duyệt. */
  async issueForQrWeb(userId: string): Promise<UserAuthResponse> {
    return this.issue(await this.directory.get(userId), 'qr_web', false);
  }
}
