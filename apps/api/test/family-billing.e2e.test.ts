import { checkoutResponseSchema, entitlementSchema, familySpaceSchema, studentAssignmentItemSchema, studentHomeSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/platform/config.js';
import { api, loginByPhone, randomPhone, startTestApp, systemAdmin, type TestApp } from './helpers.js';
import { DAY, FakeClock, m2World } from './m2-helpers.js';

describe('không gian gia đình & thanh toán', () => {
  let t: TestApp;
  const clock = new FakeClock();
  beforeAll(async () => (t = await startTestApp({ clock })));
  beforeEach(() => (clock.current = new Date('2026-11-25T03:00:00Z')));
  afterAll(() => t.close());

  async function family() {
    const w = await m2World(t);
    const M = api(t, w.mom.accessToken);
    await M.patch('/me', { fullName: 'Phạm Thị Hoa' });
    const res = await M.post('/family-spaces');
    expect(res.statusCode).toBe(201);
    return { w, M, space: familySpaceSchema.parse(res.json()) };
  }

  it('tạo không gian gia đình: dùng thử 7 ngày, tự thêm con đang học ở trường (một lớp riêng, bố mẹ dạy các môn chính)', async () => {
    const { w, M, space } = await family();
    expect(space.entitlement).toMatchObject({ active: true, status: 'trial', planId: 'family_trial', currentPeriodEnd: '2026-12-02T03:00:00.000Z', features: { family_space: true } });
    expect(space.children).toEqual([expect.objectContaining({ studentId: w.bong.id, grade: 1 })]);
    // Lớp 1: 8 môn chính (bỏ Tiếng Anh, Tiếng dân tộc vì tự chọn)
    expect(space.children[0]!.teachingAssignmentIds).toHaveLength(8);
    expect(space.name).toBe('Gia đình Hoa');

    // Gọi lại không tạo không gian thứ hai
    expect((await M.post('/family-spaces')).json().id).toBe(space.id);
    expect((await M.get('/family-spaces/mine')).json().space.id).toBe(space.id);
    // Người khác không xem được
    const other = await loginByPhone(t, randomPhone());
    expect((await api(t, other.accessToken).get(`/family-spaces/${space.id}`)).statusCode).toBe(403);
    expect((await api(t, other.accessToken).get('/family-spaces/mine')).json()).toEqual({ space: null });
  });

  it('thêm con chưa vào trường nào: tạo hồ sơ + liên kết luôn; bố mẹ giao & chấm bài, con thấy "Bố mẹ giao" chung trang chủ', async () => {
    const { w, M, space } = await family();
    const huy = (await M.post(`/family-spaces/${space.id}/children`, { fullName: 'nguyễn gia huy', nickname: 'Su', grade: 6 })).json();
    expect(huy).toMatchObject({ fullName: 'nguyễn gia huy', grade: 6 });
    expect((await M.get('/me')).json().children.map((c: { nickname: string }) => c.nickname).sort()).toEqual(['Bống', 'Su']);
    expect((await M.post(`/family-spaces/${space.id}/children`, { studentId: w.bong.id })).json().error.message).toBe('Con đã có trong không gian gia đình');

    // Bố mẹ giao bài Toán cho Bống (dùng đúng API giao bài của giáo viên)
    const bong = space.children[0]!;
    const ov = (await M.get('/teacher/overview')).json();
    const toanTa = ov.teaching.find((x: { class: { name: string }; subject: { code: string } }) => x.class.name === 'Bống' && x.subject.code === 'TOAN').teachingAssignmentId;
    expect(bong.teachingAssignmentIds).toContain(toanTa);
    const a = (await M.post('/assignments', { teachingAssignmentIds: [toanTa], title: 'Luyện tính nhẩm', submissionKinds: ['photo'] })).json()[0];
    expect(a).toMatchObject({ gradingScheme: 'completion_level', stats: { total: 1 } });

    const bongToken = await w.studentToken(w.bong.id);
    const list = (await api(t, bongToken).get('/student/assignments')).json().map((x: unknown) => studentAssignmentItemSchema.parse(x));
    expect(list).toEqual([expect.objectContaining({ title: 'Luyện tính nhẩm', fromFamily: true })]);
    const home = studentHomeSchema.parse((await api(t, bongToken).get('/student/me')).json());
    expect(home.classes.map((c) => c.schoolKind)).toEqual(['school', 'family']); // trường trước, gia đình sau
  });

  it('hết dùng thử: không giao bài mới được (báo rõ), bài cũ vẫn còn; mua gói trên web (cổng giả lập ký HMAC) → mở lại', async () => {
    const { w, M, space } = await family();
    const ta = space.children[0]!.teachingAssignmentIds[0]!;
    await M.post('/assignments', { teachingAssignmentIds: [ta], title: 'Bài trong lúc dùng thử', submissionKinds: ['photo'] });

    clock.advance(8 * DAY);
    const mom = api(t, (await loginByPhone(t, w.mom.phone)).accessToken);
    const blocked = await mom.post('/assignments', { teachingAssignmentIds: [ta], title: 'Bài mới', submissionKinds: ['photo'] });
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error).toMatchObject({ code: 'feature_not_in_plan', message: expect.stringContaining('Bài cũ và nhận xét của con vẫn được giữ nguyên') });
    expect((await mom.get(`/family-spaces/${space.id}`)).json().entitlement).toMatchObject({ active: false, status: 'expired' });
    expect((await mom.get(`/me/children/${w.bong.id}/assignments`)).json()).toHaveLength(1);

    // Mua gói tháng
    const plans = (await api(t).get('/billing/plans?buyer=family')).json();
    expect(plans.map((p: { id: string }) => p.id)).toEqual(['family_monthly', 'family_yearly']); // gói dùng thử không bán
    // Web chỉ hiện cổng đang bật trên server (test bật cổng giả lập)
    expect((await api(t).get('/billing/payment-methods')).json()).toEqual([{ id: 'fake', name: 'Thanh toán thử (dev)' }]);
    const co = checkoutResponseSchema.parse((await mom.post(`/family-spaces/${space.id}/checkout`, { planId: 'family_monthly', provider: 'fake', returnUrl: 'http://localhost:3200/gia-dinh' })).json());
    expect(co.payUrl).toContain(`/v1/billing/fake/checkout/${co.orderId}`);
    expect(new URL(co.payUrl).searchParams.get('returnUrl')).toBe(`http://localhost:3200/gia-dinh?order=${co.orderId}`);
    expect((await t.app.inject({ method: 'GET', url: new URL(co.payUrl).pathname })).body).toContain('49.000đ');
    expect((await mom.get(`/billing/orders/${co.orderId}`)).json().status).toBe('pending');

    const paid = await api(t).post(`/billing/fake/pay/${co.orderId}`, { resultCode: 0 });
    expect(paid.json()).toEqual({ ok: true, message: 'ok' });
    expect((await mom.get(`/billing/orders/${co.orderId}`)).json().status).toBe('paid');
    const ent = entitlementSchema.parse((await mom.get(`/family-spaces/${space.id}`)).json().entitlement);
    expect(ent).toMatchObject({ active: true, status: 'active', planId: 'family_monthly', channel: 'web', currentPeriodEnd: '2027-01-03T03:00:00.000Z' });
    expect((await mom.post('/assignments', { teachingAssignmentIds: [ta], title: 'Bài mới', submissionKinds: ['photo'] })).statusCode).toBe(201);

    // Người khác không xem được đơn
    const other = await loginByPhone(t, randomPhone());
    expect((await api(t, other.accessToken).get(`/billing/orders/${co.orderId}`)).statusCode).toBe(404);
    expect((await api(t, other.accessToken).post(`/family-spaces/${space.id}/checkout`, { planId: 'family_monthly', provider: 'fake' })).statusCode).toBe(403);
  });

  it('IPN: sai chữ ký / lệch số tiền bị từ chối; cổng gửi lại nhiều lần chỉ ghi nhận một lần; mua sớm thì cộng nối tiếp', async () => {
    const { M, space } = await family();
    const co = (await M.post(`/family-spaces/${space.id}/checkout`, { planId: 'family_monthly', provider: 'fake' })).json();
    const { FakeGateway } = await import('../src/modules/billing/ports/web-gateway.js');
    const g = new FakeGateway(loadConfig().PAYMENT_FAKE_SECRET, 'x');
    const good = { orderId: co.orderId, transId: 'T-1', amount: 49_000, resultCode: 0 };
    expect((await api(t).post('/billing/ipn/fake', { ...good, signature: 'deadbeef' })).json()).toEqual({ ok: false, message: 'invalid signature' });
    const cheap = { ...good, amount: 1000 };
    expect((await api(t).post('/billing/ipn/fake', { ...cheap, signature: g.sign(cheap) })).json()).toEqual({ ok: false, message: 'amount mismatch' });
    expect((await api(t).post('/billing/ipn/fake', { ...good, signature: g.sign(good) })).json().ok).toBe(true);
    expect((await api(t).post('/billing/ipn/fake', { ...good, signature: g.sign(good) })).json()).toEqual({ ok: true, message: 'already processed' });
    const pays = await t.db.select().from(schema.payments).where(eq(schema.payments.providerRef, 'T-1'));
    expect(pays).toHaveLength(1);

    // Đang dùng thử tới 2/12 → mua tháng: tính nối tiếp sau ngày hết thử; mua thêm tháng nữa: cộng tiếp
    expect((await M.get(`/family-spaces/${space.id}`)).json().entitlement.currentPeriodEnd).toBe('2027-01-02T03:00:00.000Z');
    const co2 = (await M.post(`/family-spaces/${space.id}/checkout`, { planId: 'family_monthly', provider: 'fake' })).json();
    await api(t).post(`/billing/fake/pay/${co2.orderId}`, { resultCode: 0 });
    expect((await M.get(`/family-spaces/${space.id}`)).json().entitlement.currentPeriodEnd).toBe('2027-02-02T03:00:00.000Z');

    // Thanh toán thất bại → đơn "failed", không mở quyền
    const co3 = (await M.post(`/family-spaces/${space.id}/checkout`, { planId: 'family_yearly', provider: 'fake' })).json();
    await api(t).post(`/billing/fake/pay/${co3.orderId}`, { resultCode: 1 });
    expect((await M.get(`/billing/orders/${co3.orderId}`)).json().status).toBe('failed');
  });

  it('mua trong app (Google Play / App Store): server xác minh giao dịch, nhận thông báo huỷ từ cửa hàng', async () => {
    const { w, space } = await family();
    clock.advance(8 * DAY); // hết dùng thử
    const mom = api(t, (await loginByPhone(t, w.mom.phone)).accessToken);
    const ent = (await mom.post(`/family-spaces/${space.id}/store-purchases`, { platform: 'google', productId: 'nopi.family.monthly', token: 'fake|gp-orig-1|2027-01-10T00:00:00.000Z|GPA.1' })).json();
    expect(ent).toMatchObject({ active: true, channel: 'google', planId: 'family_monthly', currentPeriodEnd: '2027-01-10T00:00:00.000Z' });
    expect((await mom.post(`/family-spaces/${space.id}/store-purchases`, { platform: 'google', productId: 'x', token: 'gia-mao-1234' })).json().error.message).toBe('Không xác minh được giao dịch, vui lòng thử lại');

    // Cửa hàng báo người dùng tắt gia hạn: vẫn dùng tới hết kỳ
    expect((await api(t).post('/billing/store/google/notifications', { externalId: 'gp-orig-1', expiresAt: '2027-01-10T00:00:00.000Z', canceled: true })).json()).toEqual({ ok: true });
    expect((await mom.get(`/family-spaces/${space.id}`)).json().entitlement).toMatchObject({ active: true, status: 'canceled' });
  });

  it('hợp đồng trường: chỉ quản trị hệ thống mở; cấu hình production chặn cổng giả lập', async () => {
    const w = await m2World(t);
    expect((await w.A.post(`/admin/schools/${w.school.id}/subscriptions`, { externalId: 'HD-2026-001' })).statusCode).toBe(403);
    const sa = await systemAdmin(t);
    const ent = (await api(t, sa.accessToken).post(`/admin/schools/${w.school.id}/subscriptions`, { externalId: 'HD-2026-001' })).json();
    expect(ent).toMatchObject({ active: true, channel: 'contract', planId: 'school_year', currentPeriodEnd: '2027-05-31T16:59:00.000Z', features: { scan_quota_per_day: 50 } });

    const base = { ...process.env, NODE_ENV: 'production' };
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDERS: 'fake' })).toThrow('production không được bật cổng thanh toán');
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDERS: '', STORE_VERIFIER: 'fake' })).toThrow();
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDERS: '', STORE_VERIFIER: 'none' })).not.toThrow();
  });
});
