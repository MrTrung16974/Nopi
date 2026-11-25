import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export const REPORT_TYPES = ['class', 'student', 'school'] as const;
export const REPORT_FORMATS = ['xlsx', 'pdf'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/**
 * - class: báo cáo lớp (mỗi dòng một em, mỗi cột một bài), có thể lọc theo môn
 * - student: lịch sử bài + nhận xét của một em theo môn (họp phụ huynh; phụ huynh tự tải được)
 * - school: tỉ lệ nộp bài theo lớp × môn (quản trị trường)
 */
export const createReportSchema = z
  .object({
    type: z.enum(REPORT_TYPES),
    format: z.enum(REPORT_FORMATS),
    classId: z.uuid().optional(),
    studentId: z.uuid().optional(),
    schoolId: z.uuid().optional(),
    academicYearId: z.uuid().optional(),
    subjectId: z.number().int().optional(),
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.from <= v.to, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] })
  .refine((v) => (v.type === 'class' ? Boolean(v.classId) : v.type === 'student' ? Boolean(v.studentId) : Boolean(v.schoolId && v.academicYearId)), {
    message: 'Thiếu lớp, học sinh hoặc trường cần xuất báo cáo',
  });
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const reportJobSchema = z.object({
  id: z.uuid(),
  type: z.enum(REPORT_TYPES),
  format: z.enum(REPORT_FORMATS),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  /** Link tải có hạn vài phút; null khi chưa xong hoặc đã quá 24 giờ */
  downloadUrl: z.string().nullable(),
  fileName: z.string().nullable(),
  expiresAt: z.string(),
  error: z.string().nullable(),
});
export type ReportJobDto = z.infer<typeof reportJobSchema>;

export const submissionStatsQuerySchema = z
  .object({ academicYearId: z.uuid(), from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] });

/** Tỉ lệ nộp bài theo lớp × môn (màn quản trị). */
export const submissionStatsSchema = z.object({
  rows: z.array(
    z.object({
      classId: z.uuid(),
      className: z.string(),
      subjectId: z.number().int(),
      subjectName: z.string(),
      teacherName: z.string().nullable(),
      assignments: z.number().int(),
      /** Lượt bài đã đến hạn của các em */
      expected: z.number().int(),
      submitted: z.number().int(),
      late: z.number().int(),
      /** 0..1, null nếu chưa có bài đến hạn */
      rate: z.number().nullable(),
    }),
  ),
});

export const auditLogQuerySchema = z.object({
  studentId: z.uuid().optional(),
  action: z.string().max(60).optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const auditLogSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      at: z.string(),
      actorType: z.string(),
      actorName: z.string(),
      action: z.string(),
      targetType: z.string(),
      studentName: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  nextBefore: z.number().int().nullable(),
});
