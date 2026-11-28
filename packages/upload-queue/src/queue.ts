import { FILE_MISSING, type QueuedFile, type QueueStorage, type QueueTransport, type TransportError, type UploadJob } from './types.js';

/**
 * Lỗi do dữ liệu/quyền/phiên (không phải mạng) → không thử lại, báo cho người dùng.
 * Thử lại mãi các lỗi này chỉ làm màn hình hiện "Đang gửi…" không bao giờ xong.
 */
const PERMANENT = new Set(['validation_failed', 'forbidden', 'not_found', 'conflict', 'unauthenticated', FILE_MISSING]);
const isPermanent = (e: unknown) => {
  const err = e as TransportError;
  return Boolean(err?.code && PERMANENT.has(err.code));
};
/** Câu báo dễ hiểu cho các lỗi mà thông điệp kỹ thuật không giúp được người dùng. */
const FRIENDLY: Record<string, string> = {
  unauthenticated: 'Phiên đăng nhập đã hết. Đăng nhập lại rồi bấm «Gửi lại» nhé.',
  [FILE_MISSING]: 'Ảnh/video/ghi âm trên máy không còn nữa. Bấm «Bỏ» rồi chụp hoặc ghi lại nhé.',
};

export interface QueueOptions {
  now?: () => number;
  newId?: () => string;
  /** Thời gian chờ trước lần thử thứ n (ms) — mặc định 5s, 10s, 20s… tối đa 10 phút */
  backoff?: (attempt: number) => number;
}

/**
 * Hàng đợi nộp bài. Mỗi bước được lưu ngay sau khi xong, nên mất mạng/tắt app giữa chừng
 * thì lần sau làm tiếp đúng chỗ: không tải lại file đã lên, không nộp trùng.
 * Người dùng chỉ thấy "Đang gửi…" — lỗi kỹ thuật được thử lại âm thầm.
 */
export class UploadQueue {
  private jobs: UploadJob[] = [];
  private loaded = false;
  private running = false;
  private readonly listeners = new Set<(jobs: UploadJob[]) => void>();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly backoff: (n: number) => number;

  constructor(
    private readonly storage: QueueStorage,
    private readonly transport: QueueTransport,
    opts: QueueOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    this.backoff = opts.backoff ?? ((n) => Math.min(5000 * 2 ** Math.max(0, n - 1), 10 * 60_000));
  }

  async load() {
    if (this.loaded) return;
    this.jobs = await this.storage.load();
    // Tắt app giữa chừng: việc đang chạy quay về chờ để chạy lại
    for (const j of this.jobs) if (j.state === 'uploading' || j.state === 'submitting') j.state = 'pending';
    this.loaded = true;
    this.emit();
  }

  list(): UploadJob[] {
    return this.jobs.map((j) => ({ ...j, files: j.files.map((f) => ({ ...f })) }));
  }

  /** Việc của một bài (để màn bài hiện "Đang gửi…"). */
  forAssignment(studentAssignmentId: string) {
    return this.list().filter((j) => j.studentAssignmentId === studentAssignmentId && j.state !== 'done');
  }

  subscribe(fn: (jobs: UploadJob[]) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snapshot = this.list();
    this.listeners.forEach((l) => l(snapshot));
  }

  private async persist() {
    await this.storage.save(this.jobs);
    this.emit();
  }

  async enqueue(input: { studentAssignmentId: string; as: 'student' | 'adult'; ownerId?: string; files: Omit<QueuedFile, 'mediaId' | 'uploaded' | 'completed' | 'parts'>[]; note?: string }) {
    await this.load();
    const job: UploadJob = {
      id: this.newId(),
      studentAssignmentId: input.studentAssignmentId,
      as: input.as,
      ownerId: input.ownerId,
      files: input.files.map((f) => ({ ...f })),
      note: input.note,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: this.now(),
      createdAt: this.now(),
      progress: 0,
    };
    this.jobs.push(job);
    await this.persist();
    return job.id;
  }

  /** Người dùng bấm "Gửi lại" sau lỗi. */
  async retry(id: string) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    j.state = 'pending';
    j.error = undefined;
    j.nextAttemptAt = this.now();
    await this.persist();
  }

  async remove(id: string) {
    this.jobs = this.jobs.filter((j) => j.id !== id);
    await this.persist();
  }

  /** Chạy các việc tới hạn (gọi khi mở app, khi có mạng lại, và định kỳ). */
  async processDue(): Promise<void> {
    await this.load();
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.transport.isOnline())) return;
      for (const job of this.jobs) {
        if (job.state !== 'pending' || job.nextAttemptAt > this.now()) continue;
        // Máy đang đăng nhập tài khoản khác → để dành, không gửi bằng token của người khác
        if (job.ownerId && this.transport.currentOwner && this.transport.currentOwner(job.as) !== job.ownerId) continue;
        await this.runJob(job);
      }
      // Dọn việc xong quá 1 ngày
      const cutoff = this.now() - 24 * 3600_000;
      this.jobs = this.jobs.filter((j) => !(j.state === 'done' && j.createdAt < cutoff));
      await this.persist();
    } finally {
      this.running = false;
    }
  }

  private progressOf(job: UploadJob) {
    if (job.state === 'done') return 1;
    const total = job.files.length * 3 + 1;
    const done = job.files.reduce((n, f) => n + (f.mediaId ? 1 : 0) + (f.uploaded ? 1 : 0) + (f.completed ? 1 : 0), 0);
    return Math.min(1, done / total);
  }

  private async step(job: UploadJob, mutate: () => void) {
    mutate();
    job.progress = this.progressOf(job);
    await this.persist();
  }

  private async runJob(job: UploadJob) {
    job.state = 'uploading';
    job.attempts += 1;
    await this.persist();
    try {
      for (const file of job.files) await this.uploadFile(job, file);
      job.state = 'submitting';
      await this.persist();
      await this.transport.submit(job, job.files.map((f) => f.mediaId!), job.note);
      await this.step(job, () => (job.state = 'done'));
    } catch (e) {
      if (isPermanent(e)) {
        job.state = 'failed';
        job.error = FRIENDLY[(e as TransportError).code ?? ''] ?? (e as Error).message;
      } else {
        job.state = 'pending';
        job.nextAttemptAt = this.now() + this.backoff(job.attempts);
      }
      await this.persist();
    }
  }

  private async uploadFile(job: UploadJob, file: QueuedFile): Promise<void> {
    if (file.completed) return;
    // URL tải 1 lần hết hạn mà chưa tải xong → xin URL mới (file mới)
    const expired = file.ticketExpiresAt !== undefined && file.ticketExpiresAt < this.now() && !file.uploaded && !file.parts;
    if (!file.mediaId || expired) {
      const ticket = await this.transport.requestUpload(job, file);
      await this.step(job, () => {
        file.mediaId = ticket.mediaId;
        file.ticketExpiresAt = this.now() + ticket.expiresIn * 1000 - 60_000;
        file.uploaded = false;
        file.parts = ticket.method === 'multipart' ? [] : undefined;
        file.putUrl = ticket.method === 'put' ? ticket.url : undefined;
        file.putHeaders = ticket.method === 'put' ? ticket.headers : undefined;
      });
      if (ticket.method === 'put') {
        await this.transport.putFile(file, ticket.url, ticket.headers);
      } else {
        for (const p of ticket.parts) await this.putPart(job, file, p.partNumber, p.url, ticket.partSize);
      }
      await this.step(job, () => (file.uploaded = true));
    } else if (!file.uploaded) {
      if (file.parts) {
        // Tải tiếp: hỏi kho phần nào đã lên, chỉ tải phần còn thiếu
        const status = await this.transport.multipartStatus(job, file.mediaId);
        await this.step(job, () => (file.parts = status.uploaded.map((u) => ({ partNumber: u.partNumber, etag: u.etag }))));
        for (const p of status.parts) await this.putPart(job, file, p.partNumber, p.url, status.partSize);
      } else if (file.putUrl) {
        // URL tải 1 lần còn hạn → tải lại vào đúng chỗ cũ
        await this.transport.putFile(file, file.putUrl, file.putHeaders ?? {});
      } else {
        file.mediaId = undefined;
        return this.uploadFile(job, file);
      }
      await this.step(job, () => (file.uploaded = true));
    }
    await this.transport.complete(job, file.mediaId!, file.parts?.length ? file.parts : undefined);
    await this.step(job, () => (file.completed = true));
  }

  private async putPart(job: UploadJob, file: QueuedFile, partNumber: number, url: string, partSize: number) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(file.sizeBytes, start + partSize);
    const etag = await this.transport.putPart(file, url, start, end);
    await this.step(job, () => {
      file.parts = [...(file.parts ?? []).filter((p) => p.partNumber !== partNumber), { partNumber, etag }];
    });
  }
}
