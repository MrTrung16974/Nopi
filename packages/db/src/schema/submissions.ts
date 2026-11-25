// Mô-đun sở hữu: submissions (nộp bài) và grading (evaluations)
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import { EVALUATION_LEVELS, GRADING_SCHEME_IDS } from './enums.js';
import { users } from './identity.js';
import { mediaFiles } from './media.js';
import { schools } from './org.js';
import { studentAssignments } from './assignments.js';

/** Mỗi lần nộp; nộp lại = lần mới (attempt_no tăng). */
export const submissions = pgTable(
  'submissions',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    studentAssignmentId: uuid().notNull().references(() => studentAssignments.id),
    attemptNo: smallint().notNull(),
    submittedByGuardian: uuid().references(() => users.id), // khác NULL = phụ huynh nộp hộ
    note: text(),
    isLate: boolean().notNull().default(false),
    submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('submissions_attempt_uq').on(t.studentAssignmentId, t.attemptNo)],
);

export const submissionMedia = pgTable(
  'submission_media',
  {
    submissionId: uuid().notNull().references(() => submissions.id, { onDelete: 'cascade' }),
    mediaId: uuid().notNull().references(() => mediaFiles.id),
    position: smallint().notNull(),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.mediaId] })],
);

/** Nhận xét, chấm điểm. Sửa điểm thì cập nhật updated_at và ghi audit_logs. */
export const evaluations = pgTable(
  'evaluations',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    submissionId: uuid().notNull().unique().references(() => submissions.id),
    teacherId: uuid().notNull().references(() => users.id),
    scheme: text().notNull(),
    level: text(),
    score: numeric({ precision: 4, scale: 2, mode: 'number' }),
    comment: text(),
    commentAudioId: uuid().references(() => mediaFiles.id),
    sticker: text(),
    requiresRedo: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('evaluations_scheme_chk', inList(t.scheme, GRADING_SCHEME_IDS)),
    check('evaluations_level_chk', sql`${t.level} IS NULL OR ${inList(t.level, EVALUATION_LEVELS)}`),
    check('evaluations_score_chk', sql`${t.score} IS NULL OR ${t.score} BETWEEN 0 AND 10`),
    check(
      'evaluations_complete_chk',
      sql`${t.requiresRedo}
        OR (${t.scheme} = 'score_10' AND ${t.score} IS NOT NULL)
        OR (${t.scheme} <> 'score_10' AND ${t.level} IS NOT NULL)`,
    ),
  ],
);
