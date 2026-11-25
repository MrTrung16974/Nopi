import { z } from 'zod';
import { MEDIA_KINDS } from '@nopi/domain';

export const mediaKindSchema = z.enum(MEDIA_KINDS);

export const uploadRequestSchema = z.object({
  kind: mediaKindSchema,
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  /** Thời lượng app đo được (giây) — worker đo lại sau khi tải lên */
  durationS: z.number().nonnegative().max(3600).optional(),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

/** Tải 1 lần (ảnh, ghi âm, video nhỏ) hoặc theo từng phần (video lớn, tải tiếp được khi rớt mạng). */
export const uploadTicketSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('put'),
    mediaId: z.uuid(),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    expiresIn: z.number(),
  }),
  z.object({
    method: z.literal('multipart'),
    mediaId: z.uuid(),
    partSize: z.number().int(),
    parts: z.array(z.object({ partNumber: z.number().int(), url: z.string() })),
    expiresIn: z.number(),
  }),
]);
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

export const completeUploadSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string() })).optional(),
});

/** Khi tải tiếp: các phần đã lên kho + URL mới cho các phần còn thiếu. */
export const multipartStatusSchema = z.object({
  uploaded: z.array(z.object({ partNumber: z.number().int(), etag: z.string(), size: z.number().int() })),
  parts: z.array(z.object({ partNumber: z.number().int(), url: z.string() })),
  partSize: z.number().int(),
});

export const mediaViewSchema = z.object({
  id: z.uuid(),
  kind: mediaKindSchema,
  status: z.enum(['uploading', 'processing', 'ready', 'failed', 'deleted']),
  mimeType: z.string(),
  durationS: z.number().nullable(),
  /** Link xem có hạn vài phút; null nếu chưa sẵn sàng hoặc đã xoá theo thời hạn lưu */
  url: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});
export type MediaView = z.infer<typeof mediaViewSchema>;
