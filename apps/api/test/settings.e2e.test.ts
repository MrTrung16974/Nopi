import { notificationSettingsSchema, spaceSettingsDtoSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationService, NotificationTriggers } from '../src/modules/notifications/public-api.js';
import { OutboxRelay } from '../src/platform/events/outbox-relay.js';
import { api, loginByPhone, startTestApp, type TestApp } from './helpers.js';
import { FakeClock, m2World } from './m2-helpers.js';

describe('cài đặt trường + tuỳ chọn thông báo', () => {
  let t: TestApp;
  const clock = new FakeClock();
  beforeAll(async () => (t = await startTestApp({ clock })));
  beforeEach(() => (clock.current = new Date('2026-11-25T03:00:00Z')));
  afterAll(() => t.close());
  const drain = async () => {
    for (let i = 0; i < 10; i++) if ((await t.app.get(OutboxRelay).relayBatch()).processed === 0) break;
  };

  it('quản trị sửa giờ yên lặng / giờ gửi tổng hợp / thời hạn lưu; giáo viên chỉ xem; giá trị sai bị chặn', async () => {
    const w = await m2World(t);
    const url = `/schools/${w.school.id}/settings`;
    expect(spaceSettingsDtoSchema.parse((await w.A.get(url)).json())).toMatchObject({ teacherDigestTime: '20:00', quietHours: { start: '21:00', end: '06:30' } });
    const res = await w.A.patch(url, { teacherDigestTime: '17:00', quietHours: { start: '21:30' }, retentionDays: { video: 180 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ teacherDigestTime: '17:00', quietHours: { start: '21:30', end: '06:30' }, retentionDays: { video: 180, photo: 1095 } });
    expect((await api(t, w.lan.token).get(url)).json().teacherDigestTime).toBe('17:00');
    expect((await api(t, w.lan.token).patch(url, { scanQuotaPerDay: 99 })).statusCode).toBe(403);
    expect((await w.A.patch(url, { teacherDigestTime: '25:00' })).statusCode).toBe(400);
    expect((await w.A.patch(url, { maxVideoSeconds: 60, defaultVideoSeconds: 120 })).statusCode).toBe(400);
  });

  it('bản tổng hợp gửi đúng giờ của trường (17:00), không gửi lúc 20:00 nữa', async () => {
    const w = await m2World(t);
    await w.A.patch(`/schools/${w.school.id}/settings`, { teacherDigestTime: '17:00' });
    await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài tổng hợp', submissionKinds: ['photo'] });
    const triggers = t.app.get(NotificationTriggers);
    const digestFor = () => t.db.select().from(schema.notifications).where(and(eq(schema.notifications.recipientUserId, w.lan.id), eq(schema.notifications.template, 'teacher_digest')));
    clock.current = new Date('2026-11-25T13:00:00Z'); // 20:00 VN
    await triggers.teacherDigests();
    expect(await digestFor()).toHaveLength(0);
    clock.current = new Date('2026-11-25T10:00:00Z'); // 17:00 VN
    await triggers.teacherDigests();
    expect(await digestFor()).toHaveLength(1);
  });

  it('phụ huynh tắt "Bài mới" → không đẩy về máy nhưng vẫn có trong hộp thư; loại quan trọng không tắt được', async () => {
    const w = await m2World(t);
    const M = api(t, w.mom.accessToken);
    const token = `ExponentPushToken[mom-${Math.random()}]`;
    await M.post('/devices', { platform: 'android', pushToken: token });
    expect(notificationSettingsSchema.parse((await M.get('/me/notification-settings')).json())).toEqual({ muted: [] });
    expect((await M.put('/me/notification-settings', { muted: ['redo_requested'] })).statusCode).toBe(400);
    expect((await M.put('/me/notification-settings', { muted: ['assignment_published'] })).json()).toEqual({ muted: ['assignment_published'] });

    t.push.sent.length = 0;
    await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài tắt thông báo', submissionKinds: ['photo'] });
    await drain();
    await t.app.get(NotificationService).dispatchDue();
    expect(t.push.sent.filter((m) => m.token === token)).toHaveLength(0);
    const inbox = (await api(t, (await loginByPhone(t, w.mom.phone)).accessToken).get('/me/notifications')).json();
    expect(inbox.items.map((i: { template: string }) => i.template)).toContain('assignment_published');
  });
});
