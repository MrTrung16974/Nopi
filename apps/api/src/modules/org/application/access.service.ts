import { Inject, Injectable } from '@nestjs/common';
import type { SchoolRole } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import type { Grade } from '@nopi/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AppError, DB, type Actor, type UserActor } from '../../../platform/index.js';
import { GuardianService } from '../../identity/public-api.js';

const { schoolMembers, classes, teachingAssignments, enrollments } = schema;

export type ClassRow = typeof classes.$inferSelect;

/**
 * Nơi DUY NHẤT trả lời "người này được làm gì trong trường/lớp này".
 * Quản trị hệ thống được làm mọi việc (để hỗ trợ), mọi thao tác vẫn được ghi audit.
 */
@Injectable()
export class AccessService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly guardians: GuardianService,
  ) {}

  private requireUser(actor: Actor): UserActor {
    if (actor.kind !== 'user') throw new AppError('forbidden', 'Chức năng này dành cho thầy cô hoặc nhà trường');
    return actor;
  }

  async rolesIn(userId: string, schoolId: string): Promise<SchoolRole[]> {
    const rows = await this.db
      .select({ role: schoolMembers.role })
      .from(schoolMembers)
      .where(and(eq(schoolMembers.userId, userId), eq(schoolMembers.schoolId, schoolId)));
    return rows.map((r) => r.role as SchoolRole);
  }

  async requireSchoolRole(actor: Actor, schoolId: string, roles: SchoolRole[]): Promise<UserActor> {
    const user = this.requireUser(actor);
    if (user.isSystemAdmin) return user;
    const mine = await this.rolesIn(user.userId, schoolId);
    if (!mine.some((r) => roles.includes(r))) {
      throw new AppError('forbidden', 'Bạn không có quyền thực hiện việc này ở trường này');
    }
    return user;
  }

  async loadClass(classId: string): Promise<ClassRow> {
    const [c] = await this.db.select().from(classes).where(eq(classes.id, classId));
    if (!c) throw new AppError('not_found', 'Không tìm thấy lớp');
    return c;
  }

  /** Giáo viên của lớp = chủ nhiệm hoặc đang được phân công dạy ít nhất một môn ở lớp. */
  async isClassTeacher(userId: string, cls: ClassRow): Promise<boolean> {
    if (cls.homeroomTeacherId === userId) return true;
    const [row] = await this.db
      .select({ ok: sql<number>`1` })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.classId, cls.id),
          eq(teachingAssignments.teacherId, userId),
          isNull(teachingAssignments.validTo),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Quản trị trường hoặc giáo viên của lớp.
   * homeroomOnly: chỉ quản trị hoặc giáo viên chủ nhiệm (vd. thêm học sinh vào lớp).
   */
  async requireClassStaff(actor: Actor, classId: string, opts: { homeroomOnly?: boolean } = {}) {
    const user = this.requireUser(actor);
    const cls = await this.loadClass(classId);
    if (user.isSystemAdmin) return { user, cls };
    const roles = await this.rolesIn(user.userId, cls.schoolId);
    if (roles.includes('admin') || roles.includes('guardian_owner')) return { user, cls };
    const ok = opts.homeroomOnly ? cls.homeroomTeacherId === user.userId : await this.isClassTeacher(user.userId, cls);
    if (!ok) throw new AppError('forbidden', 'Bạn không phụ trách lớp này');
    return { user, cls };
  }

  /** Các lớp đang học của học sinh (có thể ở trường và ở không gian gia đình). */
  async currentClassesOf(studentId: string) {
    return this.db
      .select({ cls: classes })
      .from(enrollments)
      .innerJoin(classes, eq(classes.id, enrollments.classId))
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, 'active')))
      .then((rows) => rows.map((r) => r.cls));
  }

  /** Phụ huynh của em, hoặc nhân sự phụ trách một lớp em đang học. Trả về khối hiện tại của em. */
  async requireStudentManager(actor: Actor, studentId: string): Promise<{ user: UserActor; grade: Grade | null }> {
    const user = this.requireUser(actor);
    const current = await this.currentClassesOf(studentId);
    const grade = current.length ? (Math.max(...current.map((c) => c.grade)) as Grade) : null;
    if (user.isSystemAdmin || (await this.guardians.isGuardian(user.userId, studentId))) return { user, grade };
    for (const cls of current) {
      const roles = await this.rolesIn(user.userId, cls.schoolId);
      if (roles.includes('admin') || (await this.isClassTeacher(user.userId, cls))) return { user, grade };
    }
    throw new AppError('forbidden', 'Bạn không có quyền với học sinh này');
  }
}
