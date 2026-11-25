import type { CreateReportInput, ReportType } from '@nopi/contracts';
import type { schema } from '@nopi/db';
import { Registry } from '@nopi/domain';
import type { UserActor } from '../../../platform/index.js';
import type { ReportDoc } from './report-doc.js';

export type ExportJobRow = typeof schema.exportJobs.$inferSelect;

/** Phạm vi đã được kiểm quyền, lưu vào export_jobs để worker dựng báo cáo (worker không kiểm lại quyền). */
export interface ReportScope {
  schoolId: string;
  classId?: string;
  studentId?: string;
  subjectId?: number;
  params?: Record<string, unknown>;
}

/**
 * Một loại báo cáo = một definition: ai được xuất (authorize) + dữ liệu gì (build → ReportDoc trung lập).
 * Thêm loại báo cáo mới = viết một class và đăng ký trong ReportRegistry; Excel/PDF dùng chung renderer.
 */
export interface ReportDefinition {
  readonly id: ReportType;
  authorize(actor: UserActor, input: CreateReportInput): Promise<ReportScope>;
  build(job: ExportJobRow): Promise<ReportDoc>;
}

export class ReportRegistry extends Registry<ReportDefinition> {
  constructor(defs: ReportDefinition[]) {
    super('loại báo cáo');
    defs.forEach((d) => this.register(d));
  }
}
