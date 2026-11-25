import { z } from 'zod';

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const gradeSchema = z.number().int().min(1).max(9);
export type Grade = (typeof GRADES)[number];

export type SchoolStage = 'primary' | 'lower_secondary';
/** Chế độ giao diện: Nhí (lớp 1–5), Teen (lớp 6–9), người lớn. */
export type UiMode = 'nhi' | 'teen' | 'adult';

export const stageOfGrade = (grade: Grade): SchoolStage => (grade <= 5 ? 'primary' : 'lower_secondary');

export const uiModeOfGrade = (grade: Grade): Exclude<UiMode, 'adult'> =>
  grade <= 5 ? 'nhi' : 'teen';

/** Lớp 1–3 không gõ phím: chỉ đăng nhập bằng ảnh/QR. Lớp 4–9 có thêm mã HS + PIN. */
export const canUsePinLogin = (grade: Grade): boolean => grade >= 4;

/** Học sinh lớp 6–9 được tự quét đề để luyện; lớp 1–5 bố mẹ quét giúp. */
export const canSelfScan = (grade: Grade): boolean => grade >= 6;
