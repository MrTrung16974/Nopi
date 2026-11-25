// Mô-đun sở hữu: scan (quét đề), reporting (xuất báo cáo), notifications
import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import { JOB_STATUSES, NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES } from './enums.js';
import { students, users } from './identity.js';
import { mediaFiles } from './media.js';
import { classes, schools } from './org.js';
import { subjects } from './curriculum.js';
import { assignments } from './assignments.js';

export const scanJobs = pgTable(
  'scan_jobs',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    requestedBy: uuid().references(() => users.id),
    requestedByStudent: uuid().references(() => students.id),
    sourceMediaIds: uuid().array().notNull(),
    imageHash: text().notNull(), // ảnh trùng thì dùng lại kết quả, không tốn lượt
    status: text().notNull().default('queued'),
    engine: text(), // 'vlm' | 'ocr_fallback'
    result: jsonb(),
    assignmentId: uuid().references(() => assignments.id),
    createdAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    check('scan_jobs_status_chk', inList(t.status, JOB_STATUSES)),
    check('scan_jobs_requester_chk', sql`${t.requestedBy} IS NOT NULL OR ${t.requestedByStudent} IS NOT NULL`),
    index('scan_jobs_cache_idx').on(t.schoolId, t.imageHash).where(sql`${t.status} = 'done'`),
  ],
);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    reportType: text().notNull(), // tra trong ReportRegistry: 'class' | 'student' | ...
    format: text().notNull(), // 'xlsx' | 'pdf'
    classId: uuid().references(() => classes.id),
    studentId: uuid().references(() => students.id),
    subjectId: smallint().references(() => subjects.id),
    fromDate: date(),
    toDate: date(),
    fileMediaId: uuid().references(() => mediaFiles.id),
    /** Tham số khác của báo cáo (năm học…) — thêm loại báo cáo không cần thêm cột */
    params: jsonb(),
    status: text().notNull().default('queued'),
    error: text(),
    requestedBy: uuid().notNull().references(() => users.id),
    createdAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [check('export_jobs_status_chk', inList(t.status, JOB_STATUSES)), index('export_jobs_requester_idx').on(t.requestedBy, t.createdAt)],
);

/** Hàng đợi thông báo. send_after đã tính giờ yên lặng; dedupe_key chống gửi trùng. */
export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    schoolId: uuid().references(() => schools.id),
    recipientUserId: uuid().references(() => users.id),
    /** Gửi tới máy riêng của học sinh (không có hộp thư) */
    recipientStudentId: uuid().references(() => students.id),
    title: text().notNull().default(''),
    body: text().notNull().default(''),
    attempts: smallint().notNull().default(0),
    lastError: text(),
    studentId: uuid().references(() => students.id),
    channel: text().notNull(),
    template: text().notNull(), // 'assignment_published', 'teacher_commented', ...
    payload: jsonb().notNull().default({}),
    dedupeKey: text().unique(),
    sendAfter: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: text().notNull().default('pending'),
    sentAt: timestamp({ withTimezone: true }),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('notifications_channel_chk', inList(t.channel, NOTIFICATION_CHANNELS)),
    check('notifications_status_chk', inList(t.status, NOTIFICATION_STATUSES)),
    check('notifications_recipient_chk', sql`${t.recipientUserId} IS NOT NULL OR ${t.recipientStudentId} IS NOT NULL`),
    index('notifications_due_idx').on(t.sendAfter).where(sql`${t.status} = 'pending'`),
    index('notifications_inbox_idx').on(t.recipientUserId, t.createdAt),
  ],
);

/** Tuỳ chọn thông báo của từng người lớn: loại bị tắt vẫn vào hộp thư nhưng không đẩy/nhắn tin. */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id),
  muted: text().array().notNull().default(sql`'{}'::text[]`),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
