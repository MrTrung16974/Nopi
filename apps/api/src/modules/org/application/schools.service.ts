import { Inject, Injectable } from '@nestjs/common';
import type { SchoolRole } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { generateJoinCode, type Grade } from '@nopi/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { AppError, AuditLog, DB, secureRandomInt, type Actor, type UserActor } from '../../../platform/index.js';
import { UserDirectory } from '../../identity/public-api.js';
import { AccessService } from './access.service.js';

const { schools, schoolMembers, academicYears, classes, enrollments } = schema;

@Injectable()
export class SchoolsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly users: UserDirectory,
    private readonly audit: AuditLog,
  ) {}

  /** Quản trị hệ thống tạo trường (bán theo hợp đồng); có thể mời luôn quản trị trường. */
  async createSchool(actor: Actor, input: { name: string; admin?: { fullName: string; phone: string } }) {
    if (actor.kind !== 'user' || !actor.isSystemAdmin) {
      throw new AppError('forbidden', 'Chỉ quản trị hệ thống được tạo trường');
    }
    return this.db.transaction(async (tx) => {
      const [school] = await tx.insert(schools).values({ name: input.name, kind: 'school' }).returning();
      if (input.admin) {
        const u = await this.users.findOrCreateInvited(input.admin, tx);
        await tx.insert(schoolMembers).values({ schoolId: school!.id, userId: u.id, role: 'admin' });
      }
      await this.audit.record({ actor, action: 'school.create', targetType: 'school', targetId: school!.id, schoolId: school!.id }, tx);
      return { id: school!.id, name: school!.name, kind: school!.kind as 'school' };
    });
  }

  async mySchools(actor: UserActor) {
    const rows = await this.db
      .select({ id: schools.id, name: schools.name, kind: schools.kind, role: schoolMembers.role })
      .from(schoolMembers)
      .innerJoin(schools, eq(schools.id, schoolMembers.schoolId))
      .where(eq(schoolMembers.userId, actor.userId))
      .orderBy(asc(schools.name));
    const map = new Map<string, { id: string; name: string; kind: 'school' | 'family'; roles: SchoolRole[] }>();
    for (const r of rows) {
      const s = map.get(r.id) ?? { id: r.id, name: r.name, kind: r.kind as 'school' | 'family', roles: [] };
      s.roles.push(r.role as SchoolRole);
      map.set(r.id, s);
    }
    return [...map.values()];
  }

  // ----- Năm học -----
  async createAcademicYear(actor: Actor, schoolId: string, input: { name: string; startsOn: string; endsOn: string }) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    const [row] = await this.db
      .insert(academicYears)
      .values({ schoolId, ...input })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AppError('conflict', `Năm học ${input.name} đã có`);
    return { id: row.id, name: row.name, startsOn: row.startsOn, endsOn: row.endsOn };
  }

  async listAcademicYears(actor: Actor, schoolId: string) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin', 'teacher']);
    return this.db
      .select({ id: academicYears.id, name: academicYears.name, startsOn: academicYears.startsOn, endsOn: academicYears.endsOn })
      .from(academicYears)
      .where(eq(academicYears.schoolId, schoolId))
      .orderBy(sql`${academicYears.startsOn} desc`);
  }

  async requireYearOfSchool(schoolId: string, yearId: string, tx: DbOrTx = this.db) {
    const [y] = await tx
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.id, yearId), eq(academicYears.schoolId, schoolId)));
    if (!y) throw new AppError('not_found', 'Không tìm thấy năm học của trường');
    return y;
  }

  // ----- Lớp -----
  private async newJoinCode(tx: DbOrTx) {
    for (let i = 0; i < 5; i++) {
      const code = generateJoinCode(secureRandomInt);
      const [taken] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code));
      if (!taken) return code;
    }
    throw new AppError('internal', 'Chưa tạo được mã lớp, vui lòng thử lại');
  }

  async createClass(
    actor: Actor,
    schoolId: string,
    input: { academicYearId: string; grade: Grade; name: string; homeroomTeacherId?: string },
  ) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    await this.requireYearOfSchool(schoolId, input.academicYearId);
    if (input.homeroomTeacherId) await this.requireTeacherOfSchool(schoolId, input.homeroomTeacherId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(classes)
        .values({
          schoolId,
          academicYearId: input.academicYearId,
          grade: input.grade,
          name: input.name.toUpperCase(),
          homeroomTeacherId: input.homeroomTeacherId ?? null,
          joinCode: await this.newJoinCode(tx),
        })
        .onConflictDoNothing()
        .returning();
      if (!row) throw new AppError('conflict', `Lớp ${input.name.toUpperCase()} đã có trong năm học này`);
      return { ...this.toClassDto(row), studentCount: 0 };
    });
  }

  private toClassDto(c: typeof classes.$inferSelect) {
    return {
      id: c.id,
      academicYearId: c.academicYearId,
      grade: c.grade as Grade,
      name: c.name,
      homeroomTeacherId: c.homeroomTeacherId,
      joinCode: c.joinCode,
    };
  }

  async listClasses(actor: Actor, schoolId: string, academicYearId: string) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin', 'teacher']);
    const rows = await this.db
      .select({
        cls: classes,
        studentCount: sql<number>`count(${enrollments.id}) filter (where ${enrollments.status} = 'active')::int`,
      })
      .from(classes)
      .leftJoin(enrollments, eq(enrollments.classId, classes.id))
      .where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, academicYearId)))
      .groupBy(classes.id)
      .orderBy(asc(classes.grade), asc(classes.name));
    return rows.map((r) => ({ ...this.toClassDto(r.cls), studentCount: r.studentCount }));
  }

  /** Tìm lớp theo tên trong một năm học (dùng khi nhập Excel). */
  async classesByName(schoolId: string, academicYearId: string) {
    const rows = await this.db
      .select()
      .from(classes)
      .where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, academicYearId)));
    return new Map(rows.map((c) => [c.name.toUpperCase(), c]));
  }

  // ----- Giáo viên -----
  async addTeacher(actor: Actor, schoolId: string, input: { fullName: string; phone: string; email?: string }, tx?: DbOrTx) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    const run = async (t: DbOrTx) => {
      const u = await this.users.findOrCreateInvited(input, t);
      await t.insert(schoolMembers).values({ schoolId, userId: u.id, role: 'teacher' }).onConflictDoNothing();
      return u;
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  async listTeachers(actor: Actor, schoolId: string) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin', 'teacher']);
    const members = await this.db
      .select({ userId: schoolMembers.userId })
      .from(schoolMembers)
      .where(and(eq(schoolMembers.schoolId, schoolId), inArray(schoolMembers.role, ['teacher', 'admin'])));
    const ids = [...new Set(members.map((m) => m.userId))];
    const users = await this.users.findByIds(ids);
    return users
      .map((u) => ({ id: u.id, fullName: u.fullName, phone: u.phone, status: u.status as 'invited' | 'active' | 'locked' }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }

  async requireTeacherOfSchool(schoolId: string, userId: string) {
    const roles = await this.access.rolesIn(userId, schoolId);
    if (!roles.some((r) => r === 'teacher' || r === 'admin' || r === 'guardian_owner')) {
      throw new AppError('validation_failed', 'Người này chưa là giáo viên của trường');
    }
  }
}
