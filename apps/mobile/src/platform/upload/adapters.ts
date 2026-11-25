import { mediaViewSchema, multipartStatusSchema, studentAssignmentDetailSchema, uploadTicketSchema } from '@nopi/contracts';
import type { QueuedFile, QueueStorage, QueueTransport, UploadJob } from '@nopi/upload-queue';
import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { api, ApiError } from '../api';

const web = Platform.OS === 'web';
const KEY = 'nopi.upload-queue';

/** Lưu hàng đợi: file JSON trong thư mục tài liệu của app (điện thoại), localStorage (web). */
export const queueStorage: QueueStorage = {
  async load() {
    try {
      if (web) return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]') as UploadJob[];
      const f = new File(Paths.document, `${KEY}.json`);
      return f.exists ? (JSON.parse(await f.text()) as UploadJob[]) : [];
    } catch {
      return [];
    }
  },
  async save(jobs) {
    const text = JSON.stringify(jobs);
    if (web) {
      try {
        globalThis.localStorage?.setItem(KEY, text);
      } catch {
        /* bỏ qua */
      }
      return;
    }
    const f = new File(Paths.document, `${KEY}.json`);
    if (!f.exists) f.create();
    await f.write(text);
  },
};

const httpError = (status: number, what: string) =>
  // 4xx từ kho (URL hết hạn, sai chữ ký) → lỗi tạm, hàng đợi sẽ xin URL mới; 5xx → thử lại
  Object.assign(new Error(`${what} ${status}`), { code: 'network', status });

/** Đọc file trên máy thành Blob/bytes để tải lên (web: blob:/data: URL từ camera, MediaRecorder). */
async function webBlob(uri: string) {
  return (await globalThis.fetch(uri)).blob();
}

export const queueTransport: QueueTransport = {
  async isOnline() {
    return web ? globalThis.navigator?.onLine !== false : true; // điện thoại: dựa vào lỗi mạng để thử lại
  },

  async requestUpload(job, file) {
    return api(`/student-assignments/${job.studentAssignmentId}/uploads`, {
      method: 'POST',
      as: job.as,
      body: { kind: file.kind, mimeType: file.mimeType, sizeBytes: file.sizeBytes, durationS: file.durationS },
      schema: uploadTicketSchema,
    });
  },

  async putFile(file: QueuedFile, url, headers) {
    if (web) {
      const r = await globalThis.fetch(url, { method: 'PUT', headers, body: await webBlob(file.localUri) });
      if (!r.ok) throw httpError(r.status, 'PUT');
      return;
    }
    const r = await new File(file.localUri).upload(url, { httpMethod: 'PUT', headers, mimeType: file.mimeType });
    if (r.status < 200 || r.status >= 300) throw httpError(r.status, 'PUT');
  },

  async putPart(file, url, start, end) {
    let r: Response | Awaited<ReturnType<typeof expoFetch>>;
    if (web) {
      r = await globalThis.fetch(url, { method: 'PUT', body: (await webBlob(file.localUri)).slice(start, end) });
    } else {
      // Đọc đúng đoạn [start, end) — không nạp cả video vào bộ nhớ
      const handle = new File(file.localUri).open();
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        handle.offset = start;
        bytes = await handle.readBytes(end - start);
      } finally {
        handle.close();
      }
      r = await expoFetch(url, { method: 'PUT', body: bytes.buffer });
    }
    if (!r.ok) throw httpError(r.status, 'PART');
    const etag = r.headers.get('etag');
    if (!etag) throw httpError(0, 'ETAG');
    return etag;
  },

  async multipartStatus(job, mediaId) {
    return api(`/media/${mediaId}/multipart`, { as: job.as, schema: multipartStatusSchema });
  },

  async complete(job, mediaId, parts) {
    return api(`/media/${mediaId}/complete`, { method: 'POST', as: job.as, body: { parts }, schema: mediaViewSchema });
  },

  async submit(job, mediaIds, note) {
    return api(`/student-assignments/${job.studentAssignmentId}/submissions`, {
      method: 'POST',
      as: job.as,
      body: { mediaIds, note },
      schema: studentAssignmentDetailSchema,
    });
  },
};

/** ApiError đã có code — hàng đợi dùng để phân biệt lỗi mạng (thử lại) và lỗi dữ liệu (dừng, báo). */
export type { ApiError };
