import { Module, type DynamicModule } from '@nestjs/common';
import { CurriculumModule } from './modules/curriculum/public-api.js';
import { IdentityModule } from './modules/identity/public-api.js';
import { OrgModule } from './modules/org/public-api.js';
import { MediaModule } from './modules/media/public-api.js';
import { AssignmentsModule } from './modules/assignments/public-api.js';
import { SubmissionsModule } from './modules/submissions/public-api.js';
import { NotificationsModule } from './modules/notifications/public-api.js';
import { BillingModule } from './modules/billing/public-api.js';
import { ScanModule } from './modules/scan/public-api.js';
import { ReportingModule } from './modules/reporting/public-api.js';
import type { Clock } from './platform/clock.js';
import type { AppConfig } from './platform/config.js';
import { HealthController } from './platform/health.controller.js';
import { PlatformModule } from './platform/platform.module.js';

/**
 * Danh sách mô-đun nghiệp vụ. Thêm mô-đun mới (identity, org, assignments, …) = thêm vào đây.
 * Thứ tự theo lộ trình: M1 identity, org · M2 assignments, submissions, grading, media · …
 */
export const FEATURE_MODULES = [CurriculumModule, IdentityModule, BillingModule, OrgModule, MediaModule, AssignmentsModule, SubmissionsModule, NotificationsModule, ScanModule, ReportingModule];

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, opts: { clock?: Clock } = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [PlatformModule.forRoot(config, opts), ...FEATURE_MODULES],
      controllers: [HealthController],
    };
  }
}
