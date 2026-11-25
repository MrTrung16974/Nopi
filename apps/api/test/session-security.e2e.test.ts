import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, loginByPhone, randomPhone, startTestApp, type TestApp } from './helpers.js';
import { FakeClock } from './m2-helpers.js';

describe('phiên đăng nhập: phát hiện dùng lại refresh token', () => {
  let t: TestApp;
  const clock = new FakeClock();
  beforeAll(async () => (t = await startTestApp({ clock })));
  afterAll(() => t.close());

  it('token cũ bị dùng lại sau khi đã xoay → thu hồi cả phiên, ghi nhật ký', async () => {
    const login = await loginByPhone(t, randomPhone());
    const r1 = (await api(t).post('/auth/refresh', { refreshToken: login.refreshToken })).json();
    clock.advance(60_000);
    // Kẻ lấy cắp dùng token cũ
    expect((await api(t).post('/auth/refresh', { refreshToken: login.refreshToken })).statusCode).toBe(401);
    // Phiên đã bị thu hồi: token mới của chủ thật cũng không dùng được nữa
    expect((await api(t).post('/auth/refresh', { refreshToken: r1.refreshToken })).statusCode).toBe(401);
    const logs = await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'auth.refresh.reuse'));
    expect(logs.some((l) => (l.metadata as { userId?: string }).userId === login.user.id)).toBe(true);
  });

  it('hai yêu cầu refresh gần như cùng lúc (2 tab) → không thu hồi phiên', async () => {
    const login = await loginByPhone(t, randomPhone());
    const r1 = (await api(t).post('/auth/refresh', { refreshToken: login.refreshToken })).json();
    clock.advance(2_000);
    expect((await api(t).post('/auth/refresh', { refreshToken: login.refreshToken })).statusCode).toBe(401);
    expect((await api(t).post('/auth/refresh', { refreshToken: r1.refreshToken })).statusCode).toBe(200);
  });
});
