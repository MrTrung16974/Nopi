import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/public-api.js';
import { IdentityModule } from '../identity/public-api.js';
import { BillingModule } from '../billing/public-api.js';
import { FamilyService } from './application/family.service.js';
import { FamilyController } from './http/family.controller.js';
import { AccessService } from './application/access.service.js';
import { ImportService } from './application/import.service.js';
import { RosterService } from './application/roster.service.js';
import { SchoolsService } from './application/schools.service.js';
import { TeachingService } from './application/teaching.service.js';
import { StudentHomeService } from './application/student-home.service.js';
import { SpaceSettingsService } from './application/space-settings.service.js';
import { TeachingReader } from './application/teaching-reader.js';
import { StudentHomeController } from './http/student-home.controller.js';
import { ClassesController } from './http/classes.controller.js';
import { ImportsController } from './http/imports.controller.js';
import { SchoolsController } from './http/schools.controller.js';

@Module({
  imports: [IdentityModule, CurriculumModule, BillingModule],
  controllers: [SchoolsController, ClassesController, ImportsController, StudentHomeController, FamilyController],
  providers: [AccessService, SchoolsService, RosterService, TeachingService, ImportService, StudentHomeService, SpaceSettingsService, TeachingReader, FamilyService],
  exports: [AccessService, SpaceSettingsService, TeachingReader, FamilyService],
})
export class OrgModule {}
