import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/public-api.js';
import { CurriculumModule } from '../curriculum/public-api.js';
import { IdentityModule } from '../identity/public-api.js';
import { MediaModule } from '../media/public-api.js';
import { NotificationsModule } from '../notifications/public-api.js';
import { OrgModule } from '../org/public-api.js';
import { SubmissionsModule } from '../submissions/public-api.js';
import { AuditViewerService } from './application/audit-viewer.service.js';
import { ReportRegistry } from './application/report-definition.js';
import { ReportsService } from './application/reports.service.js';
import { SchoolStatsService } from './application/school-stats.service.js';
import { REPORT_REGISTRY } from './application/tokens.js';
import { ClassReport } from './definitions/class-report.js';
import { SchoolReport } from './definitions/school-report.js';
import { StudentReport } from './definitions/student-report.js';
import { ReportsController } from './http/reports.controller.js';

/** Thêm loại báo cáo: viết definition (definitions/) + thêm vào DEFINITIONS. */
const DEFINITIONS = [ClassReport, StudentReport, SchoolReport];

@Module({
  imports: [OrgModule, IdentityModule, CurriculumModule, AssignmentsModule, SubmissionsModule, MediaModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [
    ...DEFINITIONS,
    { provide: REPORT_REGISTRY, inject: DEFINITIONS, useFactory: (...defs: ClassReport[]) => new ReportRegistry(defs) },
    SchoolStatsService,
    ReportsService,
    AuditViewerService,
  ],
  exports: [ReportsService],
})
export class ReportingModule {}
