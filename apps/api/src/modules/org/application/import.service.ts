import { Inject, Injectable } from '@nestjs/common';
import type { ImportResult } from '@nopi/contracts';
import { schema, type Database } from '@nopi/db';
import { normalizePersonName, normalizeVnPhone, parseVnDate } from '@nopi/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError, AuditLog, DB, type Actor } from '../../../platform/index.js';
import { buildTemplate, readSheet, type ColumnSpec } from './excel.js';
import { AccessService } from './access.service.js';
import { RosterService } from './roster.service.js';
import { SchoolsService } from './schools.service.js';

const { enrollments, students } = schema;
const MAX_ROWS = 2000;

const STUDENT_COLUMNS: ColumnSpec<'fullName' | 'nickname' | 'birthDate' | 'className'>[] = [
  { key: 'fullName', header: 'Họ và tên', aliases: ['ho va ten', 'ho ten', 'ten hoc sinh'], required: true, width: 28, example: 'Nguyễn Ngọc Bống' },
  { key: 'nickname', header: 'Tên gọi ở nhà', aliases: ['ten goi o nha', 'ten goi', 'biet danh'], width: 16, example: 'Bống' },
  { key: 'birthDate', header: 'Ngày sinh (dd/mm/yyyy)', aliases: ['ngay sinh'], width: 22, example: '05/09/2019' },
  { key: 'className', header: 'Lớp', aliases: ['lop'], required: true, width: 8, example: '1A' },
];

const TEACHER_COLUMNS: ColumnSpec<'fullName' | 'phone' | 'email'>[] = [
  { key: 'fullName', header: 'Họ và tên', aliases: ['ho va ten', 'ho ten', 'ten giao vien'], required: true, width: 28, example: 'Trần Thị Lan' },
  { key: 'phone', header: 'Số điện thoại', aliases: ['so dien thoai', 'sdt', 'dien thoai'], required: true, width: 16, example: '0912 345 678' },
  { key: 'email', header: 'Email (tuỳ chọn)', aliases: ['email'], width: 28, example: 'lan.tran@truong.edu.vn' },
];

type RowError = ImportResult['errors'][number];

/**
 * Nhập danh sách từ Excel. Luôn kiểm tra toàn bộ file trước; có lỗi thì không ghi gì
 * (tránh nhập dở dang), trả về lỗi từng dòng bằng tiếng Việt để giáo vụ sửa rồi tải lại.
 */
@Injectable()
export class ImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: AccessService,
    private readonly schools: SchoolsService,
    private readonly roster: RosterService,
    private readonly audit: AuditLog,
  ) {}

  studentTemplate() {
    return buildTemplate('Học sinh', STUDENT_COLUMNS, [
      'Mỗi dòng là một học sinh. Không đổi tên các cột ở dòng đầu.',
      'Cột "Lớp" phải trùng tên lớp đã tạo trong năm học (ví dụ 1A, 3B).',
      'Ngày sinh ghi dạng ngày/tháng/năm, ví dụ 05/09/2019. Có thể bỏ trống.',
      'Xoá dòng ví dụ (chữ nghiêng) trước khi tải lên.',
    ]);
  }

  teacherTemplate() {
    return buildTemplate('Giáo viên', TEACHER_COLUMNS, [
      'Mỗi dòng là một giáo viên. Số điện thoại dùng để giáo viên nhận mã kích hoạt.',
      'Giáo viên đã có trong trường (trùng số điện thoại) sẽ được bỏ qua, không tạo trùng.',
      'Xoá dòng ví dụ (chữ nghiêng) trước khi tải lên.',
    ]);
  }

  private result(dryRun: boolean, total: number, errors: RowError[], created = 0): ImportResult {
    const badRows = new Set(errors.map((e) => e.row)).size;
    return { dryRun, total, valid: total - badRows, created, errors };
  }

  async importStudents(actor: Actor, schoolId: string, academicYearId: string, file: Buffer, dryRun: boolean): Promise<ImportResult> {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    await this.schools.requireYearOfSchool(schoolId, academicYearId);
    const sheet = await readSheet(file, STUDENT_COLUMNS).catch(() => {
      throw new AppError('validation_failed', 'Không đọc được file. Vui lòng dùng file Excel (.xlsx) theo mẫu');
    });
    if (sheet.missingColumns.length) {
      throw new AppError('validation_failed', `File thiếu cột: ${sheet.missingColumns.join(', ')}. Vui lòng dùng file mẫu`);
    }
    if (sheet.rows.length > MAX_ROWS) throw new AppError('validation_failed', `Mỗi lần nhập tối đa ${MAX_ROWS} học sinh`);

    const classMap = await this.schools.classesByName(schoolId, academicYearId);
    const errors: RowError[] = [];
    const valid: { row: number; fullName: string; nickname: string | null; birthDate: string | null; classKey: string }[] = [];
    const seen = new Map<string, number>();

    for (const { rowNumber: row, values: v } of sheet.rows) {
      const before = errors.length;
      const fullName = typeof v.fullName === 'string' ? normalizePersonName(v.fullName) : '';
      if (fullName.length < 2) errors.push({ row, column: 'Họ và tên', message: 'Thiếu họ tên' });
      const classKey = typeof v.className === 'string' ? v.className.toUpperCase().replace(/\s+/g, '') : '';
      if (!classKey) errors.push({ row, column: 'Lớp', message: 'Thiếu tên lớp' });
      else if (!classMap.has(classKey)) errors.push({ row, column: 'Lớp', message: `Chưa có lớp "${classKey}" trong năm học này` });
      let birthDate: string | null = null;
      if (v.birthDate !== null) {
        birthDate = parseVnDate(v.birthDate);
        if (!birthDate) errors.push({ row, column: 'Ngày sinh', message: 'Ngày sinh chưa đúng, ghi dạng 05/09/2019' });
      }
      const dupKey = `${classKey}|${fullName.toLowerCase()}|${birthDate ?? ''}`;
      if (fullName && classKey && seen.has(dupKey)) {
        errors.push({ row, message: `Trùng với dòng ${seen.get(dupKey)} (cùng tên, ngày sinh, lớp)` });
      }
      seen.set(dupKey, row);
      if (errors.length === before) {
        valid.push({ row, fullName, nickname: typeof v.nickname === 'string' ? v.nickname : null, birthDate, classKey });
      }
    }

    // Học sinh đã có trong lớp (nhập lại cùng file) → báo trùng, không tạo thêm
    const classIds = [...new Set(valid.map((v) => classMap.get(v.classKey)!.id))];
    if (classIds.length) {
      const existing = await this.db
        .select({ classId: enrollments.classId, fullName: students.fullName, birthDate: students.birthDate })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(and(inArray(enrollments.classId, classIds), eq(enrollments.status, 'active')));
      const existingKeys = new Set(existing.map((e) => `${e.classId}|${e.fullName.toLowerCase()}|${e.birthDate ?? ''}`));
      for (const v of valid) {
        if (existingKeys.has(`${classMap.get(v.classKey)!.id}|${v.fullName.toLowerCase()}|${v.birthDate ?? ''}`)) {
          errors.push({ row: v.row, message: `${v.fullName} đã có trong lớp ${v.classKey}` });
        }
      }
    }

    errors.sort((a, b) => a.row - b.row);
    if (dryRun || errors.length) return this.result(dryRun, sheet.rows.length, errors);

    await this.db.transaction(async (tx) => {
      for (const v of valid) await this.roster.enrollNew(classMap.get(v.classKey)!, v, tx);
    });
    await this.audit.record({ actor, action: 'import.students', targetType: 'school', targetId: schoolId, schoolId, metadata: { count: valid.length, academicYearId } });
    return this.result(false, sheet.rows.length, [], valid.length);
  }

  async importTeachers(actor: Actor, schoolId: string, file: Buffer, dryRun: boolean): Promise<ImportResult> {
    await this.access.requireSchoolRole(actor, schoolId, ['admin']);
    const sheet = await readSheet(file, TEACHER_COLUMNS).catch(() => {
      throw new AppError('validation_failed', 'Không đọc được file. Vui lòng dùng file Excel (.xlsx) theo mẫu');
    });
    if (sheet.missingColumns.length) {
      throw new AppError('validation_failed', `File thiếu cột: ${sheet.missingColumns.join(', ')}. Vui lòng dùng file mẫu`);
    }
    if (sheet.rows.length > MAX_ROWS) throw new AppError('validation_failed', `Mỗi lần nhập tối đa ${MAX_ROWS} giáo viên`);

    const errors: RowError[] = [];
    const valid: { fullName: string; phone: string; email?: string }[] = [];
    const seenPhones = new Map<string, number>();
    for (const { rowNumber: row, values: v } of sheet.rows) {
      const before = errors.length;
      const fullName = typeof v.fullName === 'string' ? normalizePersonName(v.fullName) : '';
      if (fullName.length < 2) errors.push({ row, column: 'Họ và tên', message: 'Thiếu họ tên' });
      const phone = typeof v.phone === 'string' ? normalizeVnPhone(v.phone) : null;
      if (!phone) errors.push({ row, column: 'Số điện thoại', message: 'Số điện thoại chưa đúng, ví dụ 0912 345 678' });
      else if (seenPhones.has(phone)) errors.push({ row, column: 'Số điện thoại', message: `Trùng số điện thoại với dòng ${seenPhones.get(phone)}` });
      if (phone) seenPhones.set(phone, row);
      const email = typeof v.email === 'string' ? v.email : undefined;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ row, column: 'Email', message: 'Email chưa đúng' });
      if (errors.length === before) valid.push({ fullName, phone: phone!, email });
    }
    if (dryRun || errors.length) return this.result(dryRun, sheet.rows.length, errors);

    let created = 0;
    await this.db.transaction(async (tx) => {
      for (const t of valid) {
        const u = await this.schools.addTeacher(actor, schoolId, t, tx);
        if (u.created) created++;
      }
    });
    await this.audit.record({ actor, action: 'import.teachers', targetType: 'school', targetId: schoolId, schoolId, metadata: { count: valid.length } });
    return this.result(false, sheet.rows.length, [], created);
  }
}
