// Mô-đun sở hữu: org — trường/gia đình, năm học, lớp, ghi danh, phân công
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, inList, pk } from './_common.js';
import { ENROLLMENT_STATUSES, MEMBER_ROLES, SCHOOL_STATUSES, SPACE_KINDS } from './enums.js';
import { students, users } from './identity.js';
import { subjects } from './curriculum.js';

/**
 * "Không gian": trường (kind=school) hoặc gia đình (kind=family). Mọi bảng nghiệp vụ
 * có school_id để lọc theo tenant và bật Row-Level Security về sau.
 */
export const schools = pgTable(
  'schools',
  {
    id: pk(),
    kind: text().notNull().default('school'),
    name: text().notNull(),
    /** active | locked — quản trị hệ thống khoá/mở (mục quản trị hệ thống) */
    status: text().notNull().default('active'),
    /** Xem SpaceSettings trong @nopi/domain — luôn đọc qua resolveSpaceSettings(). */
    settings: jsonb().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [check('schools_kind_chk', inList(t.kind, SPACE_KINDS)), check('schools_status_chk', inList(t.status, SCHOOL_STATUSES))],
);

export const schoolMembers = pgTable(
  'school_members',
  {
    schoolId: uuid().notNull().references(() => schools.id),
    userId: uuid().notNull().references(() => users.id),
    role: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.schoolId, t.userId, t.role] }),
    index('school_members_user_idx').on(t.userId),
    check('school_members_role_chk', inList(t.role, MEMBER_ROLES)),
  ],
);

export const academicYears = pgTable(
  'academic_years',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    name: text().notNull(), // '2026-2027'
    startsOn: date().notNull(),
    endsOn: date().notNull(),
  },
  (t) => [
    uniqueIndex('academic_years_school_name_uq').on(t.schoolId, t.name),
    check('academic_years_range_chk', sql`${t.startsOn} < ${t.endsOn}`),
  ],
);

export const classes = pgTable(
  'classes',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    academicYearId: uuid().notNull().references(() => academicYears.id),
    grade: smallint().notNull(),
    name: text().notNull(), // '3A'
    homeroomTeacherId: uuid().references(() => users.id),
    joinCode: text().unique(), // mã 6 ký tự cho phụ huynh tự xin vào lớp
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('classes_year_name_uq').on(t.academicYearId, t.name),
    check('classes_grade_chk', sql`${t.grade} BETWEEN 1 AND 9`),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    studentId: uuid().notNull().references(() => students.id),
    classId: uuid().notNull().references(() => classes.id),
    academicYearId: uuid().notNull().references(() => academicYears.id),
    status: text().notNull().default('active'),
    joinedOn: date().notNull().defaultNow(),
    leftOn: date(),
  },
  (t) => [
    // Mỗi học sinh chỉ có một lớp đang học trong một năm học
    uniqueIndex('enrollments_one_active_per_year_uq')
      .on(t.studentId, t.academicYearId)
      .where(sql`${t.status} = 'active'`),
    index('enrollments_class_idx').on(t.classId, t.status),
    check('enrollments_status_chk', inList(t.status, ENROLLMENT_STATUSES)),
  ],
);

/**
 * Giáo viên (hoặc phụ huynh trong không gian gia đình) dạy môn X ở lớp Y.
 * Có hiệu lực theo thời gian: đổi giáo viên giữa năm = đóng dòng cũ (valid_to) + mở dòng mới,
 * nên bài đã giao vẫn thuộc về phân công cũ.
 */
export const teachingAssignments = pgTable(
  'teaching_assignments',
  {
    id: pk(),
    schoolId: uuid().notNull().references(() => schools.id),
    teacherId: uuid().notNull().references(() => users.id),
    classId: uuid().notNull().references(() => classes.id),
    subjectId: smallint().notNull().references(() => subjects.id),
    validFrom: date().notNull().defaultNow(),
    validTo: date(),
  },
  (t) => [
    // Mỗi lớp–môn một người phụ trách tại một thời điểm; một giáo viên nhận bao nhiêu lớp–môn cũng được
    uniqueIndex('teaching_assignments_current_uq')
      .on(t.classId, t.subjectId)
      .where(sql`${t.validTo} IS NULL`),
    index('teaching_assignments_teacher_idx').on(t.teacherId),
  ],
);
