import { fail, ok, type Result } from '../shared/result.js';

export const MEDIA_KINDS = ['photo', 'video', 'audio', 'document'] as const;
export type SubmissionMediaKind = (typeof MEDIA_KINDS)[number];

export interface SubmissionRules {
  allowedKinds: readonly SubmissionMediaKind[];
  maxPhotos: number;
  maxMediaSeconds: number;
}

export interface SubmittedMedia {
  kind: SubmissionMediaKind;
  durationSeconds?: number;
}

export type SubmissionRuleError = 'empty' | 'kind_not_allowed' | 'too_many_photos' | 'too_long';

export function validateSubmissionMedia(
  rules: SubmissionRules,
  media: readonly SubmittedMedia[],
): Result<true, SubmissionRuleError> {
  if (media.length === 0) return fail('empty', 'Con chưa chụp ảnh, quay video hay ghi âm bài nào');
  for (const m of media) {
    if (!rules.allowedKinds.includes(m.kind)) {
      return fail('kind_not_allowed', 'Bài này cô không yêu cầu nộp kiểu này');
    }
    if ((m.kind === 'video' || m.kind === 'audio') && (m.durationSeconds ?? 0) > rules.maxMediaSeconds) {
      const minutes = Math.round((rules.maxMediaSeconds / 60) * 10) / 10;
      return fail('too_long', `Bài dài quá, cô chỉ nhận tối đa ${minutes} phút`);
    }
  }
  const photos = media.filter((m) => m.kind === 'photo').length;
  if (photos > rules.maxPhotos) {
    return fail('too_many_photos', `Bài này nộp tối đa ${rules.maxPhotos} ảnh`);
  }
  return ok(true);
}
