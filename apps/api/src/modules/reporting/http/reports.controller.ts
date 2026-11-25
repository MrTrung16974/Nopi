import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { auditLogQuerySchema, createReportSchema, submissionStatsQuerySchema, type CreateReportInput } from '@nopi/contracts';
import type { z } from 'zod';
import { CurrentActor, ZodPipe, type Actor } from '../../../platform/index.js';
import { AccessService } from '../../org/public-api.js';
import { AuditViewerService } from '../application/audit-viewer.service.js';
import { ReportsService } from '../application/reports.service.js';
import { SchoolStatsService } from '../application/school-stats.service.js';

@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly stats: SchoolStatsService,
    private readonly auditViewer: AuditViewerService,
    private readonly access: AccessService,
  ) {}

  /** Yêu cầu xuất báo cáo (chạy nền). Gọi GET /reports/:id để lấy link tải khi xong. */
  @Post('reports')
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(createReportSchema)) b: CreateReportInput) {
    return this.reports.create(actor, b);
  }

  @Get('reports/:id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(actor, id);
  }

  /** Tỉ lệ nộp bài theo lớp × môn (quản trị trường). */
  @Get('schools/:schoolId/submission-stats')
  async submissionStats(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query(new ZodPipe(submissionStatsQuerySchema)) q: z.infer<typeof submissionStatsQuerySchema>,
  ) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    const rows = await this.stats.compute(schoolId, q.academicYearId, q.from, q.to);
    return { rows: rows.map(({ grade: _grade, ...r }) => r) };
  }

  /** Nhật ký truy cập (quản trị trường), phân trang lùi theo id. */
  @Get('schools/:schoolId/audit-logs')
  auditLogs(
    @CurrentActor() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query(new ZodPipe(auditLogQuerySchema)) q: z.infer<typeof auditLogQuerySchema>,
  ) {
    return this.auditViewer.list(actor, schoolId, q);
  }
}
