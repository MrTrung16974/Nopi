// Mô-đun sở hữu: billing — gói, quyền dùng, thanh toán. Mọi kênh đổ về cùng subscriptions.
import { check, index, integer, jsonb, pgTable, text, timestamp, boolean, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import {
  PAYMENT_STATUSES,
  PLAN_BUYERS,
  PLAN_PERIODS,
  SUBSCRIPTION_CHANNELS,
  SUBSCRIPTION_STATUSES,
} from './enums.js';
import { users } from './identity.js';
import { schools } from './org.js';

export const plans = pgTable(
  'plans',
  {
    id: text().primaryKey(), // 'family_monthly', 'family_yearly', 'school_year'
    name: text().notNull(),
    buyer: text().notNull(),
    period: text().notNull(),
    priceVnd: integer().notNull(), // giá web; giá store cấu hình trên App Store / Google Play
    /** Quyền theo gói — code chỉ đọc qua EntitlementService, không bao giờ so plan_id. */
    features: jsonb().notNull(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    check('plans_buyer_chk', inList(t.buyer, PLAN_BUYERS)),
    check('plans_period_chk', inList(t.period, PLAN_PERIODS)),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    planId: text().notNull().references(() => plans.id),
    channel: text().notNull(),
    externalId: text(),
    status: text().notNull(),
    currentPeriodEnd: timestamp({ withTimezone: true }).notNull(),
    autoRenew: boolean().notNull().default(true),
    purchasedBy: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('subscriptions_external_uq').on(t.channel, t.externalId),
    index('subscriptions_school_idx').on(t.schoolId),
    check('subscriptions_channel_chk', inList(t.channel, SUBSCRIPTION_CHANNELS)),
    check('subscriptions_status_chk', inList(t.status, SUBSCRIPTION_STATUSES)),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    subscriptionId: uuid().notNull().references(() => subscriptions.id),
    provider: text().notNull(), // 'apple' | 'google' | 'momo' | 'zalopay' | 'vnpay' | 'bank'
    providerRef: text().notNull(),
    amountVnd: integer().notNull(),
    status: text().notNull(),
    paidAt: timestamp({ withTimezone: true }),
    rawEvent: jsonb(), // bản tin gốc, đã kiểm tra chữ ký
    createdAt: createdAt(),
  },
  (t) => [
    // Webhook idempotent: nhận lại cùng bản tin không tạo dòng mới
    uniqueIndex('payments_provider_ref_uq').on(t.provider, t.providerRef),
    check('payments_status_chk', inList(t.status, PAYMENT_STATUSES)),
  ],
);

/**
 * Đơn mua trên web (cổng thanh toán trong nước). Tạo khi bấm "Thanh toán"; bản tin IPN có chữ ký
 * của cổng chuyển đơn sang "paid" và mở/gia hạn quyền dùng — xử lý idempotent theo (provider, provider_ref).
 */
export const checkoutOrders = pgTable(
  'checkout_orders',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    planId: text().notNull().references(() => plans.id),
    provider: text().notNull(), // 'fake' (dev) | 'momo' | 'zalopay' | 'vnpay'
    amountVnd: integer().notNull(),
    status: text().notNull().default('pending'),
    createdBy: uuid().notNull().references(() => users.id),
    paymentId: uuid().references(() => payments.id),
    createdAt: createdAt(),
    paidAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    check('checkout_orders_status_chk', inList(t.status, ['pending', 'paid', 'failed', 'expired'])),
    index('checkout_orders_school_idx').on(t.schoolId),
  ],
);
