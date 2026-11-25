import { Inject, Injectable } from '@nestjs/common';
import type { FamilySpaceDto } from '@nopi/contracts';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { familyAcademicYear, type Grade } from '@nopi/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, type Actor, type Clock, type UserActor } from '../../../platform/index.js';
import { BillingService, EntitlementService } from '../../billing/public-api.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { GuardianService, StudentDirectory, UserDirectory } from '../../identity/public-api.js';
import { AccessService } from './access.service.js';

const { schools, schoolMembers, academicYears, classes, enrollments, teachingAssignments } = schema;

/**
 * Không gian gia đình (mục 4, 6.7): phụ huynh mua trực tiếp, tự giao bài và nhận xét cho con.
 * Một gia đình là một "trường" nhỏ (kind=family): mỗi con một lớp, bố mẹ được phân công mọi môn của khối,
 * nên giao bài/nộp bài/chấm/thông báo dùng lại nguyên hệ thống của trường.
 */
@Injectable()
export class FamilyService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly users: UserDirectory,
    private readonly students: StudentDirectory,
    private readonly guardians: GuardianService,
    private readonly curriculum: CurriculumService,
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditLog,
  ) {}

  private requireUser(actor: Actor): UserActor {
    if (actor.kind !== 'user') throw new AppError('forbidden', 'Chức năng dành cho bố mẹ');
    return actor;
  }

  private async mySpaceIds(userId: string) {
    const rows = await this.db
      .select({ id: schools.id })
      .from(schoolMembers)
      .innerJoin(schools, eq(schools.id, schoolMembers.schoolId))
      .where(and(eq(schoolMembers.userId, userId), eq(schoolMembers.role, 'guardian_owner'), eq(schools.kind, 'family')));
    return rows.map((r) => r.id);
  }

  async requireOwner(actor: Actor, spaceId: string): Promise<UserActor> {
    const user = this.requireUser(actor);
    if (!(await this.access.rolesIn(user.userId, spaceId)).includes('guardian_owner')) throw new AppError('forbidden', 'Bạn không quản lý không gian gia đình này');
    return user;
  }

  private async currentYear(spaceId: string, tx: DbOrTx = this.db) {
    const y = familyAcademicYear(this.clock.now());
    const [existing] = await tx.select().from(academicYears).where(and(eq(academicYears.schoolId, spaceId), eq(academicYears.name, y.name)));
    if (existing) return existing;
    const [row] = await tx.insert(academicYears).values({ schoolId: spaceId, ...y }).returning();
    return row!;
  }

  /** Tạo (hoặc trả về) không gian gia đình của người này; lần đầu được dùng thử 7 ngày, tự thêm các con đã liên kết. */
  async createOrGet(actor: Actor): Promise<FamilySpaceDto> {
    const user = this.requireUser(actor);
    const [existing] = await this.mySpaceIds(user.userId);
    if (existing) return this.get(actor, existing);
    const me = await this.users.get(user.userId);
    const spaceId = await this.db.transaction(async (tx) => {
      const given = me.fullName.trim().split(/\s+/).pop();
      const [space] = await tx.insert(schools).values({ kind: 'family', name: given ? `Gia đình ${given}` : 'Gia đình của tôi' }).returning();
      await tx.insert(schoolMembers).values({ schoolId: space!.id, userId: user.userId, role: 'guardian_owner' });
      await this.billing.startFamilyTrial(space!.id, user.userId, tx);
      await this.audit.record({ actor, action: 'family.create', targetType: 'school', targetId: space!.id, schoolId: space!.id }, tx);
      return space!.id;
    });
    // Các con đang học ở trường: thêm luôn, lấy khối hiện tại
    for (const child of await this.guardians.listChildren(user.userId)) {
      const grade = (await this.access.currentClassesOf(child.studentId)).find((c) => c.schoolId !== spaceId)?.grade;
      if (grade) await this.addChild(actor, spaceId, { studentId: child.studentId, grade: grade as Grade }).catch(() => undefined);
    }
    return this.get(actor, spaceId);
  }

  async mine(actor: Actor): Promise<FamilySpaceDto | null> {
    const user = this.requireUser(actor);
    const [id] = await this.mySpaceIds(user.userId);
    return id ? this.get(actor, id) : null;
  }

  async get(actor: Actor, spaceId: string): Promise<FamilySpaceDto> {
    await this.requireOwner(actor, spaceId);
    const [space] = await this.db.select().from(schools).where(eq(schools.id, spaceId));
    const year = await this.currentYear(spaceId);
    const rows = await this.db
      .select({ cls: classes, studentId: enrollments.studentId })
      .from(classes)
      .innerJoin(enrollments, and(eq(enrollments.classId, classes.id), eq(enrollments.status, 'active')))
      .where(eq(classes.academicYearId, year.id));
    const names = await this.students.namesOf(rows.map((r) => r.studentId));
    const tas = rows.length
      ? await this.db.select().from(teachingAssignments).where(and(inArray(teachingAssignments.classId, rows.map((r) => r.cls.id)), isNull(teachingAssignments.validTo)))
      : [];
    return {
      id: space!.id,
      name: space!.name,
      entitlement: await this.entitlements.get(spaceId),
      children: rows.map((r) => ({
        studentId: r.studentId,
        fullName: names.get(r.studentId)!.fullName,
        nickname: names.get(r.studentId)!.nickname,
        classId: r.cls.id,
        grade: r.cls.grade as Grade,
        teachingAssignmentIds: tas.filter((t) => t.classId === r.cls.id).map((t) => t.id),
      })),
    };
  }

  /**
   * Thêm con vào không gian gia đình: một lớp riêng cho con (tên lớp = tên gọi ở nhà), bố mẹ "dạy" mọi môn của khối.
   * Con chưa có hồ sơ (chưa vào trường nào dùng Nopi) thì tạo hồ sơ mới và liên kết luôn.
   */
  async addChild(actor: Actor, spaceId: string, input: { studentId: string; grade?: Grade } | { fullName: string; nickname?: string; grade: Grade }) {
    const user = await this.requireOwner(actor, spaceId);
    let studentId: string;
    let grade: Grade;
    if ('studentId' in input) {
      if (!(await this.guardians.isGuardian(user.userId, input.studentId))) throw new AppError('forbidden', 'Bạn chưa được liên kết với học sinh này');
      studentId = input.studentId;
      const fromSchool = (await this.access.currentClassesOf(studentId)).find((c) => c.schoolId !== spaceId)?.grade as Grade | undefined;
      const g = input.grade ?? fromSchool;
      if (!g) throw new AppError('validation_failed', 'Chọn con đang học lớp mấy');
      grade = g;
    } else {
      grade = input.grade;
      studentId = '';
    }

    const year = await this.currentYear(spaceId);
    const result = await this.db.transaction(async (tx) => {
      if (!studentId) {
        const s = await this.students.create({ homeSchoolId: spaceId, fullName: (input as { fullName: string }).fullName, nickname: (input as { nickname?: string }).nickname ?? null }, tx);
        studentId = s.id;
        await this.guardians.linkAsCreator(user, studentId, 'me', tx);
      }
      const [already] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, studentId), eq(enrollments.academicYearId, year.id), eq(enrollments.status, 'active')));
      if (already) throw new AppError('conflict', 'Con đã có trong không gian gia đình');
      const names = await this.students.namesOf([studentId], tx);
      const n = names.get(studentId)!;
      const [cls] = await tx
        .insert(classes)
        .values({ schoolId: spaceId, academicYearId: year.id, grade, name: n.nickname ?? n.fullName.split(' ').pop()!, homeroomTeacherId: user.userId })
        .returning();
      await tx.insert(enrollments).values({ schoolId: spaceId, studentId, classId: cls!.id, academicYearId: year.id });
      const { subjects } = await this.curriculum.subjectsOfGrade(grade);
      // Bỏ môn tự chọn (bố mẹ hiếm khi giao) — giữ danh mục gọn cho trẻ
      const core = subjects.filter((s) => !s.isOptional);
      if (core.length) {
        await tx.insert(teachingAssignments).values(core.map((s) => ({ schoolId: spaceId, teacherId: user.userId, classId: cls!.id, subjectId: s.id })));
      }
      await this.audit.record({ actor, action: 'family.child.add', targetType: 'student', targetId: studentId, studentId, schoolId: spaceId }, tx);
      return studentId;
    });
    return (await this.get(actor, spaceId)).children.find((c) => c.studentId === result)!;
  }

  async checkout(actor: Actor, spaceId: string, planId: string, provider: string, returnUrl: string) {
    const user = await this.requireOwner(actor, spaceId);
    return this.billing.checkout({ schoolId: spaceId, planId, provider, returnUrl, userId: user.userId, buyer: 'family' });
  }

  async storePurchase(actor: Actor, spaceId: string, input: { platform: 'apple' | 'google'; productId: string; token: string }) {
    const user = await this.requireOwner(actor, spaceId);
    return this.billing.verifyStorePurchase({ schoolId: spaceId, ...input, userId: user.userId });
  }
}
