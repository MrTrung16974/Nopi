// Mô-đun sở hữu: assignments — bài tập, từng câu, bài của từng em
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import {
  ASSIGNMENT_KINDS,
  ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUSES,
  GRADING_SCHEME_IDS,
  ITEM_TYPES,
  STUDENT_ASSIGNMENT_STATUSES,
} from './enums.js';
import { students, users } from './identity.js';
import { mediaFiles } from './media.js';
import { schools, teachingAssignments } from './org.js';
import { subjects } from './curriculum.js';

/** Một lần "Giao bài" cho nhiều lớp (4A, 4B, 4C): mỗi lớp một assignment, chung một batch. */
export const assignmentBatches = pgTable('assignment_batches', {
  id: pk(),
  schoolId: uuid().notNull().references(() => schools.id),
  createdBy: uuid().notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const assignments = pgTable(
  'assignments',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    batchId: uuid().references(() => assignmentBatches.id),
    teachingAssignmentId: uuid().references(() => teachingAssignments.id),
    ownerStudentId: uuid().references(() => students.id), // bài tự luyện lớp 6–9
    /** Môn của bài tự luyện (bài của giáo viên lấy môn từ phân công) */
    practiceSubjectId: smallint().references(() => subjects.id),
    kind: text().notNull().default('homework'),
    source: text().notNull().default('manual'),
    title: text().notNull(),
    instructions: text(),
    instructionsAudioId: uuid().references(() => mediaFiles.id), // cô ghi âm đọc đề
    originalMediaIds: uuid().array(), // ảnh gốc trang đã quét — luôn đính kèm
    submissionKinds: text().array().notNull(),
    maxPhotos: smallint().notNull().default(5),
    maxMediaSeconds: smallint().notNull().default(120),
    gradingScheme: text().notNull(),
    publishAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    allowLate: boolean().notNull().default(true),
    /** Chỉ giao cho vài em; NULL = cả lớp (tính lúc giao, kể cả khi hẹn giờ) */
    recipientStudentIds: uuid().array(),
    status: text().notNull().default('draft'),
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('assignments_owner_chk', sql`${t.teachingAssignmentId} IS NOT NULL OR ${t.ownerStudentId} IS NOT NULL`),
    check('assignments_media_cap_chk', sql`${t.maxMediaSeconds} BETWEEN 1 AND 1800`),
    check('assignments_kinds_nonempty_chk', sql`cardinality(${t.submissionKinds}) > 0`),
    check(
      'assignments_kinds_chk',
      sql`${t.submissionKinds} <@ ARRAY['photo','video','audio','document']::text[]`,
    ),
    check('assignments_kind_chk', inList(t.kind, ASSIGNMENT_KINDS)),
    check('assignments_source_chk', inList(t.source, ASSIGNMENT_SOURCES)),
    check('assignments_status_chk', inList(t.status, ASSIGNMENT_STATUSES)),
    check('assignments_scheme_chk', inList(t.gradingScheme, GRADING_SCHEME_IDS)),
    index('assignments_ta_idx').on(t.teachingAssignmentId, t.dueAt),
    index('assignments_publish_idx').on(t.publishAt).where(sql`${t.status} = 'scheduled'`),
  ],
);

/** Từng câu trong đề (soạn tay hoặc AI tách khi quét). */
export const assignmentItems = pgTable(
  'assignment_items',
  {
    id: pk(),
    assignmentId: uuid().notNull().references(() => assignments.id, { onDelete: 'cascade' }),
    position: smallint().notNull(),
    itemType: text().notNull(),
    promptText: text(),
    promptLatex: text(),
    promptMediaId: uuid().references(() => mediaFiles.id),
    options: jsonb(),
    aiConfidence: numeric({ precision: 3, scale: 2, mode: 'number' }),
  },
  (t) => [
    uniqueIndex('assignment_items_position_uq').on(t.assignmentId, t.position),
    check('assignment_items_type_chk', inList(t.itemType, ITEM_TYPES)),
  ],
);

/**
 * Bảng trung tâm: bài của từng em + trạng thái. Trang chủ học sinh và màn chấm
 * chỉ cần một truy vấn có chỉ mục; em chuyển lớp giữa năm vẫn giữ bài cũ.
 */
export const studentAssignments = pgTable(
  'student_assignments',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    assignmentId: uuid().notNull().references(() => assignments.id),
    studentId: uuid().notNull().references(() => students.id),
    status: text().notNull().default('assigned'),
    lastSubmittedAt: timestamp({ withTimezone: true }),
    isLate: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('student_assignments_uq').on(t.assignmentId, t.studentId),
    index('student_assignments_home_idx').on(t.studentId, t.status),
    index('student_assignments_grading_idx').on(t.assignmentId, t.status),
    check('student_assignments_status_chk', inList(t.status, STUDENT_ASSIGNMENT_STATUSES)),
  ],
);
