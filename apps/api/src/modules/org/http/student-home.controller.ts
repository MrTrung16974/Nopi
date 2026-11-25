import { Controller, Get } from '@nestjs/common';
import { CurrentStudent, type StudentActor } from '../../../platform/index.js';
import { StudentHomeService } from '../application/student-home.service.js';

@Controller('student')
export class StudentHomeController {
  constructor(private readonly home: StudentHomeService) {}

  /** Dữ liệu trang chủ của học sinh đang đăng nhập. */
  @Get('me')
  me(@CurrentStudent() actor: StudentActor) {
    return this.home.home(actor.studentId);
  }
}
