// Hạ tầng dùng chung: outbox (sự kiện tin cậy), nhật ký truy cập, feature flags
import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, jsonb, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './_common.js';
import { schools } from './org.js';

/**
 * Sự kiện nghiệp vụ ghi CÙNG transaction với dữ liệu, worker đẩy sang hàng đợi.
 * Mô-đun khác (thông báo, báo cáo, gamification sau này) chỉ nghe sự kiện.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    eventType: text().notNull(), // 'SubmissionCreated', 'EvaluationSaved', ...
    aggregateId: text().notNull(),
    schoolId: uuid(),
    payload: jsonb().notNull(),
    attempts: smallint().notNull().default(0),
    lastError: text(),
    createdAt: createdAt(),
    publishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('outbox_pending_idx').on(t.id).where(sql`${t.publishedAt} IS NULL`)],
);

/** Ai xem/sửa dữ liệu học sinh nào, lúc nào. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    schoolId: uuid(),
    actorType: text().notNull(), // 'user' | 'student' | 'system'
    actorId: text().notNull(),
    action: text().notNull(), // 'submission.view', 'evaluation.update', ...
    targetType: text().notNull(),
    targetId: text().notNull(),
    studentId: uuid(),
    metadata: jsonb(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_student_idx').on(t.studentId, t.createdAt),
    index('audit_logs_school_idx').on(t.schoolId, t.createdAt),
  ],
);

/** Bật/tắt tính năng toàn hệ thống hoặc theo không gian (school_id). */
export const featureFlags = pgTable('feature_flags', {
  key: text().notNull(), // 'mascot', 'scan', 'billing', 'zalo_notifications'
  schoolId: uuid().references(() => schools.id),
  enabled: boolean().notNull(),
  rolloutPercent: smallint(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('feature_flags_key_school_uq').on(t.key, t.schoolId).nullsNotDistinct()]);
