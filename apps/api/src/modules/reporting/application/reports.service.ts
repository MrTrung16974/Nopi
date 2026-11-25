import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreateReportInput, ReportFormat, ReportJobDto, ReportType } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { schema, type Database } from '@nopi/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError, AuditLog, CLOCK, DB, JobQueue, QUEUES, type Actor, type Clock } from '../../../platform/index.js';
import { MediaService } from '../../media/public-api.js';
import { NotificationService } from '../../notifications/public-api.js';
import { PdfRenderer } from '../renderers/pdf.js';
import { XlsxRenderer } from '../renderers/xlsx.js';
import { REPORT_REGISTRY } from './tokens.js';
import type { ExportJobRow, ReportRegistry } from './report-definition.js';
import type { ReportRenderer } from './report-doc.js';

const { exportJobs } = schema;
/** Link tải dùng được trong 24 giờ kể từ lúc xong; file giữ thêm 1 ngày rồi job xoá media hết hạn dọn. */
const LINK_HOURS = 24;
const KEEP_DAYS = 2;
const MAX_PER_HOUR = 20;

/**
 * Xuất báo cáo (mục 6.6): API kiểm quyền + ghi export_jobs + xếp hàng; worker dựng ReportDoc theo
 * ReportRegistry, render Excel/PDF, cất lên kho (link có hạn) và báo người yêu cầu.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly renderers = new Map<ReportFormat, ReportRenderer>([
    ['xlsx', new XlsxRenderer()],
    ['pdf', new PdfRenderer()],
  ]);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REPORT_REGISTRY) private readonly registry: ReportRegistry,
    private readonly media: MediaService,
    private readonly notifications: NotificationService,
    private readonly queue: JobQueue,
    private readonly audit: AuditLog,
  ) {}

  async create(actor: Actor, input: CreateReportInput): Promise<ReportJobDto> {
    if (actor.kind !== 'user') throw new AppError('forbidden', 'Báo cáo dành cho thầy cô, nhà trường và phụ huynh');
    const scope = await this.registry.get(input.type).authorize(actor, input);
    const hourAgo = new Date(this.clock.now().getTime() - 3_600_000);
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(exportJobs)
      .where(and(eq(exportJobs.requestedBy, actor.userId), gte(exportJobs.createdAt, hourAgo)));
    if (n >= MAX_PER_HOUR) throw new AppError('rate_limited', 'Bạn đã xuất nhiều báo cáo trong 1 giờ qua, đợi một lát nhé');

    const [job] = await this.db
      .insert(exportJobs)
      .values({
        schoolId: scope.schoolId,
        reportType: input.type,
        format: input.format,
        classId: scope.classId ?? null,
        studentId: scope.studentId ?? null,
        subjectId: scope.subjectId ?? null,
        fromDate: input.from,
        toDate: input.to,
        params: scope.params ?? {},
        requestedBy: actor.userId,
      })
      .returning();
    await this.audit.record({
      actor,
      action: 'report.export',
      targetType: 'export_job',
      targetId: job!.id,
      schoolId: scope.schoolId,
      studentId: scope.studentId ?? null,
      metadata: { type: input.type, format: input.format, classId: scope.classId, from: input.from, to: input.to },
    });
    await this.queue.add(QUEUES.reports, 'report', { exportJobId: job!.id }, { jobId: `report-${job!.id}`, attempts: 2, backoff: { type: 'fixed', delay: 10_000 } });
    return this.toDto(job!);
  }

  private async load(actor: Actor, id: string) {
    const [job] = await this.db.select().from(exportJobs).where(eq(exportJobs.id, id));
    if (!job || actor.kind !== 'user' || job.requestedBy !== actor.userId) throw new AppError('not_found', 'Không tìm thấy báo cáo');
    return job;
  }

  async get(actor: Actor, id: string) {
    return this.toDto(await this.load(actor, id));
  }

  /** Worker gọi. Chạy lại an toàn: job đã xong thì bỏ qua. */
  async run(id: string, attempt = 1, maxAttempts = 1) {
    const [job] = await this.db.select().from(exportJobs).where(eq(exportJobs.id, id));
    if (!job || job.status === 'done') return;
    await this.db.update(exportJobs).set({ status: 'running' }).where(eq(exportJobs.id, id));
    const dir = await mkdtemp(join(tmpdir(), 'nopi-report-'));
    try {
      const doc = await this.registry.get(job.reportType).build(job);
      const renderer = this.renderers.get(job.format as ReportFormat)!;
      const out = join(dir, `report.${renderer.format}`);
      await renderer.render(doc, out);
      const mediaId = await this.media.storeGenerated({ schoolId: job.schoolId, userId: job.requestedBy, localPath: out, mimeType: renderer.mimeType, ext: renderer.format, keepDays: KEEP_DAYS });
      const fileName = `${doc.fileBase}.${renderer.format}`;
      await this.db
        .update(exportJobs)
        .set({ status: 'done', fileMediaId: mediaId, finishedAt: this.clock.now(), error: null, params: { ...(job.params as object), fileName, title: doc.title } })
        .where(eq(exportJobs.id, id));
      const role = (job.params as { audience?: string } | null)?.audience === 'guardian' ? 'guardian' : 'teacher';
      await this.notifications.enqueue([
        {
          template: 'report_ready',
          recipient: { kind: 'user', userId: job.requestedBy, role },
          ...vi.notify.reportReady({ title: doc.title }),
          data: { reportId: id, studentId: job.studentId ?? undefined },
          schoolId: job.schoolId,
          dedupeKey: `report:${id}`,
          respectQuietHours: false,
        },
      ]);
    } catch (err) {
      this.logger.error(`Xuất báo cáo ${id} lỗi (lần ${attempt}/${maxAttempts}): ${String(err)}`);
      const final = attempt >= maxAttempts || err instanceof AppError;
      await this.db
        .update(exportJobs)
        .set(final ? { status: 'failed', error: err instanceof AppError ? err.message : 'Không xuất được báo cáo, thử lại sau nhé', finishedAt: this.clock.now() } : { status: 'queued' })
        .where(eq(exportJobs.id, id));
      if (!final) throw err;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async toDto(job: ExportJobRow): Promise<ReportJobDto> {
    const base = job.finishedAt ?? job.createdAt;
    const expiresAt = new Date(base.getTime() + LINK_HOURS * 3_600_000);
    const params = (job.params ?? {}) as { fileName?: string };
    const fresh = job.status === 'done' && job.fileMediaId && this.clock.now() < expiresAt;
    return {
      id: job.id,
      type: job.reportType as ReportType,
      format: job.format as ReportFormat,
      status: job.status as ReportJobDto['status'],
      downloadUrl: fresh ? await this.media.downloadUrl(job.fileMediaId!, params.fileName) : null,
      fileName: params.fileName ?? null,
      expiresAt: expiresAt.toISOString(),
      error: job.error,
    };
  }
}
