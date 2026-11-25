import { z } from 'zod';

/**
 * Cài đặt của một "không gian" (trường hoặc gia đình), lưu ở schools.settings (jsonb).
 * Có phiên bản; khi đọc luôn merge với mặc định nên thêm khoá mới không cần migration dữ liệu.
 */
export const MAX_MEDIA_SECONDS_CAP = 30 * 60; // trần cứng 30 phút / video

export const spaceSettingsSchema = z.object({
  version: z.literal(1).default(1),
  maxVideoSeconds: z.number().int().positive().max(MAX_MEDIA_SECONDS_CAP).default(MAX_MEDIA_SECONDS_CAP),
  defaultVideoSeconds: z.number().int().positive().max(MAX_MEDIA_SECONDS_CAP).default(120),
  retentionDays: z
    .object({
      video: z.number().int().positive().default(365),
      photo: z.number().int().positive().default(1095),
      audio: z.number().int().positive().default(1095),
      document: z.number().int().positive().default(1095),
    })
    .prefault({}),
  scanQuotaPerDay: z.number().int().nonnegative().default(30),
  quietHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
      end: z.string().regex(/^\d{2}:\d{2}$/).default('06:30'),
    })
    .prefault({}),
  teacherDigestTime: z.string().regex(/^\d{2}:\d{2}$/).default('20:00'),
});

export type SpaceSettings = z.infer<typeof spaceSettingsSchema>;

/** Đọc settings từ DB (có thể thiếu khoá, có thể null) và trả về bản đầy đủ. */
export function resolveSpaceSettings(raw: unknown): SpaceSettings {
  const s = spaceSettingsSchema.parse(raw ?? {});
  if (s.defaultVideoSeconds > s.maxVideoSeconds) {
    return { ...s, defaultVideoSeconds: s.maxVideoSeconds };
  }
  return s;
}

export type MediaKind = keyof SpaceSettings['retentionDays'];

/** Ngày tự xoá của một file media, tính lúc tải lên. */
export function deleteAfter(kind: MediaKind, uploadedAt: Date, settings: SpaceSettings): Date {
  const days = settings.retentionDays[kind];
  return new Date(uploadedAt.getTime() + days * 24 * 60 * 60 * 1000);
}
