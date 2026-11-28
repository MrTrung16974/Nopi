import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@nopi/db';
import type { Grade } from '@nopi/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppError, DB, type Actor } from '../../../platform/index.js';
import { AccessService } from './access.service.js';

const { teachingAssignments, classes, enrollments, schools, academicYears } = schema;

export interface TeachingRef {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: number;
  teacherId: string;
  isCurrent: boolean;
  class: { id: string; name: string; grade: Grade };
}

/**
 * Cửa đọc phân công giảng dạy cho các mô-đun khác (giao bài, chấm bài, báo cáo).
 * Quy tắc "ai là giáo viên của lớp–môn" nằm ở đây, không rải ra các mô-đun.
 */
@Injectable()
export class TeachingReader {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  private async load(where: ReturnType<typeof eq>) {
    const rows = await this.db
      .select({ ta: teachingAssignments, cls: classes })
      .from(teachingAssignments)
      .innerJoin(classes, eq(classes.id, teachingAssignments.classId))
      .where(where);
    return rows.map(({ ta, cls }) => ({
      id: ta.id,
      schoolId: ta.schoolId,
      classId: ta.classId,
      subjectId: ta.subjectId,
      teacherId: ta.teacherId,
      isCurrent: ta.validTo === null,
      class: { id: cls.id, name: cls.name, grade: cls.grade as Grade },
    }));
  }

  async getMany(ids: string[]): Promise<TeachingRef[]> {
    if (ids.length === 0) return [];
    return this.load(inArray(teachingAssignments.id, ids));
  }

  async get(id: string): Promise<TeachingRef> {
    const [r] = await this.getMany([id]);
    if (!r) throw new AppError('not_found', 'Không tìm thấy phân công lớp–môn');
    return r;
  }

  /** Các lớp–môn người này đang dạy (kể cả phụ huynh trong không gian gia đình). */
  async currentFor(userId: string): Promise<TeachingRef[]> {
    return this.load(and(eq(teachingAssignments.teacherId, userId), isNull(teachingAssignments.validTo))!);
  }

  private async isAdmin(actor: Actor, schoolId: string) {
    if (actor.kind !== 'user') return false;
    if (actor.isSystemAdmin) return true;
    return (await this.access.rolesIn(actor.userId, schoolId)).includes('admin');
  }

  /** Giao bài: phải đang được phân công lớp–môn này (hoặc là quản trị trường). */
  async requireCanAssign(actor: Actor, ta: TeachingRef) {
    await this.access.requireSchoolActive(actor, ta.schoolId);
    if (actor.kind === 'user' && ta.isCurrent && ta.teacherId === actor.userId) return;
    if (await this.isAdmin(actor, ta.schoolId)) return;
    throw new AppError('forbidden', `Bạn không được phân công dạy môn này ở lớp ${ta.class.name}`);
  }

  /**
   * Xem/chấm bài: người đã giao (phân công gốc), giáo viên hiện tại của lớp–môn (khi đổi giáo viên giữa năm),
   * hoặc quản trị trường.
   */
  async requireCanGrade(actor: Actor, ta: TeachingRef) {
    await this.access.requireSchoolActive(actor, ta.schoolId);
    if (actor.kind === 'user') {
      if (ta.teacherId === actor.userId) return;
      const [current] = await this.db
        .select({ teacherId: teachingAssignments.teacherId })
        .from(teachingAssignments)
        .where(and(eq(teachingAssignments.classId, ta.classId), eq(teachingAssignments.subjectId, ta.subjectId), isNull(teachingAssignments.validTo)));
      if (current?.teacherId === actor.userId) return;
      if (await this.isAdmin(actor, ta.schoolId)) return;
    }
    throw new AppError('forbidden', 'Bạn không phụ trách bài này');
  }

  /** Mọi phân công của một lớp (kể cả đã kết thúc — bài cũ vẫn thuộc phân công cũ), cho báo cáo. */
  async forClass(classId: string): Promise<TeachingRef[]> {
    return this.load(eq(teachingAssignments.classId, classId));
  }

  /** Các lớp của một năm học (báo cáo toàn trường). */
  async classesOfYear(schoolId: string, academicYearId: string) {
    return this.db
      .select({ id: classes.id, name: classes.name, grade: classes.grade })
      .from(classes)
      .where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, academicYearId)))
      .orderBy(classes.grade, classes.name);
  }

  async schoolName(schoolId: string) {
    const [s] = await this.db.select({ name: schools.name }).from(schools).where(eq(schools.id, schoolId));
    if (!s) throw new AppError('not_found', 'Không tìm thấy trường');
    return s.name;
  }

  /** Năm học (kiểm tra thuộc đúng trường). */
  async academicYear(schoolId: string, academicYearId: string) {
    const [y] = await this.db
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.id, academicYearId), eq(academicYears.schoolId, schoolId)));
    if (!y) throw new AppError('not_found', 'Không tìm thấy năm học');
    return y;
  }

  /** Mọi người đang dạy ít nhất một lớp–môn (để gửi bản tổng hợp 20:00). */
  async allCurrentTeacherIds(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ id: teachingAssignments.teacherId }).from(teachingAssignments).where(isNull(teachingAssignments.validTo));
    return rows.map((r) => r.id);
  }

  async activeStudentIds(classId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')));
    return rows.map((r) => r.id);
  }

  /** Loại không gian của các trường (school/family) — để gắn nhãn "Bố mẹ giao". */
  async schoolKinds(ids: string[]): Promise<Map<string, 'school' | 'family'>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select({ id: schools.id, kind: schools.kind }).from(schools).where(inArray(schools.id, ids));
    return new Map(rows.map((r) => [r.id, r.kind as 'school' | 'family']));
  }

  async studentCounts(classIds: string[]): Promise<Map<string, number>> {
    if (classIds.length === 0) return new Map();
    const rows = await this.db
      .select({ classId: enrollments.classId, studentId: enrollments.studentId })
      .from(enrollments)
      .where(and(inArray(enrollments.classId, classIds), eq(enrollments.status, 'active')));
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.classId, (m.get(r.classId) ?? 0) + 1);
    return m;
  }
}
