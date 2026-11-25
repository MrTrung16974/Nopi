import { z } from 'zod';
import { gradeSchema, GRADING_SCHEME_IDS, MEDIA_KINDS, MAX_MEDIA_SECONDS_CAP, STICKER_IDS } from '@nopi/domain';
import { mediaViewSchema } from './media.js';
import { assignmentItemSchema } from './scan.js';

const isoDateTime = z.iso.datetime({ offset: true });

export const createAssignmentSchema = z
  .object({
    /** Giao một lần cho nhiều lớp (4A, 4B, 4C): mỗi phần tử là một phân công lớp–môn */
    teachingAssignmentIds: z.array(z.uuid()).min(1).max(20),
    title: z.string().trim().min(1, 'Nhập tên bài').max(200),
    instructions: z.string().trim().max(5000).optional(),
    instructionsAudioId: z.uuid().optional(),
    submissionKinds: z.array(z.enum(MEDIA_KINDS)).min(1, 'Chọn ít nhất một cách nộp'),
    maxPhotos: z.number().int().min(1).max(10).default(5),
    maxMediaSeconds: z.number().int().min(10).max(MAX_MEDIA_SECONDS_CAP).default(120),
    /** Bỏ trống = thang mặc định của môn theo TT27/TT22 */
    gradingScheme: z.enum(GRADING_SCHEME_IDS).optional(),
    /** Bỏ trống = 20:00 ngày mai */
    dueAt: isoDateTime.optional(),
    /** Bỏ trống = giao ngay; thời điểm tương lai = hẹn giờ giao */
    publishAt: isoDateTime.optional(),
    allowLate: z.boolean().default(true),
    /** Chỉ giao cho vài em (chỉ dùng khi giao cho một lớp) */
    studentIds: z.array(z.uuid()).min(1).optional(),
    source: z.enum(['manual', 'template', 'copy', 'scan']).default('manual'),
    /** Các câu trong đề (soạn tay hoặc từ ảnh quét đã soát) */
    items: z.array(assignmentItemSchema).max(60).optional(),
    /** Ảnh gốc trang đã quét — luôn đính kèm để AI có đọc sai thì học sinh vẫn có đề đúng */
    originalMediaIds: z.array(z.uuid()).max(5).optional(),
    scanJobId: z.uuid().optional(),
  })
  .refine((v) => !v.studentIds || v.teachingAssignmentIds.length === 1, {
    message: 'Chọn từng em chỉ áp dụng khi giao cho một lớp',
    path: ['studentIds'],
  });
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

const classRef = z.object({ id: z.uuid(), name: z.string(), grade: gradeSchema });
const subjectRef = z.object({ id: z.number().int(), code: z.string(), shortName: z.string(), color: z.string(), icon: z.string() });

export const assignmentStatsSchema = z.object({
  total: z.number().int(),
  notSubmitted: z.number().int(),
  submitted: z.number().int(),
  returned: z.number().int(),
  graded: z.number().int(),
  late: z.number().int(),
});

export const teacherAssignmentSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid().nullable(),
  teachingAssignmentId: z.uuid(),
  title: z.string(),
  instructions: z.string().nullable(),
  instructionsAudio: mediaViewSchema.nullable(),
  submissionKinds: z.array(z.enum(MEDIA_KINDS)),
  maxPhotos: z.number().int(),
  maxMediaSeconds: z.number().int(),
  gradingScheme: z.enum(GRADING_SCHEME_IDS),
  publishAt: z.string(),
  dueAt: z.string(),
  allowLate: z.boolean(),
  status: z.enum(['draft', 'scheduled', 'published', 'closed']),
  class: classRef,
  subject: subjectRef,
  stats: assignmentStatsSchema,
});
export type TeacherAssignment = z.infer<typeof teacherAssignmentSchema>;

export const teacherOverviewSchema = z.object({
  toGrade: z.number().int(),
  teaching: z.array(
    z.object({
      teachingAssignmentId: z.uuid(),
      class: classRef,
      subject: subjectRef,
      studentCount: z.number().int(),
      openAssignments: z.number().int(),
      toGrade: z.number().int(),
    }),
  ),
});
export type TeacherOverview = z.infer<typeof teacherOverviewSchema>;

/** Trạng thái hiển thị: thêm "overdue" (chỉ phụ huynh/giáo viên thấy). */
export const displayStatusSchema = z.enum(['assigned', 'submitted', 'returned', 'graded', 'overdue']);

export const studentAssignmentItemSchema = z.object({
  id: z.uuid(), // student_assignment id
  assignmentId: z.uuid(),
  title: z.string(),
  subject: subjectRef,
  status: displayStatusSchema,
  dueAt: z.string(),
  isLate: z.boolean(),
  /** "Bố mẹ giao" (không gian gia đình) hay bài của trường */
  fromFamily: z.boolean(),
  /** Bài tự luyện của em (lớp 6–9 tự quét), không gửi giáo viên */
  isPractice: z.boolean(),
  lastSubmittedAt: z.string().nullable(),
});
export type StudentAssignmentItem = z.infer<typeof studentAssignmentItemSchema>;

export const attemptSchema = z.object({
  id: z.uuid(),
  attemptNo: z.number().int(),
  submittedAt: z.string(),
  isLate: z.boolean(),
  byGuardian: z.boolean(),
  note: z.string().nullable(),
  media: z.array(mediaViewSchema),
});
export type AttemptDto = z.infer<typeof attemptSchema>;

/** Nhận xét học sinh/phụ huynh thấy (tiểu học: không có mức, chỉ nhận xét + sticker). */
export const feedbackSchema = z.object({
  label: z.string().nullable(),
  comment: z.string().nullable(),
  commentAudio: mediaViewSchema.nullable(),
  sticker: z.enum(STICKER_IDS).nullable(),
  requiresRedo: z.boolean(),
  at: z.string(),
});

export const studentAssignmentDetailSchema = studentAssignmentItemSchema.extend({
  instructions: z.string().nullable(),
  items: z.array(assignmentItemSchema.extend({ position: z.number().int() })),
  /** Ảnh gốc trang đề đã quét */
  originals: z.array(mediaViewSchema),
  instructionsAudio: mediaViewSchema.nullable(),
  submissionKinds: z.array(z.enum(MEDIA_KINDS)),
  maxPhotos: z.number().int(),
  maxMediaSeconds: z.number().int(),
  canSubmit: z.boolean(),
  attempts: z.array(attemptSchema),
  feedback: feedbackSchema.nullable(),
});
export type StudentAssignmentDetail = z.infer<typeof studentAssignmentDetailSchema>;

export const submitSchema = z.object({
  mediaIds: z.array(z.uuid()).min(1, 'Con chưa chụp ảnh, quay video hay ghi âm bài nào').max(20),
  note: z.string().trim().max(500).optional(),
});

/** Giáo viên chấm: thang nào thì gửi trường đó (level hoặc score), kiểm tra theo registry thang đánh giá. */
export const evaluateSchema = z.object({
  requiresRedo: z.boolean().default(false),
  level: z.enum(['HOAN_THANH_TOT', 'HOAN_THANH', 'CHUA_HOAN_THANH', 'DAT', 'CHUA_DAT']).optional(),
  score: z.number().optional(),
  comment: z.string().trim().max(2000).optional(),
  commentAudioId: z.uuid().optional(),
  sticker: z.enum(STICKER_IDS).optional(),
});
export type EvaluateInput = z.infer<typeof evaluateSchema>;

export const teacherEvaluationSchema = z.object({
  id: z.uuid(),
  scheme: z.enum(GRADING_SCHEME_IDS),
  level: z.string().nullable(),
  score: z.number().nullable(),
  comment: z.string().nullable(),
  commentAudio: mediaViewSchema.nullable(),
  sticker: z.enum(STICKER_IDS).nullable(),
  requiresRedo: z.boolean(),
  updatedAt: z.string(),
});

export const gradingRowSchema = z.object({
  studentAssignmentId: z.uuid(),
  student: z.object({ id: z.uuid(), fullName: z.string(), nickname: z.string().nullable() }),
  status: displayStatusSchema,
  isLate: z.boolean(),
  latest: attemptSchema.nullable(),
  evaluation: teacherEvaluationSchema.nullable(),
});
export type GradingRow = z.infer<typeof gradingRowSchema>;

export const commentTemplateSchema = z.object({ id: z.uuid(), text: z.string(), mine: z.boolean() });
export const assignmentTemplateSchema = z.object({
  id: z.uuid(),
  code: z.string().nullable(),
  name: z.string(),
  suggestedSubjectCodes: z.array(z.string()),
  defaults: z.object({ submissionKinds: z.array(z.enum(MEDIA_KINDS)), maxPhotos: z.number(), maxMediaSeconds: z.number() }),
});
