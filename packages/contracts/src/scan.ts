import { z } from 'zod';
import { mediaViewSchema } from './media.js';

export const ITEM_TYPES = ['open', 'multiple_choice', 'fill_blank', 'read_aloud'] as const;
export const ITEM_TYPE_LABELS: Record<(typeof ITEM_TYPES)[number], string> = {
  open: 'Tự luận',
  multiple_choice: 'Trắc nghiệm',
  fill_blank: 'Điền vào chỗ trống',
  read_aloud: 'Đọc thành tiếng',
};

/** Một câu trong đề (soạn tay hoặc AI tách từ ảnh). */
export const assignmentItemSchema = z.object({
  itemType: z.enum(ITEM_TYPES),
  promptText: z.string().trim().min(1).max(4000),
  promptLatex: z.string().max(2000).nullable().optional(),
  options: z.array(z.string().max(500)).max(8).nullable().optional(),
  /** Độ chắc chắn khi AI đọc (0–1) — thấp thì tô vàng để soát */
  aiConfidence: z.number().min(0).max(1).nullable().optional(),
});
export type AssignmentItemInput = z.infer<typeof assignmentItemSchema>;

/** Kết quả AI đọc đề — chỉ CHÉP đề, không giải. */
export const scanResultSchema = z.object({
  title: z.string(),
  instructions: z.string().nullable(),
  items: z.array(assignmentItemSchema.extend({ number: z.string().nullable() })),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

export const createScanJobSchema = z.object({
  /** Ảnh các trang (1–5), đã tải lên qua /scan/uploads */
  mediaIds: z.array(z.uuid()).min(1, 'Chụp ít nhất một trang').max(5, 'Mỗi lần quét tối đa 5 trang'),
  /** Giáo viên/bố mẹ quét để giao cho lớp–môn này; học sinh tự luyện thì bỏ trống */
  teachingAssignmentId: z.uuid().optional(),
});

export const scanUploadSchema = z.object({
  teachingAssignmentId: z.uuid().optional(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
});

export const scanJobSchema = z.object({
  id: z.uuid(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  /** Ảnh trùng trang đã quét trong cùng trường/gia đình → dùng lại kết quả, không tốn lượt */
  cached: z.boolean(),
  result: scanResultSchema.nullable(),
  sourceMedia: z.array(mediaViewSchema),
  error: z.string().nullable(),
  quota: z.object({ used: z.number().int(), limit: z.number().int() }),
});
export type ScanJobDto = z.infer<typeof scanJobSchema>;

/** Học sinh lớp 6–9 lưu bài tự luyện từ ảnh quét. */
export const createPracticeSchema = z.object({
  scanJobId: z.uuid(),
  subjectId: z.number().int(),
  title: z.string().trim().min(1).max(200),
  items: z.array(assignmentItemSchema).min(1).max(60),
});
