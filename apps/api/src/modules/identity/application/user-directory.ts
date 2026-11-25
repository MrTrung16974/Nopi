import { Inject, Injectable } from '@nestjs/common';
import type { UserProfileDto } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError, DB } from '../../../platform/index.js';

const { users, authIdentities } = schema;
type UserRow = typeof users.$inferSelect;

export const toProfile = (u: UserRow): UserProfileDto => ({
  id: u.id,
  fullName: u.fullName,
  phone: u.phone,
  email: u.email,
  hasPassword: u.passwordHash !== null,
  isSystemAdmin: u.isSystemAdmin,
  needsProfile: u.fullName.trim() === '',
});

/**
 * Danh bạ người lớn. Mô-đun org dùng để tạo tài khoản "được mời" khi nhập danh sách giáo viên
 * hoặc khi tạo quản trị trường — người đó nhận OTP lần đầu là tài khoản tự kích hoạt.
 */
@Injectable()
export class UserDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(userId: string, tx: DbOrTx = this.db): Promise<UserRow> {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw new AppError('not_found', 'Không tìm thấy tài khoản');
    return u;
  }

  async findByPhone(phone: string, tx: DbOrTx = this.db) {
    const [u] = await tx.select().from(users).where(eq(users.phone, phone));
    return u ?? null;
  }

  async findByIds(ids: string[], tx: DbOrTx = this.db) {
    if (ids.length === 0) return [];
    return tx
      .select({ id: users.id, fullName: users.fullName, phone: users.phone, status: users.status })
      .from(users)
      .where(inArray(users.id, ids));
  }

  /** Tìm theo SĐT; chưa có thì tạo tài khoản trạng thái "invited". Có rồi thì giữ nguyên tên đã có. */
  async findOrCreateInvited(input: { fullName: string; phone: string; email?: string }, tx: DbOrTx = this.db) {
    const existing = await this.findByPhone(input.phone, tx);
    if (existing) {
      if (existing.fullName.trim() === '') {
        await tx.update(users).set({ fullName: input.fullName }).where(eq(users.id, existing.id));
      }
      return { id: existing.id, created: false };
    }
    const [u] = await tx
      .insert(users)
      .values({ fullName: input.fullName, phone: input.phone, email: input.email ?? null, status: 'invited' })
      .returning({ id: users.id });
    await tx.insert(authIdentities).values({ userId: u!.id, provider: 'phone', providerUid: input.phone });
    return { id: u!.id, created: true };
  }

  async findByIdentity(provider: 'phone' | 'google' | 'password', uid: string, tx: DbOrTx = this.db) {
    const [row] = await tx
      .select({ user: users })
      .from(authIdentities)
      .innerJoin(users, eq(users.id, authIdentities.userId))
      .where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerUid, uid)));
    return row?.user ?? null;
  }
}
