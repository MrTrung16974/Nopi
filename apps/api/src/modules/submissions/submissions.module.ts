import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/public-api.js';
import { IdentityModule } from '../identity/public-api.js';
import { MediaModule } from '../media/public-api.js';
import { OrgModule } from '../org/public-api.js';
import { SubmissionsService } from './application/submissions.service.js';
import { SubmissionsController } from './http/submissions.controller.js';

@Module({
  imports: [AssignmentsModule, MediaModule, OrgModule, IdentityModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
