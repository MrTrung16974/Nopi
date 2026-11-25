import { Module } from '@nestjs/common';
import { CurriculumService } from './application/curriculum.service.js';
import { CurriculumController } from './http/curriculum.controller.js';
import { CurriculumRepository } from './infra/curriculum.repository.js';
import { TemplatesService } from './application/templates.service.js';
import { TemplatesController } from './http/templates.controller.js';

@Module({
  controllers: [CurriculumController, TemplatesController],
  providers: [CurriculumRepository, CurriculumService, TemplatesService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
