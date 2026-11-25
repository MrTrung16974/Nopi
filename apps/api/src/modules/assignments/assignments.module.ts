import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/public-api.js';
import { IdentityModule } from '../identity/public-api.js';
import { MediaModule } from '../media/public-api.js';
import { OrgModule } from '../org/public-api.js';
import { BillingModule } from '../billing/public-api.js';
import { AssignmentsService } from './application/assignments.service.js';
import { StudentWorkService } from './application/student-work.service.js';
import { AssignmentsController } from './http/assignments.controller.js';

@Module({
  imports: [OrgModule, CurriculumModule, MediaModule, IdentityModule, BillingModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, StudentWorkService],
  exports: [AssignmentsService, StudentWorkService],
})
export class AssignmentsModule {}
