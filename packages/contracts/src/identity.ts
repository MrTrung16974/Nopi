import { z } from 'zod';
import { CURRENT_POLICY_VERSION, checkPin, normalizePersonName, normalizeVnPhone, PIN_PROBLEM_MESSAGES } from '@nopi/domain';

/** SĐT người dùng gõ kiểu gì cũng được — chuẩn hoá về +84… ngay khi kiểm tra. */
export const vnPhoneSchema = z.string().transform((v, ctx) => {
  const p = normalizeVnPhone(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'Số điện thoại chưa đúng, ví dụ: 0912 345 678' });
    return z.NEVER;
  }
  return p;
});

export const pinSchema = z.string().superRefine((v, ctx) => {
  const problem = checkPin(v);
  if (problem) ctx.addIssue({ code: 'custom', message: PIN_PROBLEM_MESSAGES[problem] });
});

/** Họ tên: bỏ khoảng trắng thừa, viết hoa chữ cái đầu ("trần  thị lan" → "Trần Thị Lan") — giống khi nhập Excel. */
export const personNameSchema = z.string().trim().min(2, 'Họ tên quá ngắn').max(100).transform(normalizePersonName);

// ===== Đăng nhập người lớn =====
export const otpRequestSchema = z.object({ phone: vnPhoneSchema });
export const otpRequestResponseSchema = z.object({
  expiresIn: z.number(),
  channel: z.string(),
  maskedPhone: z.string(),
});
export const otpVerifySchema = z.object({ phone: vnPhoneSchema, code: z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số') });
export const googleLoginSchema = z.object({ idToken: z.string().min(10) });
export const passwordLoginSchema = z.object({
  login: z.string().min(3), // SĐT hoặc email
  password: z.string().min(1),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export const setPasswordSchema = z.object({ password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự').max(128) });
export const updateProfileSchema = z.object({ fullName: personNameSchema });

export const userProfileSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  hasPassword: z.boolean(),
  isSystemAdmin: z.boolean(),
  /** Đăng ký lần đầu bằng OTP, chưa có tên → app hỏi tên */
  needsProfile: z.boolean(),
});
export type UserProfileDto = z.infer<typeof userProfileSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export const userAuthResponseSchema = authTokensSchema.extend({ user: userProfileSchema, isNewUser: z.boolean() });
export type UserAuthResponse = z.infer<typeof userAuthResponseSchema>;

// ===== Đăng nhập web bằng QR từ app (giống Zalo Web) =====
export const qrLoginStartResponseSchema = z.object({
  loginId: z.string(),
  pollSecret: z.string(),
  qrPayload: z.string(),
  expiresIn: z.number(),
});
export const qrLoginPollSchema = z.object({ pollSecret: z.string() });
export const qrLoginPollResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('approved'), auth: userAuthResponseSchema }),
]);

// ===== Phụ huynh & con =====
export const RELATIONSHIPS = ['me', 'bo', 'ong', 'ba', 'anh_chi', 'nguoi_giam_ho'] as const;
export const RELATIONSHIP_LABELS: Record<(typeof RELATIONSHIPS)[number], string> = {
  me: 'Mẹ',
  bo: 'Bố',
  ong: 'Ông',
  ba: 'Bà',
  anh_chi: 'Anh/chị',
  nguoi_giam_ho: 'Người giám hộ',
};

export const acceptPolicySchema = z
  .string()
  .refine((v) => v === CURRENT_POLICY_VERSION, 'Vui lòng đọc và đồng ý điều khoản mới nhất');

export const claimInviteSchema = z.object({
  code: z.string().min(6),
  relationship: z.enum(RELATIONSHIPS),
  acceptPolicyVersion: acceptPolicySchema,
});
export const consentSchema = z.object({ acceptPolicyVersion: acceptPolicySchema });

export const childSchema = z.object({
  studentId: z.uuid(),
  fullName: z.string(),
  nickname: z.string().nullable(),
  avatarKey: z.string().nullable(),
  relationship: z.string(),
  /** Điều khoản đã đổi → phụ huynh cần đồng ý lại trước khi cho con học */
  needsConsent: z.boolean(),
});
export type ChildDto = z.infer<typeof childSchema>;

export const meResponseSchema = userProfileSchema.extend({ children: z.array(childSchema) });
export type MeResponse = z.infer<typeof meResponseSchema>;

// ===== Học sinh =====
export const studentCardLoginSchema = z.object({ code: z.string().min(6) });
export const studentPinLoginSchema = z.object({
  studentCode: z.string().regex(/^\d{8}$/, 'Mã học sinh gồm 8 chữ số'),
  pin: z.string().regex(/^\d{6}$/, 'Mã PIN gồm 6 chữ số'),
});
export const setPinSchema = z.object({ pin: pinSchema });

export const studentProfileSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  nickname: z.string().nullable(),
  avatarKey: z.string().nullable(),
});
export const studentAuthResponseSchema = authTokensSchema.extend({ student: studentProfileSchema });
export type StudentAuthResponse = z.infer<typeof studentAuthResponseSchema>;

export const studentSessionSchema = z.object({
  id: z.uuid(),
  method: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  expiresAt: z.string(),
});
