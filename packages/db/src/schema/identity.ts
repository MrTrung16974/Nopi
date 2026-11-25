// Mô-đun sở hữu: identity — người lớn, học sinh, phụ huynh, đăng nhập
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, createdAt, inList, pk } from './_common.js';
import { AUTH_PROVIDERS, USER_STATUSES } from './enums.js';
import { schools } from './org.js';

/** Người lớn: phụ huynh, giáo viên, quản trị. Một người có thể có nhiều vai trò. */
export const users = pgTable(
  'users',
  {
    id: pk(),
    fullName: text().notNull(),
    phone: text().unique(), // E.164: +84...
    email: citext().unique(),
    passwordHash: text(), // argon2id; NULL nếu chỉ dùng OTP/Google
    status: text().notNull().default('active'),
    /** Quản trị hệ thống (nội bộ đơn vị vận hành): tạo trường, sửa danh mục, hỗ trợ */
    isSystemAdmin: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [check('users_status_chk', inList(t.status, USER_STATUSES))],
);

/** Một người, nhiều cách đăng nhập. Thêm nhà cung cấp mới = thêm giá trị provider. */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: pk(),
    userId: uuid().notNull().references(() => users.id),
    provider: text().notNull(),
    providerUid: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_uq').on(t.provider, t.providerUid),
    check('auth_identities_provider_chk', inList(t.provider, AUTH_PROVIDERS)),
  ],
);

/**
 * Học sinh là hồ sơ, không phải tài khoản người lớn. home_school_id là nơi tạo hồ sơ
 * (trường hoặc gia đình); việc học ở đâu đi qua enrollments.
 */
export const students = pgTable(
  'students',
  {
    id: pk(),
    homeSchoolId: uuid().references(() => schools.id),
    studentCode: text().notNull(), // 8 chữ số, duy nhất toàn hệ thống — đăng nhập lớp 4–9
    fullName: text().notNull(),
    nickname: text(), // "Bống" — dùng trong lời chào chế độ Nhí
    birthDate: date(),
    avatarKey: text(),
    pinHash: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('students_code_uq').on(t.studentCode), index('students_home_school_idx').on(t.homeSchoolId)],
);

/** Phụ huynh ↔ học sinh (nhiều–nhiều), kèm đồng ý xử lý dữ liệu theo Luật BVDLCN 2025. */
export const guardians = pgTable(
  'guardians',
  {
    studentId: uuid().notNull().references(() => students.id),
    userId: uuid().notNull().references(() => users.id),
    relationship: text().notNull(), // mẹ, bố, ông, bà…
    policyVersion: text(),
    consentedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.userId] }), index('guardians_user_idx').on(t.userId)],
);

/** Thẻ QR cá nhân. Chỉ lưu hash; cấp lại thì revoke thẻ cũ. */
export const studentLoginCards = pgTable(
  'student_login_cards',
  {
    id: pk(),
    studentId: uuid().notNull().references(() => students.id),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('student_login_cards_one_active_uq')
      .on(t.studentId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/** Phiên đăng nhập dài hạn của học sinh trên từng máy — phụ huynh thu hồi được từ xa. */
export const studentSessions = pgTable(
  'student_sessions',
  {
    id: pk(),
    studentId: uuid().notNull().references(() => students.id),
    deviceId: uuid().references(() => devices.id),
    method: text().notNull(), // 'guardian_device' | 'qr_card' | 'pin' | 'picture_password'
    refreshTokenHash: text().notNull().unique(),
    /** Token ngay trước lần xoay gần nhất — bị dùng lại = token đã lộ → thu hồi cả phiên */
    prevRefreshTokenHash: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('student_sessions_student_idx').on(t.studentId), index('student_sessions_prev_rt_idx').on(t.prevRefreshTokenHash)],
);

/** Thiết bị nhận thông báo đẩy. */
export const devices = pgTable(
  'devices',
  {
    id: pk(),
    userId: uuid().references(() => users.id),
    /** Máy riêng của học sinh (lớp 4–9 đăng nhập bằng thẻ/PIN) */
    studentId: uuid().references(() => students.id),
    platform: text().notNull(), // 'ios' | 'android' | 'web'
    pushToken: text().unique(),
    appVersion: text(),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('devices_user_idx').on(t.userId), index('devices_student_idx').on(t.studentId)],
);

/** Phiên đăng nhập của người lớn (refresh token xoay vòng, giữ 90 ngày). */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: pk(),
    userId: uuid().notNull().references(() => users.id),
    refreshTokenHash: text().notNull().unique(),
    /** Token ngay trước lần xoay gần nhất — bị dùng lại = token đã lộ → thu hồi cả phiên */
    prevRefreshTokenHash: text(),
    method: text().notNull(), // 'otp' | 'google' | 'password' | 'qr_web'
    deviceId: uuid().references(() => devices.id),
    userAgent: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('user_sessions_user_idx').on(t.userId), index('user_sessions_prev_rt_idx').on(t.prevRefreshTokenHash)],
);

/**
 * Phiếu mời phụ huynh (QR + mã) in cho từng học sinh. Chỉ lưu hash của mã;
 * in lại = tạo phiếu mới, phiếu cũ hết hiệu lực.
 */
export const guardianInvites = pgTable(
  'guardian_invites',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    studentId: uuid().notNull().references(() => students.id),
    codeHash: text().notNull().unique(),
    createdBy: uuid().references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    /** Một phiếu dùng được cho nhiều người (bố và mẹ cùng quét) cho tới khi hết hạn. */
    claimCount: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('guardian_invites_student_idx').on(t.studentId)],
);
