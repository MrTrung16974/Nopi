import { z } from 'zod';
import { Registry } from '../shared/registry.js';
import { STICKER_IDS } from './stickers.js';
import type { SchoolStage } from '../curriculum/grade.js';

/**
 * Thang đánh giá. Mỗi thang là một strategy đăng ký vào gradingSchemes.
 * Thêm thang mới (vd. trắc nghiệm tự chấm ở Phase 2) = viết một object và register().
 */
export const GRADING_SCHEME_IDS = ['completion_level', 'pass_fail', 'score_10'] as const;
export type GradingSchemeId = (typeof GRADING_SCHEME_IDS)[number];

const commentFields = {
  comment: z.string().trim().max(2000).optional(),
  commentAudioId: z.uuid().optional(),
  sticker: z.enum(STICKER_IDS).optional(),
};

export interface StudentFeedback {
  /** Nhãn hiển thị cho học sinh; null = chỉ hiện nhận xét + sticker (tiểu học, TT 27/2020). */
  label: string | null;
  comment?: string;
  sticker?: string;
}

export interface GradingScheme<TInput extends object = object> {
  readonly id: string;
  readonly name: string;
  readonly inputSchema: z.ZodType<TInput>;
  studentView(input: TInput, stage: SchoolStage): StudentFeedback;
  /** Giá trị một ô trong báo cáo Excel. */
  exportCell(input: TInput): string | number;
}

export const COMPLETION_LEVELS = {
  HOAN_THANH_TOT: 'Hoàn thành tốt',
  HOAN_THANH: 'Hoàn thành',
  CHUA_HOAN_THANH: 'Chưa hoàn thành',
} as const;

export const completionLevelScheme: GradingScheme<{
  level: keyof typeof COMPLETION_LEVELS;
  comment?: string;
  commentAudioId?: string;
  sticker?: string;
}> = {
  id: 'completion_level',
  name: 'Mức hoàn thành',
  inputSchema: z.object({
    level: z.enum(['HOAN_THANH_TOT', 'HOAN_THANH', 'CHUA_HOAN_THANH']),
    ...commentFields,
  }),
  // Tiểu học: học sinh chỉ thấy nhận xét và sticker, không thấy mức.
  studentView: (i) => ({ label: null, comment: i.comment, sticker: i.sticker }),
  exportCell: (i) => COMPLETION_LEVELS[i.level],
};

export const PASS_FAIL_LEVELS = { DAT: 'Đạt', CHUA_DAT: 'Chưa đạt' } as const;

export const passFailScheme: GradingScheme<{
  level: keyof typeof PASS_FAIL_LEVELS;
  comment?: string;
  commentAudioId?: string;
  sticker?: string;
}> = {
  id: 'pass_fail',
  name: 'Đạt / Chưa đạt',
  inputSchema: z.object({ level: z.enum(['DAT', 'CHUA_DAT']), ...commentFields }),
  studentView: (i) => ({ label: PASS_FAIL_LEVELS[i.level], comment: i.comment, sticker: i.sticker }),
  exportCell: (i) => PASS_FAIL_LEVELS[i.level],
};

export const SCORE_STEP = 0.25;

/**
 * Đọc ô điểm giáo viên gõ (chấp nhận dấu phẩy kiểu Việt Nam). Ô trống KHÔNG được hiểu là 0.
 * Dùng chung cho web và app trước khi gửi lên API.
 */
export function parseScoreInput(raw: string): { ok: true; score: number } | { ok: false; error: string } {
  const text = raw.trim().replace(',', '.');
  if (text === '') return { ok: false, error: 'Thầy cô chưa nhập điểm' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Điểm phải là số, ví dụ 8 hoặc 8,5' };
  const score = Number(text);
  if (score < 0 || score > 10) return { ok: false, error: 'Điểm phải từ 0 đến 10' };
  if (!Number.isInteger(score / SCORE_STEP)) return { ok: false, error: 'Điểm lẻ theo bước 0,25 (ví dụ 7,25 · 7,5 · 7,75)' };
  return { ok: true, score };
}

export const score10Scheme: GradingScheme<{
  score: number;
  comment?: string;
  commentAudioId?: string;
  sticker?: string;
}> = {
  id: 'score_10',
  name: 'Điểm 0–10',
  inputSchema: z.object({
    score: z
      .number()
      .min(0)
      .max(10)
      .refine((s) => Number.isInteger(s / SCORE_STEP), `Điểm phải theo bước ${SCORE_STEP}`),
    ...commentFields,
  }),
  studentView: (i) => ({
    label: i.score.toLocaleString('vi-VN', { maximumFractionDigits: 2 }),
    comment: i.comment,
    sticker: i.sticker,
  }),
  exportCell: (i) => i.score,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry chứa các thang có kiểu input khác nhau
export const gradingSchemes = new Registry<GradingScheme<any>>('thang đánh giá')
  .register(completionLevelScheme)
  .register(passFailScheme)
  .register(score10Scheme);

/** Kiểm tra dữ liệu chấm. Yêu cầu làm lại thì không bắt buộc mức/điểm. */
export function parseEvaluation(schemeId: string, raw: unknown, requiresRedo: boolean) {
  const scheme = gradingSchemes.get(schemeId);
  if (requiresRedo) {
    return z.object(commentFields).safeParse(raw);
  }
  return scheme.inputSchema.safeParse(raw);
}
