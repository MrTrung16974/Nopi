import { errorResponseSchema, meResponseSchema, userAuthResponseSchema } from '@nopi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, e164, loginByPhone, randomPhone, startTestApp, type TestApp } from './helpers.js';

describe('đăng nhập người lớn', () => {
  let t: TestApp;
  beforeAll(async () => (t = await startTestApp()));
  afterAll(() => t.close());

  const msg = (res: { json(): unknown }) => errorResponseSchema.parse(res.json()).error.message;

  it('SĐT + OTP lần đầu: tạo tài khoản, chưa có tên → app hỏi tên', async () => {
    const phone = randomPhone();
    const req = await api(t).post('/auth/otp/request', { phone: phone.replace(/(\d{4})(\d{3})/, '$1 $2 ') });
    expect(req.statusCode).toBe(200);
    expect(req.json()).toMatchObject({ expiresIn: 300, maskedPhone: expect.stringMatching(/\*\*\*/) });

    const code = t.otp.lastCodeFor(e164(phone))!;
    const res = await api(t).post('/auth/otp/verify', { phone, code });
    expect(res.statusCode).toBe(200);
    const body = userAuthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ isNewUser: true, user: { phone: e164(phone), needsProfile: true } });

    // Mã chỉ dùng được một lần
    const again = await api(t).post('/auth/otp/verify', { phone, code });
    expect(again.statusCode).toBe(400);
    expect(msg(again)).toBe('Mã đã hết hạn, vui lòng lấy mã mới');

    const me = api(t, body.accessToken);
    expect((await me.patch('/me', { fullName: 'Nguyễn Thị Hoa' })).json()).toMatchObject({ needsProfile: false });
    const profile = meResponseSchema.parse((await me.get('/me')).json());
    expect(profile).toMatchObject({ fullName: 'Nguyễn Thị Hoa', children: [] });

    // Lần sau đăng nhập không còn là người mới
    expect((await loginByPhone(t, phone)).isNewUser).toBe(false);
  });

  it('SĐT sai định dạng → lỗi dễ hiểu', async () => {
    const res = await api(t).post('/auth/otp/request', { phone: '12345' });
    expect(res.statusCode).toBe(400);
    expect(errorResponseSchema.parse(res.json()).error.details?.[0]?.message).toBe('Số điện thoại chưa đúng, ví dụ: 0912 345 678');
  });

  it('nhập sai OTP: báo số lần còn lại, sai 5 lần phải lấy mã mới', async () => {
    const phone = randomPhone();
    await api(t).post('/auth/otp/request', { phone });
    const correct = t.otp.lastCodeFor(e164(phone))!;
    const wrong = correct === '000000' ? '111111' : '000000';
    const first = await api(t).post('/auth/otp/verify', { phone, code: wrong });
    expect(msg(first)).toBe('Mã chưa đúng, bạn còn 4 lần thử');
    for (let i = 0; i < 3; i++) await api(t).post('/auth/otp/verify', { phone, code: wrong });
    const fifth = await api(t).post('/auth/otp/verify', { phone, code: wrong });
    expect(fifth.statusCode).toBe(429);
    // Mã đúng cũng không dùng được nữa
    expect((await api(t).post('/auth/otp/verify', { phone, code: correct })).statusCode).toBe(400);
  });

  it('tối đa 5 lần lấy mã mỗi giờ', async () => {
    const phone = randomPhone();
    for (let i = 0; i < 5; i++) expect((await api(t).post('/auth/otp/request', { phone })).statusCode).toBe(200);
    const sixth = await api(t).post('/auth/otp/request', { phone });
    expect(sixth.statusCode).toBe(429);
    expect(msg(sixth)).toMatch(/thử lại sau \d+ phút/);
  });

  it('gửi OTP lỗi → báo thử lại, không lưu mã', async () => {
    const phone = randomPhone();
    t.otp.failNext = true;
    const res = await api(t).post('/auth/otp/request', { phone });
    expect(res.statusCode).toBe(500);
    expect(msg(res)).toBe('Chưa gửi được mã, vui lòng thử lại sau ít phút');
  });

  it('refresh xoay vòng: token cũ hết hiệu lực; đăng xuất thu hồi phiên', async () => {
    const login = await loginByPhone(t, randomPhone());
    const r1 = await api(t).post('/auth/refresh', { refreshToken: login.refreshToken });
    expect(r1.statusCode).toBe(200);
    expect((await api(t).post('/auth/refresh', { refreshToken: login.refreshToken })).statusCode).toBe(401);

    const { accessToken, refreshToken } = r1.json();
    expect((await api(t, accessToken).post('/auth/logout')).statusCode).toBe(204);
    expect((await api(t).post('/auth/refresh', { refreshToken })).statusCode).toBe(401);
  });

  it('API cần đăng nhập; token giả bị từ chối', async () => {
    expect((await api(t).get('/me')).statusCode).toBe(401);
    expect((await api(t, 'abc.def.ghi').get('/me')).statusCode).toBe(401);
  });

  it('mật khẩu: đặt rồi đăng nhập bằng SĐT hoặc email; sai thì báo chung', async () => {
    const phone = randomPhone();
    const login = await loginByPhone(t, phone);
    expect((await api(t, login.accessToken).put('/me/password', { password: 'ngan' })).statusCode).toBe(400);
    expect((await api(t, login.accessToken).put('/me/password', { password: 'matkhau-dai-du' })).statusCode).toBe(204);

    const ok = await api(t).post('/auth/password', { login: phone, password: 'matkhau-dai-du' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.hasPassword).toBe(true);
    const bad = await api(t).post('/auth/password', { login: phone, password: 'sai' });
    expect(bad.statusCode).toBe(401);
    expect(msg(bad)).toBe('Số điện thoại/email hoặc mật khẩu chưa đúng');
  });

  it('Google: lần đầu tạo tài khoản, lần sau vào đúng tài khoản cũ', async () => {
    const sub = `g-${Date.now()}`;
    const first = await api(t).post('/auth/google', { idToken: `google:${sub}:hoa${sub}@gmail.com:Trần Hoa` });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ isNewUser: true, user: { fullName: 'Trần Hoa', needsProfile: false } });
    const second = await api(t).post('/auth/google', { idToken: `google:${sub}:hoa${sub}@gmail.com:Trần Hoa` });
    expect(second.json()).toMatchObject({ isNewUser: false, user: { id: first.json().user.id } });
    expect((await api(t).post('/auth/google', { idToken: 'gia-mao-token' })).statusCode).toBe(401);
  });

  it('đăng nhập web bằng QR: web chờ → app duyệt → web nhận token đúng một lần', async () => {
    const start = (await api(t).post('/auth/qr-login')).json();
    expect(start.qrPayload).toBe(`nopi://qr-login/${start.loginId}`);
    const poll = () => api(t).post(`/auth/qr-login/${start.loginId}/poll`, { pollSecret: start.pollSecret });

    expect((await poll()).json()).toEqual({ status: 'pending' });
    // Người khác chụp được QR nhưng không có pollSecret thì không lấy được token
    expect((await api(t).post(`/auth/qr-login/${start.loginId}/poll`, { pollSecret: 'doan-bua' })).statusCode).toBe(403);
    // Phải đăng nhập trên app mới duyệt được
    expect((await api(t).post(`/auth/qr-login/${start.loginId}/approve`)).statusCode).toBe(401);

    const teacher = await loginByPhone(t, randomPhone());
    expect((await api(t, teacher.accessToken).post(`/auth/qr-login/${start.loginId}/approve`)).statusCode).toBe(204);
    const approved = (await poll()).json();
    expect(approved).toMatchObject({ status: 'approved', auth: { user: { id: teacher.user.id } } });
    expect((await api(t, approved.auth.accessToken).get('/me')).statusCode).toBe(200);
    expect((await poll()).statusCode).toBe(404); // đã dùng
  });
});
