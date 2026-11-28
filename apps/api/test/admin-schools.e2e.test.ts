import { adminSchoolListSchema, adminSchoolSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, loginByPhone, randomPhone, type TestApp, startTestApp } from './helpers.js';
import { m2World } from './m2-helpers.js';

describe('quản trị hệ thống: danh sách trường, khoá trường, quản trị trường', () => {
  let t: TestApp;
  beforeAll(async () => (t = await startTestApp()));
  afterAll(() => t.close());

  it('chỉ quản trị hệ thống xem được danh sách; có số lớp/học sinh/giáo viên/quản trị; tìm theo tên', async () => {
    const w = await m2World(t);
    const SA = api(t, w.sa.accessToken);
    expect((await w.A.get('/admin/schools')).statusCode).toBe(403);
    expect((await api(t, w.lan.token).get(`/admin/schools/${w.school.id}`)).statusCode).toBe(403);

    const found = adminSchoolListSchema.parse((await SA.get(`/admin/schools?q=${encodeURIComponent(w.school.name)}`)).json());
    expect(found.total).toBe(1);
    const s = found.items[0]!;
    expect(s).toMatchObject({ id: w.school.id, status: 'active', teacherCount: 2, admins: [expect.objectContaining({ fullName: 'Hiệu Trưởng' })] });
    expect(s.classCount).toBeGreaterThanOrEqual(3);
    expect(s.studentCount).toBeGreaterThan(0);
    // ký tự đại diện của LIKE không làm lộ mọi trường
    expect(adminSchoolListSchema.parse((await SA.get('/admin/schools?q=%25')).json()).total).toBe(0);
  });

  it('khoá trường: quản trị và giáo viên không thao tác được, học sinh vẫn xem bài cũ; mở lại thì chạy như cũ; có nhật ký', async () => {
    const w = await m2World(t);
    const SA = api(t, w.sa.accessToken);
    const L = api(t, w.lan.token);
    const created = await L.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài trước khi khoá', submissionKinds: ['photo'] });
    expect(created.statusCode).toBe(201);
    const studentToken = await w.cardToken(w.classes['1A']!.id, w.bong.id);

    const locked = adminSchoolSchema.parse((await SA.patch(`/admin/schools/${w.school.id}`, { status: 'locked' })).json());
    expect(locked.status).toBe('locked');

    const blocked = await L.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Sau khi khoá', submissionKinds: ['photo'] });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.message).toContain('tạm khoá');
    expect((await w.A.get(`/schools/${w.school.id}/teachers`)).statusCode).toBe(403);
    expect((await w.A.get(`/classes/${w.classes['1A']!.id}/students`)).statusCode).toBe(403);
    expect((await L.get(`/assignments/${created.json()[0].id}/submissions`)).statusCode).toBe(403);
    // Học sinh vẫn xem được bài cũ
    expect((await api(t, studentToken).get('/student/assignments')).json()).toHaveLength(1);
    // Quản trị hệ thống vẫn hỗ trợ được
    expect((await SA.get(`/classes/${w.classes['1A']!.id}/students`)).statusCode).toBe(200);

    await SA.patch(`/admin/schools/${w.school.id}`, { status: 'active', name: 'Tiểu học Đổi Tên' });
    expect((await L.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Sau khi mở', submissionKinds: ['photo'] })).statusCode).toBe(201);
    expect((await SA.get(`/admin/schools/${w.school.id}`)).json().name).toBe('Tiểu học Đổi Tên');

    const actions = (await t.db.select({ action: schema.auditLogs.action }).from(schema.auditLogs).where(eq(schema.auditLogs.schoolId, w.school.id))).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['school.lock', 'school.unlock', 'school.rename']));
  });

  it('gán quản trị thứ hai bằng SĐT (đăng nhập OTP là vào được); không gỡ được quản trị cuối cùng', async () => {
    const w = await m2World(t);
    const SA = api(t, w.sa.accessToken);
    const phone = randomPhone();
    const added = adminSchoolSchema.parse((await SA.post(`/admin/schools/${w.school.id}/admins`, { fullName: 'phó hiệu trưởng', phone })).json());
    expect(added.admins.map((a) => a.fullName).sort()).toEqual(['Hiệu Trưởng', 'Phó Hiệu Trưởng']);

    const vice = await loginByPhone(t, phone);
    expect((await api(t, vice.accessToken).get(`/schools/${w.school.id}/teachers`)).statusCode).toBe(200);

    const firstAdminId = w.admin.user.id;
    expect((await SA.delete(`/admin/schools/${w.school.id}/admins/${firstAdminId}`)).statusCode).toBe(200);
    const viceId = vice.user.id;
    const last = await SA.delete(`/admin/schools/${w.school.id}/admins/${viceId}`);
    expect(last.statusCode).toBe(409);
    const left = await t.db.select().from(schema.schoolMembers).where(and(eq(schema.schoolMembers.schoolId, w.school.id), eq(schema.schoolMembers.role, 'admin')));
    expect(left.map((m) => m.userId)).toEqual([viceId]);
  });
});
