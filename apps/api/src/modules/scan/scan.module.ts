import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/index.js';
import { AssignmentsModule } from '../assignments/public-api.js';
import { BillingModule } from '../billing/public-api.js';
import { CurriculumModule } from '../curriculum/public-api.js';
import { MediaModule } from '../media/public-api.js';
import { OrgModule } from '../org/public-api.js';
import { ScanService } from './application/scan.service.js';
import { ScanController } from './http/scan.controller.js';
import { ClaudeScanEngine, FakeScanEngine, SCAN_ENGINE } from './ports/scan-engine.js';

@Module({
  imports: [MediaModule, OrgModule, BillingModule, CurriculumModule, AssignmentsModule],
  controllers: [ScanController],
  providers: [
    {
      provide: SCAN_ENGINE,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => (c.SCAN_ENGINE === 'claude' ? new ClaudeScanEngine() : c.SCAN_ENGINE === 'fake' ? new FakeScanEngine() : null),
    },
    ScanService,
  ],
  exports: [ScanService],
})
export class ScanModule {}
