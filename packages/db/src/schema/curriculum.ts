// Mô-đun sở hữu: curriculum — danh mục môn theo khối là DỮ LIỆU, không viết cứng trong code
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  smallserial,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import { GRADING_SCHEME_IDS } from './enums.js';
import { users } from './identity.js';
import { schools } from './org.js';

export const subjects = pgTable('subjects', {
  id: smallserial().primaryKey(),
  code: text().notNull().unique(), // 'TOAN', 'TIENG_VIET', 'AM_NHAC'
  name: text().notNull(),
  shortName: text().notNull(), // tên trên ô môn học: 'Tiếng Anh'
  groupCode: text(), // 'NGHE_THUAT' gom Âm nhạc + Mĩ thuật
  icon: text().notNull(),
  color: text().notNull(),
});

/** Chương trình GDPT 2018: khối nào học môn nào, thang đánh giá mặc định theo TT27/TT22. */
export const gradeSubjects = pgTable(
  'grade_subjects',
  {
    grade: smallint().notNull(),
    subjectId: smallint()
      .notNull()
      .references(() => subjects.id),
    isOptional: boolean().notNull().default(false),
    gradingScheme: text().notNull(),
    sortOrder: smallint().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.grade, t.subjectId] }),
    check('grade_subjects_grade_chk', sql`${t.grade} BETWEEN 1 AND 9`),
    check('grade_subjects_scheme_chk', inList(t.gradingScheme, GRADING_SCHEME_IDS)),
  ],
);

/** Câu nhận xét mẫu: của hệ thống (owner NULL) hoặc của riêng giáo viên. */
export const commentTemplates = pgTable(
  'comment_templates',
  {
    id: pk(),
    ownerUserId: uuid().references(() => users.id),
    subjectId: smallint().references(() => subjects.id),
    stage: text(), // 'primary' | 'lower_secondary' | NULL = mọi cấp
    text: text().notNull(),
    sortOrder: smallint().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('comment_templates_owner_idx').on(t.ownerUserId)],
);

/** Mẫu bài (Đọc bài, Bài tập trong vở…): của hệ thống, của trường, hoặc của giáo viên. */
export const assignmentTemplates = pgTable('assignment_templates', {
  id: pk(),
  schoolId: uuid().references(() => schools.id),
  ownerUserId: uuid().references(() => users.id),
  code: text(), // mẫu hệ thống: 'READ_ALOUD', 'NOTEBOOK', ...
  name: text().notNull(),
  suggestedSubjectCodes: text().array().notNull().default(sql`'{}'::text[]`),
  /** { submissionKinds, maxPhotos, maxMediaSeconds, instructions? } */
  defaults: jsonb().notNull(),
  createdAt: createdAt(),
});
