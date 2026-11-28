import { Inject, Injectable } from '@nestjs/common';
import type { AdminSchool } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { and, count, countDistinct, desc, eq, ilike, inArray } from 'drizzle-orm';
import { AppError, AuditLog, DB, type Actor, type UserActor } from '../../../platform/index.js';
import { EntitlementService } from '../../billing/public-api.js';
import { UserDirectory } from '../../identity/public-api.js';

const { schools, schoolMembers, classes, enrollments } = schema;

/**
 * Màn quản trị hệ thống (/quan-tri): xem mọi trường, đổi tên, tạm khoá/mở, gán/gỡ quản trị trường.
 * Chỉ quản trị hệ thống; mọi thay đổi ghi audit_logs.
 */
@Injectable()
export class AdminSchoolsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UserDirectory,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditLog,
  ) {}

  private requireSystemAdmin(actor: Actor): UserActor {
    if (actor.kind !== 'user' || !actor.isSystemAdmin) throw new AppError('forbidden', 'Chỉ quản trị hệ thống được làm việc này');
    return actor;
  }

  async list(actor: Actor, q: { q?: string; status?: 'active' | 'locked'; page: number; pageSize: number }) {
    this.requireSystemAdmin(actor);
    const where = and(
      eq(schools.kind, 'school'),
      q.q ? ilike(schools.name, `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : undefined,
      q.status ? eq(schools.status, q.status) : undefined,
    );
    const [{ total } = { total: 0 }] = await this.db.select({ total: count() }).from(schools).where(where);
    const rows = await this.db
      .select()
      .from(schools)
      .where(where)
      .orderBy(desc(schools.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return { items: await this.describe(rows), total, page: q.page, pageSize: q.pageSize };
  }

  async get(actor: Actor, schoolId: string): Promise<AdminSchool> {
    this.requireSystemAdmin(actor);
    const [row] = await this.db.select().from(schools).where(and(eq(schools.id, schoolId), eq(schools.kind, 'school')));
    if (!row) throw new AppError('not_found', 'Không tìm thấy trường');
    return (await this.describe([row]))[0]!;
  }

  async update(actor: Actor, schoolId: string, input: { name?: string; status?: 'active' | 'locked' }) {
    this.requireSystemAdmin(actor);
    const before = await this.get(actor, schoolId);
    await this.db
      .update(schools)
      .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.status !== undefined ? { status: input.status } : {}) })
      .where(eq(schools.id, schoolId));
    if (input.name !== undefined && input.name !== before.name) {
      await this.audit.record({ actor, action: 'school.rename', targetType: 'school', targetId: schoolId, schoolId, metadata: { from: before.name, to: input.name } });
    }
    if (input.status !== undefined && input.status !== before.status) {
      await this.audit.record({ actor, action: input.status === 'locked' ? 'school.lock' : 'school.unlock', targetType: 'school', targetId: schoolId, schoolId });
    }
    return this.get(actor, schoolId);
  }

  /** Gán quản trị trường theo SĐT (chưa có tài khoản thì tạo tài khoản "được mời", đăng nhập OTP là kích hoạt). */
  async addAdmin(actor: Actor, schoolId: string, input: { fullName: string; phone: string }) {
    this.requireSystemAdmin(actor);
    await this.get(actor, schoolId);
    await this.db.transaction(async (tx) => {
      const u = await this.users.findOrCreateInvited(input, tx);
      await tx.insert(schoolMembers).values({ schoolId, userId: u.id, role: 'admin' }).onConflictDoNothing();
      await this.audit.record({ actor, action: 'school.admin.add', targetType: 'user', targetId: u.id, schoolId }, tx);
    });
    return this.get(actor, schoolId);
  }

  /** Gỡ quyền quản trị (người đó vẫn là giáo viên nếu có vai trò giáo viên). Trường phải còn ít nhất một quản trị. */
  async removeAdmin(actor: Actor, schoolId: string, userId: string) {
    this.requireSystemAdmin(actor);
    const school = await this.get(actor, schoolId);
    if (!school.admins.some((a) => a.id === userId)) throw new AppError('not_found', 'Người này không phải quản trị của trường');
    if (school.admins.length <= 1) throw new AppError('conflict', 'Trường phải còn ít nhất một quản trị. Thêm quản trị mới trước khi gỡ người này.');
    await this.db
      .delete(schoolMembers)
      .where(and(eq(schoolMembers.schoolId, schoolId), eq(schoolMembers.userId, userId), eq(schoolMembers.role, 'admin')));
    await this.audit.record({ actor, action: 'school.admin.remove', targetType: 'user', targetId: userId, schoolId });
    return this.get(actor, schoolId);
  }

  /** Gắn số lớp, học sinh, giáo viên, quản trị, hợp đồng cho các trường (mỗi loại một truy vấn gộp). */
  private async describe(rows: (typeof schools.$inferSelect)[]): Promise<AdminSchool[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [classCounts, studentCounts, members] = await Promise.all([
      this.db.select({ schoolId: classes.schoolId, n: count() }).from(classes).where(inArray(classes.schoolId, ids)).groupBy(classes.schoolId),
      this.db
        .select({ schoolId: classes.schoolId, n: countDistinct(enrollments.studentId) })
        .from(enrollments)
        .innerJoin(classes, eq(classes.id, enrollments.classId))
        .where(and(inArray(classes.schoolId, ids), eq(enrollments.status, 'active')))
        .groupBy(classes.schoolId),
      this.db
        .select({ schoolId: schoolMembers.schoolId, userId: schoolMembers.userId, role: schoolMembers.role })
        .from(schoolMembers)
        .where(and(inArray(schoolMembers.schoolId, ids), inArray(schoolMembers.role, ['admin', 'teacher']))),
    ]);
    const people = new Map((await this.users.findByIds([...new Set(members.filter((m) => m.role === 'admin').map((m) => m.userId))])).map((u) => [u.id, u]));
    const contracts = await Promise.all(ids.map((id) => this.entitlements.get(id)));
    const num = (list: { schoolId: string; n: number }[], id: string) => Number(list.find((x) => x.schoolId === id)?.n ?? 0);

    return rows.map((r, i) => {
      const e = contracts[i]!;
      return {
        id: r.id,
        name: r.name,
        status: r.status as 'active' | 'locked',
        createdAt: r.createdAt.toISOString(),
        classCount: num(classCounts, r.id),
        studentCount: num(studentCounts, r.id),
        teacherCount: new Set(members.filter((m) => m.schoolId === r.id && m.role === 'teacher').map((m) => m.userId)).size,
        admins: members
          .filter((m) => m.schoolId === r.id && m.role === 'admin')
          .map((m) => people.get(m.userId))
          .filter((u): u is NonNullable<typeof u> => Boolean(u))
          .map((u) => ({ id: u.id, fullName: u.fullName, phone: u.phone, status: u.status as 'invited' | 'active' | 'locked' })),
        contract: e.status === 'none' ? null : { planName: e.planName, until: e.currentPeriodEnd, status: e.status },
      };
    });
  }
}
