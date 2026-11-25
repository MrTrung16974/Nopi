import type { MediaView, StudentAssignmentDetail, UploadTicket } from '@nopi/contracts';

export type MediaKind = 'photo' | 'video' | 'audio' | 'document';

/** Một file chờ nộp (ảnh/video/ghi âm đã chụp, đang nằm trên máy). */
export interface QueuedFile {
  localUri: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  durationS?: number;
  // ---- tiến độ (lưu lại để mở app vẫn làm tiếp) ----
  mediaId?: string;
  ticketExpiresAt?: number;
  /** URL ký sẵn (tải 1 lần) — dùng lại khi thử lại nếu còn hạn */
  putUrl?: string;
  putHeaders?: Record<string, string>;
  /** Các phần đã tải (tải theo phần) */
  parts?: { partNumber: number; etag: string }[];
  uploaded?: boolean;
  completed?: boolean;
}

export type JobState = 'pending' | 'uploading' | 'submitting' | 'done' | 'failed';

export interface UploadJob {
  id: string;
  studentAssignmentId: string;
  /** Ai nộp: học sinh, hoặc phụ huynh nộp hộ */
  as: 'student' | 'adult';
  files: QueuedFile[];
  note?: string;
  state: JobState;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  /** Lỗi không thử lại được (vd. quá hạn mà cô không cho nộp muộn) — hiển thị cho người dùng */
  error?: string;
  /** Tiến độ 0..1 để hiện "Đang gửi…" */
  progress: number;
}

/** Lưu hàng đợi (file trên máy, localStorage trên web). */
export interface QueueStorage {
  load(): Promise<UploadJob[]>;
  save(jobs: UploadJob[]): Promise<void>;
}

/** Lỗi API có mã — để phân biệt lỗi thử lại được (mạng) và lỗi dừng hẳn (dữ liệu sai). */
export interface TransportError extends Error {
  code?: string;
  status?: number;
}

/** Giao tiếp với API + kho media. App cài đặt theo nền tảng (native dùng File.upload, web dùng fetch). */
export interface QueueTransport {
  requestUpload(job: UploadJob, file: QueuedFile): Promise<UploadTicket>;
  /** Tải cả file lên URL ký sẵn (PUT). */
  putFile(file: QueuedFile, url: string, headers: Record<string, string>): Promise<void>;
  /** Tải một phần (byte [start, end)) và trả về ETag. */
  putPart(file: QueuedFile, url: string, start: number, end: number): Promise<string>;
  multipartStatus(job: UploadJob, mediaId: string): Promise<{ uploaded: { partNumber: number; etag: string }[]; parts: { partNumber: number; url: string }[]; partSize: number }>;
  complete(job: UploadJob, mediaId: string, parts?: { partNumber: number; etag: string }[]): Promise<MediaView>;
  submit(job: UploadJob, mediaIds: string[], note?: string): Promise<StudentAssignmentDetail>;
  /** Có mạng không (NetInfo / navigator.onLine). */
  isOnline(): Promise<boolean>;
}
