import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ScanJobDto, ScanResult } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { canSelfScan, fromVn, vnParts, type Grade } from '@nopi/domain';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { AppError, CLOCK, DB, JobQueue, QUEUES, type Actor, type Clock } from '../../../platform/index.js';
import { AssignmentsService } from '../../assignments/public-api.js';
import { EntitlementService } from '../../billing/public-api.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { MediaService, ownerOf } from '../../media/public-api.js';
import { AccessService, SpaceSettingsService, TeachingReader } from '../../org/public-api.js';
import { SCAN_ENGINE, ScanError, type ScanEngine, type ScanImage } from '../ports/scan-engine.js';

const { scanJobs } = schema;
type JobRow = typeof scanJobs.$inferSelect;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ScanContext {
  schoolId: string;
  grade: Grade | null;
  subjectName?: string;
}

/**
 * Quét đề thành bài tập (mục 6.5): ảnh đi đúng đường ảnh bài nộp (tải thẳng lên kho),
 * API tạo việc quét, worker gọi dịch vụ AI, người tạo soát lại rồi giao.
 * Ảnh trùng trang đã quét trong cùng trường/gia đình → dùng lại kết quả, không tốn lượt.
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCAN_ENGINE) private readonly engine: ScanEngine | null,
    private readonly media: MediaService,
    private readonly teaching: TeachingReader,
    private readonly access: AccessService,
    private readonly settings: SpaceSettingsService,
    private readonly entitlements: EntitlementService,
    private readonly curriculum: CurriculumService,
    private readonly assignments: AssignmentsService,
    private readonly queue: JobQueue,
  ) {}

  /** Quét để giao (giáo viên/bố mẹ, theo lớp–môn) hoặc tự luyện (học sinh lớp 6–9). */
  private async contextOf(actor: Actor, teachingAssignmentId?: string): Promise<ScanContext> {
    if (actor.kind === 'user') {
      if (!teachingAssignmentId) throw new AppError('validation_failed', 'Chọn lớp–môn trước khi quét đề');
      const ta = await this.teaching.get(teachingAssignmentId);
      await this.teaching.requireCanAssign(actor, ta);
      const subjects = await this.curriculum.subjectsById([ta.subjectId]);
      return { schoolId: ta.schoolId, grade: ta.class.grade, subjectName: subjects.get(ta.subjectId)?.shortName };
    }
    const classes = await this.access.currentClassesOf(actor.studentId);
    if (classes.length === 0) throw new AppError('validation_failed', 'Em chưa vào lớp nào');
    const grade = Math.max(...classes.map((c) => c.grade)) as Grade;
    if (!canSelfScan(grade)) throw new AppError('forbidden', 'Học sinh lớp 1–5 nhờ bố mẹ quét đề giúp nhé');
    const kinds = await this.teaching.schoolKinds(classes.map((c) => c.schoolId));
    const home = classes.find((c) => kinds.get(c.schoolId) === 'school') ?? classes[0]!;
    return { schoolId: home.schoolId, grade };
  }

  async upload(actor: Actor, input: { teachingAssignmentId?: string; mimeType: string; sizeBytes: number }) {
    const ctx = await this.contextOf(actor, input.teachingAssignmentId);
    return this.media.createUpload(ownerOf(actor), ctx.schoolId, { kind: 'photo', mimeType: input.mimeType, sizeBytes: input.sizeBytes });
  }

  private today() {
    const p = vnParts(this.clock.now());
    return fromVn(p.year, p.month, p.day, 0, 0);
  }

  /** Lượt quét hôm nay: lấy mức cao hơn giữa cài đặt trường và quyền theo gói. Lượt dùng lại kết quả không tính. */
  async quota(schoolId: string) {
    const [settings, ent] = await Promise.all([this.settings.get(schoolId), this.entitlements.get(schoolId)]);
    const fromPlan = typeof ent.features.scan_quota_per_day === 'number' ? ent.features.scan_quota_per_day : 0;
    const limit = Math.max(settings.scanQuotaPerDay, fromPlan);
    const [{ used } = { used: 0 }] = await this.db
      .select({ used: sql<number>`count(*)::int` })
      .from(scanJobs)
      .where(and(eq(scanJobs.schoolId, schoolId), gte(scanJobs.createdAt, this.today()), ne(scanJobs.status, 'failed'), sql`coalesce(${scanJobs.engine}, '') <> 'cache'`));
    return { used, limit };
  }

  async createJob(actor: Actor, input: { mediaIds: string[]; teachingAssignmentId?: string }): Promise<ScanJobDto> {
    if (!this.engine) throw new AppError('internal', 'Chưa bật dịch vụ đọc đề');
    const ctx = await this.contextOf(actor, input.teachingAssignmentId);
    const ids = [...new Set(input.mediaIds)];
    const rows = await this.media.getMany(ids);
    const owner = ownerOf(actor);
    for (const id of ids) {
      const m = rows.find((r) => r.id === id);
      const mine = m && (owner.kind === 'user' ? m.uploadedBy === owner.userId : m.uploadedByStudentId === owner.studentId);
      if (!m || !mine || m.schoolId !== ctx.schoolId || m.kind !== 'photo') throw new AppError('validation_failed', 'Ảnh trang đề không hợp lệ, chụp lại nhé');
      if (m.status === 'uploading') throw new AppError('validation_failed', 'Ảnh chưa tải lên xong, đợi một chút nhé');
      if (!IMAGE_MIME.has(m.mimeType)) throw new AppError('validation_failed', 'Ảnh cần là JPEG, PNG hoặc WebP');
    }
    // Băm nội dung ảnh (đúng thứ tự trang) để nhận ra trang đã quét
    const digests = await Promise.all(ids.map(async (id) => createHash('sha256').update((await this.media.readBytes(id)).bytes).digest('hex')));
    const imageHash = createHash('sha256').update(digests.join(',')).digest('hex');
    const base = {
      schoolId: ctx.schoolId,
      requestedBy: actor.kind === 'user' ? actor.userId : null,
      requestedByStudent: actor.kind === 'student' ? actor.studentId : null,
      sourceMediaIds: ids,
      imageHash,
    };

    const [cached] = await this.db
      .select()
      .from(scanJobs)
      .where(and(eq(scanJobs.schoolId, ctx.schoolId), eq(scanJobs.imageHash, imageHash), eq(scanJobs.status, 'done')))
      .limit(1);
    if (cached) {
      const [job] = await this.db.insert(scanJobs).values({ ...base, status: 'done', engine: 'cache', result: cached.result, finishedAt: this.clock.now() }).returning();
      return this.toDto(job!);
    }

    const q = await this.quota(ctx.schoolId);
    if (q.used >= q.limit) throw new AppError('rate_limited', `Hôm nay đã quét đủ ${q.limit} lượt, mai quét tiếp nhé`);
    const [job] = await this.db.insert(scanJobs).values({ ...base, status: 'queued', result: { hints: { grade: ctx.grade, subject: ctx.subjectName } } }).returning();
    await this.queue.add(QUEUES.scan, 'scan', { scanJobId: job!.id }, { jobId: `scan-${job!.id}`, attempts: 3 });
    return this.toDto(job!);
  }

  private async load(actor: Actor, id: string) {
    const [job] = await this.db.select().from(scanJobs).where(eq(scanJobs.id, id));
    const mine = job && (actor.kind === 'user' ? job.requestedBy === actor.userId : job.requestedByStudent === actor.studentId);
    if (!job || !mine) throw new AppError('not_found', 'Không tìm thấy lượt quét');
    return job;
  }

  async getJob(actor: Actor, id: string) {
    return this.toDto(await this.load(actor, id));
  }

  private async toDto(job: JobRow): Promise<ScanJobDto> {
    const views = await this.media.views(job.sourceMediaIds);
    const done = job.status === 'done';
    return {
      id: job.id,
      status: job.status as ScanJobDto['status'],
      cached: job.engine === 'cache',
      result: done ? (job.result as ScanResult) : null,
      sourceMedia: job.sourceMediaIds.map((id) => views.get(id)).filter((v) => Boolean(v)) as ScanJobDto['sourceMedia'],
      error: job.status === 'failed' ? ((job.result as { error?: string } | null)?.error ?? 'Chưa đọc được đề') : null,
      quota: await this.quota(job.schoolId),
    };
  }

  /** Worker: đọc ảnh → AI chép đề → lưu kết quả. Lỗi tạm thì ném ra để hàng đợi thử lại. */
  async run(scanJobId: string, attempt: number, maxAttempts: number) {
    if (!this.engine) return;
    const [job] = await this.db.select().from(scanJobs).where(eq(scanJobs.id, scanJobId));
    if (!job || job.status === 'done' || job.status === 'failed') return;
    await this.db.update(scanJobs).set({ status: 'running' }).where(eq(scanJobs.id, job.id));
    const hints = ((job.result as { hints?: { grade?: number; subject?: string } } | null)?.hints) ?? {};
    try {
      const images: ScanImage[] = [];
      for (const id of job.sourceMediaIds) {
        const f = await this.media.readBytes(id);
        images.push({ bytes: f.bytes, mimeType: f.mimeType as ScanImage['mimeType'] });
      }
      const result = await this.engine.extract(images, { grade: hints.grade ?? undefined, subject: hints.subject });
      if (result.items.length === 0) throw new ScanError('Không thấy câu hỏi nào trong ảnh. Chụp thẳng, đủ sáng, rõ chữ nhé', false);
      await this.db.update(scanJobs).set({ status: 'done', engine: this.engine.id, result, finishedAt: this.clock.now() }).where(eq(scanJobs.id, job.id));
    } catch (err) {
      const retryable = err instanceof ScanError ? err.retryable : true;
      if (retryable && attempt < maxAttempts) {
        await this.db.update(scanJobs).set({ status: 'queued' }).where(eq(scanJobs.id, job.id));
        throw err;
      }
      const message = err instanceof ScanError ? err.message : 'Chưa đọc được đề, thử lại sau nhé';
      this.logger.warn(`Quét đề ${job.id} lỗi: ${String(err)}`);
      await this.db.update(scanJobs).set({ status: 'failed', engine: this.engine.id, result: { error: message }, finishedAt: this.clock.now() }).where(eq(scanJobs.id, job.id));
    }
  }

  /** Học sinh lớp 6–9 lưu kết quả quét (đã soát) thành bài tự luyện. */
  async createPractice(actor: Actor, input: { scanJobId: string; subjectId: number; title: string; items: Parameters<AssignmentsService['createPractice']>[1]['items'] }) {
    if (actor.kind !== 'student') throw new AppError('forbidden', 'Bài tự luyện dành cho học sinh');
    const job = await this.load(actor, input.scanJobId);
    if (job.status !== 'done') throw new AppError('validation_failed', 'Đề chưa đọc xong');
    const ctx = await this.contextOf(actor);
    return this.assignments.createPractice(actor, { schoolId: job.schoolId, subjectId: input.subjectId, grade: ctx.grade!, title: input.title, items: input.items, originalMediaIds: job.sourceMediaIds });
  }
}
