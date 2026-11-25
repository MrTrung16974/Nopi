/**
 * Cấp quyền quản trị hệ thống cho một SĐT (tạo tài khoản "được mời" nếu chưa có).
 *   pnpm --filter @nopi/api grant-system-admin 0912345678 "Nguyễn Văn A"
 * Người đó đăng nhập bằng OTP như bình thường.
 */
import { createDb, schema } from '@nopi/db';
import { normalizeVnPhone } from '@nopi/domain';
import { eq } from 'drizzle-orm';

const [rawPhone, name = 'Quản trị hệ thống'] = process.argv.slice(2);
const phone = rawPhone ? normalizeVnPhone(rawPhone) : null;
if (!phone) {
  console.error('Cách dùng: grant-system-admin <SĐT> ["Họ tên"]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Thiếu DATABASE_URL');

const { db, close } = createDb(url, { max: 1 });
try {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
  if (existing) {
    await db.update(schema.users).set({ isSystemAdmin: true }).where(eq(schema.users.id, existing.id));
  } else {
    const [u] = await db.insert(schema.users).values({ fullName: name, phone, status: 'invited', isSystemAdmin: true }).returning();
    await db.insert(schema.authIdentities).values({ userId: u!.id, provider: 'phone', providerUid: phone });
  }
  console.log(`✔ ${phone} là quản trị hệ thống. Đăng nhập bằng OTP (đăng nhập lại nếu đang mở app).`);
} finally {
  await close();
}
