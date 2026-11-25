import type { SubmissionMediaKind } from '../submission/limits.js';

/** Giới hạn kích thước file tải lên (byte) theo loại — chặn ngay từ lúc xin URL tải lên. */
export const MAX_UPLOAD_BYTES: Record<SubmissionMediaKind, number> = {
  photo: 15 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 600 * 1024 * 1024, // 30 phút 720p sau khi nén
  document: 20 * 1024 * 1024,
};

/** Định dạng nhận theo loại. */
export const ALLOWED_MIME: Record<SubmissionMediaKind, readonly string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  audio: ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'],
  document: ['application/pdf'],
};

/** Video lớn hơn mức này thì tải theo từng phần (tải tiếp được khi rớt mạng). */
export const MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024;
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

/** Số phần cần cho một file. */
export const partCount = (size: number) => Math.max(1, Math.ceil(size / MULTIPART_PART_BYTES));
