import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MediaView, UploadRequest, UploadTicket } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import {
  ALLOWED_MIME,
  deleteAfter,
  MAX_UPLOAD_BYTES,
  MULTIPART_PART_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  partCount,
  type MediaKind,
} from '@nopi/domain';
import { and, eq, inArray, lt, ne } from 'drizzle-orm';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import { AppError, CLOCK, DB, defineEvent, OutboxService, type Clock } from '../../../platform/index.js';
import { SpaceSettingsService } from '../../org/public-api.js';
import { MEDIA_PROCESSOR, type MediaProcessor } from '../ports/media-processor.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../ports/object-storage.js';

const { mediaFiles } = schema;
type MediaRow = typeof mediaFiles.$inferSelect;

/** Ai tải lên: người lớn (giáo viên, phụ huynh nộp hộ) hoặc học sinh. */
export type MediaOwner = { kind: 'user'; userId: string } | { kind: 'student'; studentId: string };

export const MediaUploaded = defineEvent<{ mediaId: string }>()('MediaUploaded');

const UPLOAD_TTL = 60 * 60; // URL tải lên dùng được 1 giờ
const VIEW_TTL = 15 * 60; // link xem hết hạn sau 15 phút

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
};

const KIND_LABEL: Record<MediaKind, string> = { photo: 'ảnh', video: 'video', audio: 'ghi âm', document: 'tài liệu' };

/**
 * Media dùng chung cho mọi mô-đun (bài nộp, đề bài, nhận xét bằng giọng nói, ảnh quét đề…).
 * Mô-đun gọi tự kiểm tra quyền rồi gọi createUpload(); mô-đun này lo kho lưu trữ, xử lý và thời hạn lưu.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MEDIA_PROCESSOR) private readonly processor: MediaProcessor,
    private readonly settings: SpaceSettingsService,
    private readonly outbox: OutboxService,
  ) {}

  async createUpload(owner: MediaOwner, schoolId: string, req: UploadRequest): Promise<UploadTicket> {
    const kind = req.kind;
    const mime = req.mimeType.toLowerCase().split(';')[0]!.trim();
    if (!ALLOWED_MIME[kind].includes(mime)) {
      throw new AppError('validation_failed', `Định dạng ${KIND_LABEL[kind]} này chưa được hỗ trợ`);
    }
    if (req.sizeBytes > MAX_UPLOAD_BYTES[kind]) {
      throw new AppError('validation_failed', `File ${KIND_LABEL[kind]} quá lớn (tối đa ${Math.round(MAX_UPLOAD_BYTES[kind] / 1024 / 1024)} MB)`);
    }
    if ((kind === 'video' || kind === 'audio') && req.durationS !== undefined) {
      const s = await this.settings.get(schoolId);
      if (req.durationS > s.maxVideoSeconds + 5) {
        throw new AppError('validation_failed', `Bài dài quá, tối đa ${Math.round(s.maxVideoSeconds / 60)} phút`);
      }
    }

    const id = uuidv7();
    const now = this.clock.now();
    const key = `${schoolId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${EXT[mime] ?? 'bin'}`;
    const multipart = req.sizeBytes > MULTIPART_THRESHOLD_BYTES;
    const uploadId = multipart ? await this.storage.createMultipart(key, mime) : null;

    await this.db.insert(mediaFiles).values({
      id,
      schoolId,
      kind,
      storageKey: key,
      mimeType: mime,
      sizeBytes: req.sizeBytes,
      durationS: req.durationS ?? null,
      status: 'uploading',
      uploadedBy: owner.kind === 'user' ? owner.userId : null,
      uploadedByStudentId: owner.kind === 'student' ? owner.studentId : null,
      uploadId,
    });

    if (!multipart) {
      return {
        method: 'put',
        mediaId: id,
        url: await this.storage.presignPut(key, mime, req.sizeBytes, UPLOAD_TTL),
        headers: { 'Content-Type': mime },
        expiresIn: UPLOAD_TTL,
      };
    }
    const parts = await Promise.all(
      Array.from({ length: partCount(req.sizeBytes) }, async (_, i) => ({
        partNumber: i + 1,
        url: await this.storage.presignPart(key, uploadId!, i + 1, UPLOAD_TTL),
      })),
    );
    return { method: 'multipart', mediaId: id, partSize: MULTIPART_PART_BYTES, parts, expiresIn: UPLOAD_TTL };
  }

  private async loadOwned(mediaId: string, owner: MediaOwner) {
    const [m] = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, mediaId));
    const mine = m && (owner.kind === 'user' ? m.uploadedBy === owner.userId : m.uploadedByStudentId === owner.studentId);
    if (!m || !mine) throw new AppError('not_found', 'Không tìm thấy file');
    return m;
  }

  /** Tải tiếp sau khi rớt mạng: phần nào đã lên rồi + URL mới cho phần còn thiếu. */
  async multipartStatus(mediaId: string, owner: MediaOwner) {
    const m = await this.loadOwned(mediaId, owner);
    const uploadId = m.uploadId;
    if (!uploadId || m.status !== 'uploading') throw new AppError('conflict', 'File này không còn đang tải lên');
    const uploaded = await this.storage.listParts(m.storageKey, uploadId);
    const done = new Set(uploaded.map((p) => p.partNumber));
    const missing = Array.from({ length: partCount(m.sizeBytes ?? 0) }, (_, i) => i + 1).filter((n) => !done.has(n));
    const parts = await Promise.all(missing.map(async (n) => ({ partNumber: n, url: await this.storage.presignPart(m.storageKey, uploadId, n, UPLOAD_TTL) })));
    return { uploaded, parts, partSize: MULTIPART_PART_BYTES };
  }

  /** App báo đã tải xong → kiểm tra file có trên kho → chuyển "đang xử lý" và xếp việc cho worker. */
  async complete(mediaId: string, owner: MediaOwner, parts?: { partNumber: number; etag: string }[]) {
    const m = await this.loadOwned(mediaId, owner);
    if (m.status !== 'uploading') return this.view(m); // gọi lại nhiều lần vẫn an toàn
    const uploadId = m.uploadId;
    if (uploadId) {
      // Phải đủ mọi phần 1..N mới ghép (S3 cho phép ghép thiếu phần → file hỏng)
      const expected = partCount(m.sizeBytes ?? 0);
      const got = new Set((parts ?? []).map((p) => p.partNumber));
      if (got.size !== expected || [...got].some((n) => n < 1 || n > expected)) {
        throw new AppError('validation_failed', 'File chưa tải lên đủ, đang tải tiếp…');
      }
      await this.storage.completeMultipart(m.storageKey, uploadId, parts!).catch(() => {
        throw new AppError('validation_failed', 'File chưa tải lên đủ, vui lòng thử lại');
      });
    }
    const head = await this.storage.head(m.storageKey);
    if (!head) throw new AppError('validation_failed', 'File chưa tải lên xong, vui lòng thử lại');
    if (m.sizeBytes && head.size !== m.sizeBytes) {
      await this.storage.delete(m.storageKey).catch(() => undefined);
      await this.db.update(mediaFiles).set({ status: 'failed' }).where(eq(mediaFiles.id, mediaId));
      throw new AppError('validation_failed', 'File tải lên bị thiếu, vui lòng gửi lại');
    }
    if (head.size > MAX_UPLOAD_BYTES[m.kind as MediaKind]) {
      await this.storage.delete(m.storageKey);
      throw new AppError('validation_failed', 'File quá lớn');
    }
    const settings = await this.settings.get(m.schoolId);
    const expires = deleteAfter(m.kind as MediaKind, this.clock.now(), settings).toISOString().slice(0, 10);
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(mediaFiles)
        .set({ status: 'processing', sizeBytes: head.size, uploadId: null, deleteAfter: expires })
        .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.status, 'uploading')))
        .returning();
      if (row) await this.outbox.append(MediaUploaded.create(mediaId, { mediaId }, m.schoolId), tx);
      return row ?? m;
    });
    return this.view(updated);
  }

  /**
   * Worker: chuẩn hoá + ảnh thu nhỏ + đo thời lượng thật. Chạy lại nhiều lần vẫn an toàn.
   */
  async process(mediaId: string) {
    const [m] = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, mediaId));
    if (!m || m.status !== 'processing') return;
    const dir = await mkdtemp(join(tmpdir(), 'nopi-media-'));
    try {
      const input = join(dir, 'input');
      await this.storage.download(m.storageKey, input);
      const probe = await this.processor.probe(input).catch(() => null);
      if (!probe || (m.kind === 'video' && !probe.hasVideo) || (m.kind === 'audio' && !probe.hasAudio)) {
        await this.db.update(mediaFiles).set({ status: 'failed' }).where(eq(mediaFiles.id, mediaId));
        return;
      }
      let storageKey = m.storageKey;
      let mimeType = m.mimeType;
      let thumbnailKey: string | null = null;
      const base = m.storageKey.replace(/\.[^.]+$/, '');

      if (m.kind === 'video') {
        const out = join(dir, 'out.mp4');
        await this.processor.normalizeVideo(input, out);
        storageKey = `${base}.v.mp4`;
        mimeType = 'video/mp4';
        await this.storage.upload(storageKey, out, mimeType);
      } else if (m.kind === 'audio' && m.mimeType !== 'audio/mp4' && m.mimeType !== 'audio/m4a' && m.mimeType !== 'audio/x-m4a') {
        const out = join(dir, 'out.m4a');
        await this.processor.normalizeAudio(input, out);
        storageKey = `${base}.a.m4a`;
        mimeType = 'audio/mp4';
        await this.storage.upload(storageKey, out, mimeType);
      }
      if (m.kind === 'photo' || m.kind === 'video') {
        const thumb = join(dir, 'thumb.jpg');
        await this.processor.thumbnail(input, thumb, { atSecond: m.kind === 'video' && (probe.durationS ?? 0) > 2 ? 1 : undefined });
        thumbnailKey = `${base}.thumb.jpg`;
        await this.storage.upload(thumbnailKey, thumb, 'image/jpeg');
      }
      await this.db
        .update(mediaFiles)
        .set({ status: 'ready', storageKey, mimeType, thumbnailKey, durationS: m.kind === 'photo' ? null : probe.durationS })
        .where(eq(mediaFiles.id, mediaId));
      if (storageKey !== m.storageKey) await this.storage.delete(m.storageKey).catch(() => undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Lưu file hệ thống tạo ra (báo cáo Excel/PDF) vào kho. Tự xoá sau `keepDays` ngày.
   */
  async storeGenerated(input: { schoolId: string; userId: string; localPath: string; mimeType: string; ext: string; keepDays: number }) {
    const id = uuidv7();
    const now = this.clock.now();
    const key = `${input.schoolId}/reports/${id}.${input.ext}`;
    await this.storage.upload(key, input.localPath, input.mimeType);
    const head = await this.storage.head(key);
    await this.db.insert(mediaFiles).values({
      id,
      schoolId: input.schoolId,
      kind: 'document',
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: head?.size ?? null,
      status: 'ready',
      uploadedBy: input.userId,
      deleteAfter: new Date(now.getTime() + input.keepDays * 86_400_000).toISOString().slice(0, 10),
    });
    return id;
  }

  /** Link tải có hạn (giây), kèm tên file khi tải về. */
  async downloadUrl(mediaId: string, downloadName?: string) {
    const [m] = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, mediaId));
    if (!m || m.status !== 'ready') return null;
    return this.storage.presignGet(m.storageKey, VIEW_TTL, downloadName);
  }

  /** Đọc nội dung file (ảnh trang đề cho AI đọc). Dùng file gốc trên kho. */
  async readBytes(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const [m] = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, mediaId));
    if (!m) throw new AppError('not_found', 'Không tìm thấy file');
    const dir = await mkdtemp(join(tmpdir(), 'nopi-read-'));
    try {
      const path = join(dir, 'f');
      await this.storage.download(m.storageKey, path);
      return { bytes: await readFile(path), mimeType: m.mimeType };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async getMany(ids: string[], tx: DbOrTx = this.db) {
    if (ids.length === 0) return [];
    return tx.select().from(mediaFiles).where(inArray(mediaFiles.id, ids));
  }

  private async view(m: MediaRow): Promise<MediaView> {
    const viewable = m.status === 'ready' || m.status === 'processing';
    return {
      id: m.id,
      kind: m.kind as MediaView['kind'],
      status: m.status as MediaView['status'],
      mimeType: m.mimeType,
      durationS: m.durationS,
      // Đang xử lý vẫn xem được bản gốc (giáo viên không phải chờ worker)
      url: viewable ? await this.storage.presignGet(m.storageKey, VIEW_TTL) : null,
      thumbnailUrl: m.thumbnailKey ? await this.storage.presignGet(m.thumbnailKey, VIEW_TTL) : null,
    };
  }

  /** Link xem cho nhiều file (mô-đun gọi đã kiểm tra quyền). */
  async views(ids: string[]): Promise<Map<string, MediaView>> {
    const rows = await this.getMany([...new Set(ids)]);
    const out = await Promise.all(rows.map(async (r) => [r.id, await this.view(r)] as const));
    return new Map(out);
  }

  /**
   * Việc hằng đêm: dọn lượt tải lên bị bỏ dở (xin URL nhưng không bao giờ báo hoàn tất) quá 7 ngày.
   * Hàng đợi tải lên trong app có thể gửi tiếp sau vài ngày mất mạng, nên chờ đủ lâu mới dọn.
   */
  async deleteAbandonedUploads(limit = 1000, olderThanDays = 7) {
    const cutoff = new Date(this.clock.now().getTime() - olderThanDays * 86_400_000);
    const rows = await this.db
      .select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.status, 'uploading'), lt(mediaFiles.createdAt, cutoff)))
      .limit(limit);
    for (const r of rows) {
      if (r.uploadId) await this.storage.abortMultipart(r.storageKey, r.uploadId).catch(() => undefined);
      await this.storage.delete(r.storageKey).catch(() => undefined);
      await this.db.update(mediaFiles).set({ status: 'deleted', uploadId: null }).where(and(eq(mediaFiles.id, r.id), eq(mediaFiles.status, 'uploading')));
    }
    if (rows.length) this.logger.log(`Đã dọn ${rows.length} lượt tải lên bỏ dở`);
    return rows.length;
  }

  /** Việc hằng đêm: xoá file quá thời hạn lưu (giữ dòng trong CSDL, đánh dấu "deleted"). */
  async deleteExpired(limit = 500) {
    const today = this.clock.now().toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(mediaFiles)
      .where(and(lt(mediaFiles.deleteAfter, today), ne(mediaFiles.status, 'deleted')))
      .limit(limit);
    for (const r of rows) {
      await this.storage.delete(r.storageKey).catch(() => undefined);
      if (r.thumbnailKey) await this.storage.delete(r.thumbnailKey).catch(() => undefined);
      await this.db.update(mediaFiles).set({ status: 'deleted', thumbnailKey: null }).where(eq(mediaFiles.id, r.id));
    }
    if (rows.length) this.logger.log(`Đã xoá ${rows.length} file quá thời hạn lưu`);
    return rows.length;
  }
}
