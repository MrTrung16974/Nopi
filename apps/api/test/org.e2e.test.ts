import { classTeachingSchema, mySchoolSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addTeacher, api, loginByPhone, randomPhone, setupSchool, startTestApp, type TestApp } from './helpers.js';

describe('trường – lớp – phân công', () => {
  let t: TestApp;
  beforeAll(async () => (t = await startTestApp()));
  afterAll(() => t.close());

  it('chỉ quản trị hệ thống tạo được trường; quản trị trường được mời kích hoạt bằng OTP', async () => {
    const someone = await loginByPhone(t, randomPhone());
    expect((await api(t, someone.accessToken).post('/admin/schools', { name: 'Trường lạ' })).statusCode).toBe(403);

    const s = await setupSchool(t);
    const mine = (await s.A.get('/me/schools')).json();
    expect(mine.map((m: unknown) => mySchoolSchema.parse(m))).toEqual([{ id: s.school.id, name: s.school.name, kind: 'school', roles: ['admin'] }]);
    const [admin] = await t.db.select().from(schema.users).where(eq(schema.users.id, s.admin.user.id));
    expect(admin).toMatchObject({ status: 'active', fullName: 'Hiệu Trưởng' });
  });

  it('lớp: tên viết hoa, có mã mời 6 ký tự, không trùng trong năm học; khối 1–9', async () => {
    const s = await setupSchool(t, { classes: [{ grade: 3, name: '3b' }] });
    expect(s.classes['3b']).toMatchObject({ name: '3B', grade: 3, joinCode: expect.stringMatching(/^[A-Z0-9]{6}$/) });
    const dup = await s.A.post(`/schools/${s.school.id}/classes`, { academicYearId: s.year.id, grade: 3, name: '3B' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.message).toBe('Lớp 3B đã có trong năm học này');
    expect((await s.A.post(`/schools/${s.school.id}/classes`, { academicYearId: s.year.id, grade: 10, name: '10A' })).statusCode).toBe(400);
    const list = (await s.A.get(`/schools/${s.school.id}/classes?academicYearId=${s.year.id}`)).json();
    expect(list).toEqual([expect.objectContaining({ name: '3B', studentCount: 0 })]);
  });

  it('người ngoài trường không xem được gì của trường', async () => {
    const s = await setupSchool(t);
    const outsider = await loginByPhone(t, randomPhone());
    const O = api(t, outsider.accessToken);
    expect((await O.get(`/schools/${s.school.id}/teachers`)).statusCode).toBe(403);
    expect((await O.get(`/classes/${s.classes['1A']!.id}/students`)).statusCode).toBe(403);
    expect((await O.post(`/schools/${s.school.id}/academic-years`, { name: '2027-2028', startsOn: '2027-09-05', endsOn: '2028-05-31' })).statusCode).toBe(403);
  });

  it('vai trò guardian_owner lỡ gán ở trường thật không cho quản lý lớp (chỉ có hiệu lực ở không gian gia đình)', async () => {
    const s = await setupSchool(t);
    const parent = await loginByPhone(t, randomPhone());
    await t.db.insert(schema.schoolMembers).values({ schoolId: s.school.id, userId: parent.user.id, role: 'guardian_owner' });
    const P = api(t, parent.accessToken);
    const c1 = s.classes['1A']!.id;
    expect((await P.get(`/classes/${c1}/students`)).statusCode).toBe(403);
    expect((await P.post(`/classes/${c1}/login-cards`, {})).statusCode).toBe(403);
    expect((await P.get(`/schools/${s.school.id}/settings`)).statusCode).toBe(403);
  });

  it('phân công theo lớp–môn: kiểm môn thuộc khối, đổi giáo viên giữ lịch sử', async () => {
    const s = await setupSchool(t);
    const lan = await addTeacher(t, s.A, s.school.id, '  trần   thị lan '); // tên gõ tay được chuẩn hoá
    const mai = await addTeacher(t, s.A, s.school.id, 'Lê Thị Mai');
    const c4 = s.classes['4A']!.id;
    const subjectId = async (code: string) =>
      (await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, code)))[0]!.id;
    const toan = await subjectId('TOAN');

    const r1 = await s.A.put(`/classes/${c4}/teaching/${toan}`, { teacherId: lan.id });
    expect(r1.statusCode).toBe(200);
    const teaching = classTeachingSchema.parse(r1.json());
    expect(teaching.slots.find((x) => x.subjectCode === 'TOAN')?.teacher?.fullName).toBe('Trần Thị Lan');
    expect(teaching.slots.map((x) => x.subjectCode)).toContain('KHOA_HOC');

    // KHTN là môn THCS → không phân công được cho lớp 4
    const bad = await s.A.put(`/classes/${c4}/teaching/${await subjectId('KHTN')}`, { teacherId: lan.id });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toBe('Môn này không có trong chương trình lớp 4');

    // Đổi sang cô Mai: dòng cũ được đóng, không bị sửa đè
    await s.A.put(`/classes/${c4}/teaching/${toan}`, { teacherId: mai.id });
    const rows = await t.db
      .select()
      .from(schema.teachingAssignments)
      .where(and(eq(schema.teachingAssignments.classId, c4), eq(schema.teachingAssignments.subjectId, toan)));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.teacherId === lan.id)?.validTo).not.toBeNull();
    expect(rows.find((r) => r.teacherId === mai.id)?.validTo).toBeNull();

    // Phát sự kiện cho các mô-đun khác (thông báo…)
    const events = await t.db.select().from(schema.outbox).where(eq(schema.outbox.aggregateId, c4));
    expect(events.map((e) => e.eventType)).toEqual(['TeachingAssignmentChanged', 'TeachingAssignmentChanged']);
  });

  it('giáo viên xem được lớp mình dạy nhưng không tự phân công; người chưa là giáo viên của trường thì không được giao', async () => {
    const s = await setupSchool(t);
    const lan = await addTeacher(t, s.A, s.school.id);
    const c4 = s.classes['4A']!.id;
    const L = api(t, lan.token);
    expect((await L.get(`/classes/${c4}/students`)).statusCode).toBe(403); // chưa dạy lớp này

    const id = async (code: string) => (await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, code)))[0]!.id;
    await s.A.put(`/classes/${c4}/teaching/${await id('TIENG_VIET')}`, { teacherId: lan.id });
    expect((await L.get(`/classes/${c4}/students`)).statusCode).toBe(200);
    expect((await L.put(`/classes/${c4}/teaching/${await id('TOAN')}`, { teacherId: lan.id })).statusCode).toBe(403);

    const stranger = await loginByPhone(t, randomPhone());
    const res = await s.A.put(`/classes/${c4}/teaching/${await id('TOAN')}`, { teacherId: stranger.user.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('Người này chưa là giáo viên của trường');
  });

  it('giáo viên chủ nhiệm "Nhận tất cả môn": chỉ nhận các môn còn trống', async () => {
    const s = await setupSchool(t, { classes: [] });
    const lan = await addTeacher(t, s.A, s.school.id, 'Cô Chủ Nhiệm');
    const music = await addTeacher(t, s.A, s.school.id, 'Thầy Âm Nhạc');
    const cls = (await s.A.post(`/schools/${s.school.id}/classes`, { academicYearId: s.year.id, grade: 2, name: '2A', homeroomTeacherId: lan.id })).json();
    const amNhac = (await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, 'AM_NHAC')))[0]!.id;
    await s.A.put(`/classes/${cls.id}/teaching/${amNhac}`, { teacherId: music.id });

    // Giáo viên khác không nhận hộ được
    expect((await api(t, music.token).post(`/classes/${cls.id}/teaching/claim-all`, { teacherId: music.id })).statusCode).toBe(403);

    const res = await api(t, lan.token).post(`/classes/${cls.id}/teaching/claim-all`, { teacherId: lan.id });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const total = body.teaching.slots.length;
    expect(body.assigned).toBe(total - 1);
    expect(body.teaching.slots.find((x: { subjectCode: string }) => x.subjectCode === 'AM_NHAC').teacher.fullName).toBe('Thầy Âm Nhạc');

    const grid = (await s.A.get(`/schools/${s.school.id}/academic-years/${s.year.id}/teaching-grid`)).json();
    expect(grid[0]).toMatchObject({ className: '2A', grade: 2 });
    expect(grid[0].slots.every((x: { teacher: unknown }) => x.teacher !== null)).toBe(true);
  });
});
