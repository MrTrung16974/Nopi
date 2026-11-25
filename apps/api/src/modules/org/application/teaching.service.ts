import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@nopi/db';
import { vnParts, type Grade } from '@nopi/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppError, AuditLog, CLOCK, DB, defineEvent, OutboxService, type Actor, type Clock } from '../../../platform/index.js';
import { CurriculumService } from '../../curriculum/public-api.js';
import { UserDirectory } from '../../identity/public-api.js';
import { AccessService, type ClassRow } from './access.service.js';
import { SchoolsService } from './schools.service.js';

const { teachingAssignments, classes } = schema;

/** Sự kiện: phân công lớp–môn thay đổi (thông báo cho giáo viên mới, cập nhật trang chủ học sinh…). */
export const TeachingAssignmentChanged = defineEvent<{
  classId: string;
  subjectId: number;
  teacherId: string | null;
  previousTeacherId: string | null;
}>()('TeachingAssignmentChanged');

@Injectable()
export class TeachingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly schools: SchoolsService,
    private readonly curriculum: CurriculumService,
    private readonly users: UserDirectory,
    private readonly outbox: OutboxService,
    private readonly audit: AuditLog,
  ) {}

  private today() {
    const p = vnParts(this.clock.now());
    return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }

  /** Các ô lớp × môn (theo chương trình của khối) cho nhiều lớp, mỗi ô kèm giáo viên hiện tại. */
  private async slotsFor(classRows: ClassRow[]) {
    if (classRows.length === 0) return [];
    const current = await this.db
      .select()
      .from(teachingAssignments)
      .where(and(inArray(teachingAssignments.classId, classRows.map((c) => c.id)), isNull(teachingAssignments.validTo)));
    const teachers = new Map((await this.users.findByIds([...new Set(current.map((t) => t.teacherId))])).map((u) => [u.id, u]));
    return Promise.all(
      classRows.map(async (cls) => {
        const { subjects } = await this.curriculum.subjectsOfGrade(cls.grade as Grade);
        return {
          classId: cls.id,
          className: cls.name,
          grade: cls.grade as Grade,
          slots: subjects.map((s) => {
            const ta = current.find((t) => t.classId === cls.id && t.subjectId === s.id);
            const t = ta ? teachers.get(ta.teacherId) : undefined;
            return {
              subjectId: s.id,
              subjectCode: s.code,
              subjectName: s.shortName,
              isOptional: s.isOptional,
              teacher: t ? { id: t.id, fullName: t.fullName } : null,
            };
          }),
        };
      }),
    );
  }

  async getClassTeaching(actor: Actor, classId: string) {
    const { cls } = await this.access.requireClassStaff(actor, classId);
    const [r] = await this.slotsFor([cls]);
    return { classId: r!.classId, className: r!.className, grade: r!.grade, slots: r!.slots };
  }

  /** Bảng phân công lớp × môn của cả năm học (màn quản trị). */
  async grid(actor: Actor, schoolId: string, academicYearId: string) {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    await this.schools.requireYearOfSchool(schoolId, academicYearId);
    const rows = await this.db
      .select()
      .from(classes)
      .where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, academicYearId)))
      .orderBy(classes.grade, classes.name);
    return this.slotsFor(rows);
  }

  /**
   * Giao lớp–môn cho giáo viên. Đã có người khác thì đóng phân công cũ (giữ lịch sử)
   * và mở phân công mới — bài cũ vẫn thuộc phân công cũ.
   */
  async assign(actor: Actor, classId: string, subjectId: number, teacherId: string | null, opts: { skipAuth?: boolean } = {}) {
    const cls = await this.access.loadClass(classId);
    if (!opts.skipAuth) await this.access.requireSchoolRole(actor, cls.schoolId, ['admin']);
    if (!(await this.curriculum.isSubjectInGrade(cls.grade as Grade, subjectId))) {
      throw new AppError('validation_failed', `Môn này không có trong chương trình lớp ${cls.grade}`);
    }
    if (teacherId) await this.schools.requireTeacherOfSchool(cls.schoolId, teacherId);

    const changed = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(teachingAssignments)
        .where(and(eq(teachingAssignments.classId, classId), eq(teachingAssignments.subjectId, subjectId), isNull(teachingAssignments.validTo)))
        .for('update');
      if ((current?.teacherId ?? null) === teacherId) return false;
      if (current) {
        await tx.update(teachingAssignments).set({ validTo: this.today() }).where(eq(teachingAssignments.id, current.id));
      }
      if (teacherId) {
        await tx.insert(teachingAssignments).values({ schoolId: cls.schoolId, classId, subjectId, teacherId, validFrom: this.today() });
      }
      await this.outbox.append(
        TeachingAssignmentChanged.create(classId, { classId, subjectId, teacherId, previousTeacherId: current?.teacherId ?? null }, cls.schoolId),
        tx,
      );
      await this.audit.record({ actor, action: 'teaching.assign', targetType: 'class', targetId: classId, schoolId: cls.schoolId, metadata: { subjectId, teacherId } }, tx);
      return true;
    });
    return { changed };
  }

  /** "Nhận tất cả môn của lớp" — cho giáo viên chủ nhiệm tiểu học: nhận các môn chưa ai dạy. */
  async claimAll(actor: Actor, classId: string, teacherId: string) {
    const cls = await this.access.loadClass(classId);
    const isAdmin = actor.kind === 'user' && (actor.isSystemAdmin || (await this.access.rolesIn(actor.userId, cls.schoolId)).includes('admin'));
    const isSelfHomeroom = actor.kind === 'user' && actor.userId === teacherId && cls.homeroomTeacherId === teacherId;
    if (!isAdmin && !isSelfHomeroom) {
      throw new AppError('forbidden', 'Chỉ quản trị trường hoặc giáo viên chủ nhiệm của lớp được nhận tất cả môn');
    }
    const [r] = await this.slotsFor([cls]);
    const free = r!.slots.filter((s) => !s.teacher);
    for (const s of free) await this.assign(actor, classId, s.subjectId, teacherId, { skipAuth: true });
    return { assigned: free.length };
  }
}
