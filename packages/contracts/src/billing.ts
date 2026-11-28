import { z } from 'zod';
import { gradeSchema } from '@nopi/domain';

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  period: z.enum(['month', 'year', 'school_year']),
  priceVnd: z.number().int(),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])),
});

export const entitlementSchema = z.object({
  /** Có quyền dùng tính năng trả phí không (đang dùng thử / đã mua / trong hạn) */
  active: z.boolean(),
  status: z.enum(['none', 'trial', 'active', 'grace', 'canceled', 'expired']),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  channel: z.enum(['apple', 'google', 'web', 'contract']).nullable(),
  currentPeriodEnd: z.string().nullable(),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])),
});
export type EntitlementDto = z.infer<typeof entitlementSchema>;

export const WEB_PAYMENT_PROVIDERS = ['fake', 'momo', 'zalopay', 'vnpay'] as const;
export const checkoutSchema = z.object({
  schoolId: z.uuid(),
  planId: z.string(),
  provider: z.enum(WEB_PAYMENT_PROVIDERS),
  /** Trang quay về sau khi thanh toán (web) */
  returnUrl: z.url().optional(),
});
/** Cổng thanh toán web đang bật trên server (GET /billing/payment-methods). Rỗng = chưa mở bán trên web. */
export const PAYMENT_PROVIDER_NAMES: Record<(typeof WEB_PAYMENT_PROVIDERS)[number], string> = {
  fake: 'Thanh toán thử (dev)',
  momo: 'Ví MoMo',
  zalopay: 'ZaloPay',
  vnpay: 'VNPay (thẻ ATM / QR ngân hàng)',
};
export const paymentMethodSchema = z.object({ id: z.enum(WEB_PAYMENT_PROVIDERS), name: z.string() });
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const checkoutResponseSchema = z.object({ orderId: z.uuid(), payUrl: z.string() });
export const orderStatusSchema = z.object({ orderId: z.uuid(), status: z.enum(['pending', 'paid', 'failed', 'expired']) });

/** Xác minh giao dịch trong app (StoreKit 2 / Google Play Billing). */
export const storeVerifySchema = z.object({
  schoolId: z.uuid(),
  platform: z.enum(['apple', 'google']),
  productId: z.string(),
  /** iOS: signedTransaction (JWS) · Android: purchaseToken */
  token: z.string().min(10),
});

export const grantContractSchema = z.object({ planId: z.string().default('school_year'), externalId: z.string().min(1).max(100) });

// ===== Không gian gia đình =====
export const familyChildSchema = z.object({
  studentId: z.uuid(),
  fullName: z.string(),
  nickname: z.string().nullable(),
  classId: z.uuid(),
  grade: gradeSchema,
  /** Các lớp–môn bố mẹ "dạy" — dùng để giao bài */
  teachingAssignmentIds: z.array(z.uuid()),
});
export const familySpaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  children: z.array(familyChildSchema),
  entitlement: entitlementSchema,
});
export type FamilySpaceDto = z.infer<typeof familySpaceSchema>;

export const addFamilyChildSchema = z.union([
  /** Con đã liên kết (đang học ở trường): dùng lại hồ sơ */
  z.object({ studentId: z.uuid(), grade: gradeSchema.optional() }),
  /** Con chưa vào trường nào dùng Nopi: tạo hồ sơ mới trong gia đình */
  z.object({ fullName: z.string().trim().min(2).max(100), nickname: z.string().trim().max(30).optional(), grade: gradeSchema }),
]);
