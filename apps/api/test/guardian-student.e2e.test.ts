import { CURRENT_POLICY_VERSION } from '@nopi/domain';
import { childSchema, printableCodeSchema, studentAuthResponseSchema, studentHomeSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addTeacher, api, loginByPhone, randomPhone, setupSchool, startTestApp, type TestApp } from './helpers.js';

describe('phụ huynh & học sinh', () => {
  let t: TestApp;
  beforeAll(async () => (t = await startTestApp()));
  afterAll(() => t.close());

  /** Trường có lớp 1A (Bống) và 4A (Khôi), cô Lan dạy Tiếng Việt cả hai lớp. */
  async function world() {
    const s = await setupSchool(t);
    const lan = await addTeacher(t, s.A, s.school.id, 'Cô Lan');
    const [tv] = await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, 'TIENG_VIET'));
    for (const c of ['1A', '4A']) await s.A.put(`/classes/${s.classes[c]!.id}/teaching/${tv!.id}`, { teacherId: lan.id });
    const bong = (await s.A.post(`/classes/${s.classes['1A']!.id}/students`, { fullName: 'Nguyễn Ngọc Bống', nickname: 'Bống' })).json();
    const khoi = (await s.A.post(`/classes/${s.classes['4A']!.id}/students`, { fullName: 'Trần Minh Khôi' })).json();
    return { ...s, lan, L: api(t, lan.token), bong, khoi };
  }

  it('phiếu mời → phụ huynh quét, đồng ý điều khoản → thấy con', async () => {
    const w = await world();
    const invites = (await w.L.post(`/classes/${w.classes['1A']!.id}/guardian-invites`, {})).json();
    expect(invites).toHaveLength(1);
    const inv = printableCodeSchema.parse(invites[0]);
    expect(inv).toMatchObject({ fullName: 'Nguyễn Ngọc Bống', className: '1A', code: expect.stringMatching(/^\w{3}-\w{3}-\w{4}$/) });
    expect(inv.qrPayload).toBe(`nopi://invite/${inv.code.replace(/-/g, '')}`);

    const mom = await loginByPhone(t, randomPhone());
    const M = api(t, mom.accessToken);
    // Chưa đồng ý điều khoản mới nhất thì không liên kết được
    const noConsent = await M.post('/me/children/claim', { code: inv.code, relationship: 'me', acceptPolicyVersion: '2020-01-01' });
    expect(noConsent.statusCode).toBe(400);
    expect((await M.post('/me/children/claim', { code: 'SAI-MA-ROI', relationship: 'me', acceptPolicyVersion: CURRENT_POLICY_VERSION })).statusCode).toBe(404);

    // Gõ thường, có khoảng trắng vẫn nhận
    const claim = await M.post('/me/children/claim', { code: ` ${inv.code.toLowerCase()} `, relationship: 'me', acceptPolicyVersion: CURRENT_POLICY_VERSION });
    expect(claim.statusCode).toBe(200);
    expect(childSchema.parse(claim.json())).toMatchObject({ studentId: w.bong.id, nickname: 'Bống', relationship: 'me', needsConsent: false });

    // Bố cũng quét cùng phiếu được
    const dad = await loginByPhone(t, randomPhone());
    expect((await api(t, dad.accessToken).post('/me/children/claim', { code: inv.code, relationship: 'bo', acceptPolicyVersion: CURRENT_POLICY_VERSION })).statusCode).toBe(200);
    expect((await w.L.get(`/classes/${w.classes['1A']!.id}/students`)).json()[0].guardianCount).toBe(2);

    // In lại phiếu → phiếu cũ hết hiệu lực
    await w.L.post(`/classes/${w.classes['1A']!.id}/guardian-invites`, { studentIds: [w.bong.id] });
    const grandma = await loginByPhone(t, randomPhone());
    expect((await api(t, grandma.accessToken).post('/me/children/claim', { code: inv.code, relationship: 'ba', acceptPolicyVersion: CURRENT_POLICY_VERSION })).statusCode).toBe(404);

    // Có ghi nhật ký đồng ý
    const logs = await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.studentId, w.bong.id));
    expect(logs.filter((l) => l.action === 'guardian.link')).toHaveLength(2);
  });

  it('"Cho con học": mở phiên học sinh; phiên học sinh không dùng được API người lớn; bố mẹ thu hồi từ xa', async () => {
    const w = await world();
    const [inv] = (await w.L.post(`/classes/${w.classes['1A']!.id}/guardian-invites`, {})).json();
    const mom = await loginByPhone(t, randomPhone());
    const M = api(t, mom.accessToken);
    await M.post('/me/children/claim', { code: inv.code, relationship: 'me', acceptPolicyVersion: CURRENT_POLICY_VERSION });

    const res = await M.post(`/me/children/${w.bong.id}/session`);
    expect(res.statusCode).toBe(200);
    const child = studentAuthResponseSchema.parse(res.json());
    expect(child.student).toMatchObject({ id: w.bong.id, nickname: 'Bống' });
    expect(child.refreshToken.startsWith('s.')).toBe(true);
    expect((await api(t, child.accessToken).get('/me')).statusCode).toBe(403);

    // Trang chủ học sinh: chỉ môn đã có cô dạy (cô Lan dạy Tiếng Việt), chế độ theo khối
    const home = studentHomeSchema.parse((await api(t, child.accessToken).get('/student/me')).json());
    expect(home).toMatchObject({ grade: 1, student: { nickname: 'Bống' } });
    expect(home.classes).toEqual([expect.objectContaining({ name: '1A', schoolKind: 'school', subjects: [expect.objectContaining({ code: 'TIENG_VIET' })] })]);
    // Phiên người lớn không gọi được API của học sinh
    expect((await M.get('/student/me')).statusCode).toBe(403);

    // Người không phải phụ huynh thì không mở được
    const stranger = await loginByPhone(t, randomPhone());
    expect((await api(t, stranger.accessToken).post(`/me/children/${w.bong.id}/session`)).statusCode).toBe(403);

    // Refresh phiên học sinh, rồi bố mẹ thu hồi → refresh hỏng
    const refreshed = await api(t).post('/auth/refresh', { refreshToken: child.refreshToken });
    expect(refreshed.statusCode).toBe(200);
    const sessions = (await M.get(`/me/children/${w.bong.id}/sessions`)).json();
    expect(sessions).toEqual([expect.objectContaining({ method: 'guardian_device' })]);
    expect((await M.delete(`/me/children/${w.bong.id}/sessions/${sessions[0].id}`)).statusCode).toBe(204);
    expect((await api(t).post('/auth/refresh', { refreshToken: refreshed.json().refreshToken })).statusCode).toBe(401);
  });

  it('điều khoản đổi phiên bản → phải đồng ý lại mới cho con học được', async () => {
    const w = await world();
    const [inv] = (await w.L.post(`/classes/${w.classes['1A']!.id}/guardian-invites`, {})).json();
    const mom = await loginByPhone(t, randomPhone());
    const M = api(t, mom.accessToken);
    await M.post('/me/children/claim', { code: inv.code, relationship: 'me', acceptPolicyVersion: CURRENT_POLICY_VERSION });
    await t.db.update(schema.guardians).set({ policyVersion: '2025-01-01' }).where(eq(schema.guardians.userId, mom.user.id));

    expect((await M.get('/me')).json().children[0].needsConsent).toBe(true);
    const blocked = await M.post(`/me/children/${w.bong.id}/session`);
    expect(blocked.json().error.message).toBe('Vui lòng đọc và đồng ý điều khoản mới trước khi cho con học');
    expect((await M.post(`/me/children/${w.bong.id}/consent`, { acceptPolicyVersion: CURRENT_POLICY_VERSION })).statusCode).toBe(204);
    expect((await M.post(`/me/children/${w.bong.id}/session`)).statusCode).toBe(200);
  });

  it('thẻ QR cá nhân: đăng nhập bằng mã; "Cấp lại" thì thẻ cũ hết hiệu lực ngay', async () => {
    const w = await world();
    const [card] = (await w.L.post(`/classes/${w.classes['1A']!.id}/login-cards`, {})).json();
    expect(card.qrPayload).toBe(`nopi://student-card/${card.code.replace(/-/g, '')}`);

    const login = await api(t).post('/auth/student/card', { code: card.code.toLowerCase() });
    expect(login.statusCode).toBe(200);
    expect(login.json().student.fullName).toBe('Nguyễn Ngọc Bống');

    const [reissued] = (await w.L.post(`/classes/${w.classes['1A']!.id}/login-cards`, { studentIds: [w.bong.id] })).json();
    const old = await api(t).post('/auth/student/card', { code: card.code });
    expect(old.statusCode).toBe(401);
    expect(old.json().error.message).toBe('Thẻ không dùng được nữa, con nhờ cô cấp thẻ mới nhé');
    expect((await api(t).post('/auth/student/card', { code: reissued.code })).statusCode).toBe(200);

    // Không cấp thẻ cho học sinh lớp khác qua lớp này
    const cross = await w.L.post(`/classes/${w.classes['1A']!.id}/login-cards`, { studentIds: [w.khoi.id] });
    expect(cross.json().error.message).toBe('Có học sinh không thuộc lớp này');
  });

  it('PIN: chỉ lớp 4–9, chặn PIN dễ đoán, đăng nhập bằng mã HS + PIN, sai 5 lần thì khoá', async () => {
    const w = await world();
    const lop1 = await w.L.put(`/students/${w.bong.id}/pin`, { pin: '482915' });
    expect(lop1.json().error.message).toBe('Học sinh lớp 1–3 đăng nhập bằng ảnh hoặc thẻ QR, không cần mã PIN');

    const weak = await w.L.put(`/students/${w.khoi.id}/pin`, { pin: '123456' });
    expect(weak.json().error.details[0].message).toBe('Mã PIN dễ đoán quá, chọn dãy số khác nhé');

    // Người không liên quan không đặt được
    const stranger = await loginByPhone(t, randomPhone());
    expect((await api(t, stranger.accessToken).put(`/students/${w.khoi.id}/pin`, { pin: '482915' })).statusCode).toBe(403);

    expect((await w.L.put(`/students/${w.khoi.id}/pin`, { pin: '482915' })).statusCode).toBe(204);
    const roster = (await w.L.get(`/classes/${w.classes['4A']!.id}/students`)).json();
    const code = roster[0].studentCode as string;
    expect(roster[0].hasPin).toBe(true);

    const ok = await api(t).post('/auth/student/pin', { studentCode: code, pin: '482915' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().student.fullName).toBe('Trần Minh Khôi');

    for (let i = 0; i < 5; i++) {
      const bad = await api(t).post('/auth/student/pin', { studentCode: code, pin: '000001' });
      expect(bad.statusCode).toBe(401);
      expect(bad.json().error.message).toBe('Mã học sinh hoặc mã PIN chưa đúng');
    }
    const locked = await api(t).post('/auth/student/pin', { studentCode: code, pin: '482915' });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.message).toMatch(/^Nhập sai nhiều lần quá, đợi \d+ phút/);

    // Đặt lại PIN thì mở khoá
    await w.L.put(`/students/${w.khoi.id}/pin`, { pin: '735184' });
    expect((await api(t).post('/auth/student/pin', { studentCode: code, pin: '735184' })).statusCode).toBe(200);
  });
});
