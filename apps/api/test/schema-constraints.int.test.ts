import { createDb, schema } from '@nopi/db';
import { afterAll, describe, expect, it } from 'vitest';

/** Các quy tắc nghiệp vụ quan trọng được CSDL bảo vệ, kể cả khi code có lỗi. */
describe('ràng buộc CSDL', () => {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  afterAll(() => close());

  async function seedClass() {
    const [school] = await db.insert(schema.schools).values({ name: 'TH Test' }).returning();
    const [year] = await db
      .insert(schema.academicYears)
      .values({ schoolId: school!.id, name: `2026-2027-${Math.random()}`, startsOn: '2026-09-05', endsOn: '2027-05-31' })
      .returning();
    const mk = (name: string, grade = 3) =>
      db.insert(schema.classes).values({ schoolId: school!.id, academicYearId: year!.id, grade, name }).returning();
    const [c3a] = await mk('3A');
    const [c3b] = await mk('3B');
    const [student] = await db
      .insert(schema.students)
      .values({ homeSchoolId: school!.id, studentCode: String(10_000_000 + Math.floor(Math.random() * 89_999_999)), fullName: 'Nguyễn Bống' })
      .returning();
    return { school: school!, year: year!, c3a: c3a!, c3b: c3b!, student: student!, mk };
  }

  /** postgres-js bọc lỗi trong DrizzleQueryError; lấy thông điệp gốc của Postgres. */
  const pgError = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      const err = e as { cause?: { message?: string }; message: string };
      return err.cause?.message ?? err.message;
    }
    return 'KHÔNG LỖI';
  };

  it('mã học sinh duy nhất toàn hệ thống (đăng nhập bằng mã HS + PIN không cần chọn trường)', async () => {
    const { school, student } = await seedClass();
    expect(await pgError(db.insert(schema.students).values({ homeSchoolId: school.id, studentCode: student.studentCode, fullName: 'Trùng mã' })))
      .toMatch(/students_code_uq/);
  });

  it('lớp chỉ từ 1 đến 9', async () => {
    const { mk } = await seedClass();
    expect(await pgError(mk('10A', 10))).toMatch(/classes_grade_chk/);
  });

  it('mỗi học sinh chỉ một lớp đang học trong một năm; chuyển lớp thì giữ lịch sử', async () => {
    const { school, year, c3a, c3b, student } = await seedClass();
    const enroll = (classId: string, status = 'active') =>
      db.insert(schema.enrollments).values({ schoolId: school.id, studentId: student.id, classId, academicYearId: year.id, status });
    await enroll(c3a.id);
    expect(await pgError(enroll(c3b.id))).toMatch(/enrollments_one_active_per_year_uq/);
    await enroll(c3b.id, 'transferred'); // dòng lịch sử thì được
  });

  it('mỗi lớp–môn chỉ một giáo viên phụ trách tại một thời điểm', async () => {
    const { school, c3a } = await seedClass();
    const [t1] = await db.insert(schema.users).values({ fullName: 'Cô Lan' }).returning();
    const [t2] = await db.insert(schema.users).values({ fullName: 'Cô Mai' }).returning();
    const assign = (teacherId: string, validTo: string | null = null) =>
      db.insert(schema.teachingAssignments).values({ schoolId: school.id, teacherId, classId: c3a.id, subjectId: 1, validTo });
    await assign(t1!.id, '2026-12-31'); // phân công cũ đã kết thúc
    await assign(t2!.id);
    expect(await pgError(assign(t1!.id))).toMatch(/teaching_assignments_current_uq/);
  });

  it('video tối đa 30 phút, kiểu nộp phải hợp lệ', async () => {
    const { school, student } = await seedClass();
    const base = {
      schoolId: school.id,
      ownerStudentId: student.id,
      title: 'Kể chuyện',
      gradingScheme: 'completion_level',
      dueAt: new Date(),
    };
    expect(await pgError(db.insert(schema.assignments).values({ ...base, submissionKinds: ['video'], maxMediaSeconds: 1801 })))
      .toMatch(/assignments_media_cap_chk/);
    expect(await pgError(db.insert(schema.assignments).values({ ...base, submissionKinds: ['tiktok'] })))
      .toMatch(/assignments_kinds_chk/);
    expect(await pgError(db.insert(schema.assignments).values({ ...base, title: 'x', submissionKinds: ['video'], maxMediaSeconds: 1800 })))
      .toBe('KHÔNG LỖI');
  });
});
