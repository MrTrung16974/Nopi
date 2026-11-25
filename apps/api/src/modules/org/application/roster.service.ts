import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database, type DbOrTx } from '@nopi/db';
import { canUsePinLogin } from '@nopi/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AppError, AuditLog, DB, type Actor } from '../../../platform/index.js';
import { StudentCredentialsService, StudentDirectory } from '../../identity/public-api.js';
import { AccessService, type ClassRow } from './access.service.js';

const { enrollments, students } = schema;

/** Danh sách học sinh của lớp và các việc nhà trường làm cho học sinh (thẻ, phiếu mời, PIN). */
@Injectable()
export class RosterService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly directory: StudentDirectory,
    private readonly credentials: StudentCredentialsService,
    private readonly audit: AuditLog,
  ) {}

  /** Tạo hồ sơ + ghi danh vào lớp. Dùng chung cho thêm tay và nhập Excel. */
  async enrollNew(
    cls: ClassRow,
    input: { fullName: string; nickname?: string | null; birthDate?: string | null },
    tx: DbOrTx,
  ) {
    const s = await this.directory.create({ homeSchoolId: cls.schoolId, ...input }, tx);
    await tx.insert(enrollments).values({
      schoolId: cls.schoolId,
      studentId: s.id,
      classId: cls.id,
      academicYearId: cls.academicYearId,
    });
    return s;
  }

  async addStudent(actor: Actor, classId: string, input: { fullName: string; nickname?: string; birthDate?: string }) {
    const { cls } = await this.access.requireClassStaff(actor, classId, { homeroomOnly: true });
    const s = await this.db.transaction((tx) => this.enrollNew(cls, input, tx));
    await this.audit.record({ actor, action: 'student.create', targetType: 'student', targetId: s.id, studentId: s.id, schoolId: cls.schoolId });
    return (await this.listStudents(actor, classId)).find((x) => x.id === s.id)!;
  }

  async activeStudentIds(classId: string) {
    const rows = await this.db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')));
    return rows.map((r) => r.id);
  }

  async listStudents(actor: Actor, classId: string) {
    await this.access.requireClassStaff(actor, classId);
    const rows = await this.db
      .select({ id: students.id, fullName: students.fullName, nickname: students.nickname, birthDate: students.birthDate })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')))
      .orderBy(asc(students.fullName));
    const extra = await this.directory.summaries(rows.map((r) => r.id));
    return rows
      .map((r) => {
        const e = extra.get(r.id)!;
        return { ...r, studentCode: e.studentCode, guardianCount: e.guardianCount, hasPin: e.hasPin };
      })
      .sort((a, b) => lastName(a.fullName).localeCompare(lastName(b.fullName), 'vi') || a.fullName.localeCompare(b.fullName, 'vi'));
  }

  /** Lọc danh sách học sinh được yêu cầu về đúng các em đang học trong lớp. */
  private async pickStudents(classId: string, requested?: string[]) {
    const ids = await this.activeStudentIds(classId);
    if (!requested) return ids;
    const notInClass = requested.filter((id) => !ids.includes(id));
    if (notInClass.length) throw new AppError('validation_failed', 'Có học sinh không thuộc lớp này');
    return requested;
  }

  private async printable(cls: ClassRow, issued: { studentId: string; code: string; qrPayload: string; expiresAt: Date }[]) {
    if (issued.length === 0) return [];
    const names = await this.db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(inArray(students.id, issued.map((i) => i.studentId)));
    const byId = new Map(names.map((n) => [n.id, n.fullName]));
    return issued
      .map((i) => ({ ...i, fullName: byId.get(i.studentId)!, className: cls.name, expiresAt: i.expiresAt.toISOString() }))
      .sort((a, b) => lastName(a.fullName).localeCompare(lastName(b.fullName), 'vi'));
  }

  /** In thẻ QR đăng nhập cho cả lớp hoặc vài em ("Cấp lại" khi mất thẻ). */
  async issueLoginCards(actor: Actor, classId: string, studentIds?: string[]) {
    const { cls } = await this.access.requireClassStaff(actor, classId);
    const ids = await this.pickStudents(classId, studentIds);
    const issued = await this.credentials.issueLoginCards(ids, actor);
    await this.audit.record({ actor, action: 'student.card.issue', targetType: 'class', targetId: classId, schoolId: cls.schoolId, metadata: { count: ids.length } });
    return this.printable(cls, issued);
  }

  /** In phiếu mời phụ huynh (QR + mã). */
  async issueGuardianInvites(actor: Actor, classId: string, studentIds?: string[]) {
    const { cls } = await this.access.requireClassStaff(actor, classId);
    const ids = await this.pickStudents(classId, studentIds);
    const issued = await this.credentials.issueGuardianInvites(cls.schoolId, ids, actor);
    await this.audit.record({ actor, action: 'guardian.invite.issue', targetType: 'class', targetId: classId, schoolId: cls.schoolId, metadata: { count: ids.length } });
    return this.printable(cls, issued);
  }

  /** Đặt PIN: phụ huynh của em hoặc thầy cô phụ trách. Chỉ lớp 4–9. */
  async setPin(actor: Actor, studentId: string, pin: string) {
    const { grade } = await this.access.requireStudentManager(actor, studentId);
    if (grade === null) throw new AppError('validation_failed', 'Học sinh chưa vào lớp nào');
    if (!canUsePinLogin(grade)) {
      throw new AppError('validation_failed', 'Học sinh lớp 1–3 đăng nhập bằng ảnh hoặc thẻ QR, không cần mã PIN');
    }
    await this.credentials.setPin(studentId, pin, actor);
  }
}

/** Sắp xếp theo tên (chữ cuối) như sổ điểm Việt Nam. */
const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;
