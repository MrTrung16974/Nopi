import { z } from 'zod';
import { gradeSchema } from '@nopi/domain';
import { personNameSchema, vnPhoneSchema } from './identity.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export const SCHOOL_ROLES = ['admin', 'teacher', 'guardian_owner'] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const createSchoolSchema = z.object({
  name: z.string().trim().min(3).max(200),
  admin: z.object({ fullName: personNameSchema, phone: vnPhoneSchema }).optional(),
});
export const schoolSchema = z.object({ id: z.uuid(), name: z.string(), kind: z.enum(['school', 'family']) });
export const mySchoolSchema = schoolSchema.extend({ roles: z.array(z.enum(SCHOOL_ROLES)) });

export const createAcademicYearSchema = z
  .object({ name: z.string().regex(/^\d{4}-\d{4}$/, 'Tên năm học dạng 2026-2027'), startsOn: isoDate, endsOn: isoDate })
  .refine((v) => v.startsOn < v.endsOn, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endsOn'] });
export const academicYearSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsOn: isoDate,
  endsOn: isoDate,
});

export const createClassSchema = z.object({
  academicYearId: z.uuid(),
  grade: gradeSchema,
  name: z.string().trim().min(1).max(20),
  homeroomTeacherId: z.uuid().optional(),
});
export const classSchema = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  grade: gradeSchema,
  name: z.string(),
  homeroomTeacherId: z.uuid().nullable(),
  joinCode: z.string().nullable(),
  studentCount: z.number().int(),
});
export type ClassDto = z.infer<typeof classSchema>;

export const createTeacherSchema = z.object({
  fullName: personNameSchema,
  phone: vnPhoneSchema,
  email: z.email().optional(),
});
export const teacherSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  status: z.enum(['invited', 'active', 'locked']),
});

export const createStudentSchema = z.object({
  fullName: personNameSchema,
  nickname: z.string().trim().max(30).optional(),
  birthDate: isoDate.optional(),
});
export const classStudentSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  nickname: z.string().nullable(),
  studentCode: z.string(),
  birthDate: isoDate.nullable(),
  guardianCount: z.number().int(),
  hasPin: z.boolean(),
});

export const assignTeacherSchema = z.object({ teacherId: z.uuid() });
export const teachingSlotSchema = z.object({
  subjectId: z.number().int(),
  subjectCode: z.string(),
  subjectName: z.string(),
  isOptional: z.boolean(),
  teacher: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
});
export const classTeachingSchema = z.object({ classId: z.uuid(), className: z.string(), grade: gradeSchema, slots: z.array(teachingSlotSchema) });

export const studentIdsSchema = z.object({ studentIds: z.array(z.uuid()).optional() });
export const printableCodeSchema = z.object({
  studentId: z.uuid(),
  fullName: z.string(),
  className: z.string(),
  code: z.string(),
  /** Nội dung mã QR (deep link mở app) */
  qrPayload: z.string(),
  expiresAt: z.string(),
});

export const importRowErrorSchema = z.object({ row: z.number().int(), column: z.string().optional(), message: z.string() });
export const importResultSchema = z.object({
  dryRun: z.boolean(),
  total: z.number().int(),
  valid: z.number().int(),
  created: z.number().int(),
  errors: z.array(importRowErrorSchema),
});
export type ImportResult = z.infer<typeof importResultSchema>;

/** Trang chủ học sinh: lớp đang học (trường và/hoặc gia đình) + môn đã có người dạy. */
export const studentHomeSchema = z.object({
  student: z.object({ id: z.uuid(), fullName: z.string(), nickname: z.string().nullable(), avatarKey: z.string().nullable() }),
  /** Khối cao nhất đang học — quyết định chế độ Nhí/Teen */
  grade: gradeSchema.nullable(),
  classes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      grade: gradeSchema,
      schoolName: z.string(),
      schoolKind: z.enum(['school', 'family']),
      subjects: z.array(z.object({ id: z.number().int(), code: z.string(), shortName: z.string(), icon: z.string(), color: z.string() })),
    }),
  ),
});
export type StudentHome = z.infer<typeof studentHomeSchema>;

export const teachingGridSchema = z.array(classTeachingSchema);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:MM');
/** Cài đặt trường/gia đình mà quản trị (hoặc bố mẹ chủ không gian gia đình) được sửa. */
export const spaceSettingsDtoSchema = z.object({
  quietHours: z.object({ start: hhmm, end: hhmm }),
  /** Giờ gửi bản tổng hợp cho giáo viên — gửi theo giờ tròn (phút bỏ qua) */
  teacherDigestTime: hhmm,
  scanQuotaPerDay: z.number().int().min(0).max(500),
  maxVideoSeconds: z.number().int().min(30).max(1800),
  defaultVideoSeconds: z.number().int().min(10).max(1800),
  retentionDays: z.object({
    video: z.number().int().min(30).max(3650),
    photo: z.number().int().min(30).max(3650),
    audio: z.number().int().min(30).max(3650),
    document: z.number().int().min(30).max(3650),
  }),
});
export type SpaceSettingsDto = z.infer<typeof spaceSettingsDtoSchema>;
export const updateSpaceSettingsSchema = spaceSettingsDtoSchema
  .partial()
  .extend({
    quietHours: spaceSettingsDtoSchema.shape.quietHours.partial().optional(),
    retentionDays: spaceSettingsDtoSchema.shape.retentionDays.partial().optional(),
  })
  .refine((v) => !v.defaultVideoSeconds || !v.maxVideoSeconds || v.defaultVideoSeconds <= v.maxVideoSeconds, {
    message: 'Thời lượng mặc định không được dài hơn thời lượng tối đa',
    path: ['defaultVideoSeconds'],
  });
