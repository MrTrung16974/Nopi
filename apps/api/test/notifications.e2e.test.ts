import { inboxSchema } from '@nopi/contracts';
import { CURRENT_POLICY_VERSION } from '@nopi/domain';
import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationService, NotificationTriggers } from '../src/modules/notifications/public-api.js';
import { OutboxRelay } from '../src/platform/events/outbox-relay.js';
import { api, loginByPhone, randomPhone, startTestApp, type TestApp } from './helpers.js';
import { FakeClock, HOUR, m2World, sampleFiles, upload } from './m2-helpers.js';

describe('thông báo', () => {
  let t: TestApp;
  let relay: OutboxRelay;
  let svc: NotificationService;
  let triggers: NotificationTriggers;
  let files: Awaited<ReturnType<typeof sampleFiles>>;
  const clock = new FakeClock();
  beforeAll(async () => {
    t = await startTestApp({ clock });
    relay = t.app.get(OutboxRelay);
    svc = t.app.get(NotificationService);
    triggers = t.app.get(NotificationTriggers);
    files = await sampleFiles();
  });
  beforeEach(() => {
    clock.current = new Date('2026-11-25T03:00:00Z'); // 10:00 thứ Tư giờ VN
    t.push.sent.length = 0;
    t.zalo.sent.length = 0;
  });
  afterAll(() => t.close());

  /** Chạy hết sự kiện đang chờ (như worker). */
  const drain = async () => {
    for (let i = 0; i < 10; i++) if ((await relay.relayBatch()).processed === 0) break;
  };
  const sentTo = (token: string) => t.push.sent.filter((m) => m.token === token);

  async function world() {
    const w = await m2World(t);
    const momToken = `ExponentPushToken[mom-${Math.random()}]`;
    await api(t, w.mom.accessToken).post('/devices', { platform: 'android', pushToken: momToken });
    const lanToken = `ExponentPushToken[lan-${Math.random()}]`;
    await api(t, w.lan.token).post('/devices', { platform: 'ios', pushToken: lanToken });
    return { ...w, momToken, lanToken };
  }
  const give = async (w: Awaited<ReturnType<typeof world>>, token = w.lan.token, title = 'Đọc bài "Cái Bống"') =>
    (await api(t, token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title, submissionKinds: ['photo'] })).json()[0];

  it('bài mới → phụ huynh nhận thông báo đẩy + có trong hộp thư; sự kiện giao lại không gửi trùng', async () => {
    const w = await world();
    const a = await give(w);
    await drain();
    await drain();
    expect((await svc.dispatchDue()).sent).toBeGreaterThanOrEqual(1);
    const msgs = sentTo(w.momToken);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ title: 'Bài mới · Tiếng Việt', body: 'Bống: Đọc bài "Cái Bống" — hạn tối mai', data: { template: 'assignment_published', assignmentId: a.id } });

    const inbox = inboxSchema.parse((await api(t, w.mom.accessToken).get('/me/notifications')).json());
    expect(inbox).toMatchObject({ unread: 1, items: [{ template: 'assignment_published', data: { assignmentId: a.id, studentId: w.bong.id, studentAssignmentId: expect.any(String) } }] });
    await api(t, w.mom.accessToken).post('/me/notifications/read', { all: true });
    expect((await api(t, w.mom.accessToken).get('/me/notifications')).json().unread).toBe(0);

    // Em An không có phụ huynh, không có máy riêng → chỉ lưu, không gửi đi đâu
    const anRows = await t.db.select().from(schema.notifications).where(eq(schema.notifications.recipientStudentId, w.an.id));
    expect(anRows).toEqual([expect.objectContaining({ status: 'skipped' })]);

    // Gửi lại sự kiện (outbox giao "ít nhất một lần") → không tạo thông báo trùng
    await t.app.get(NotificationTriggers).onPublished({ type: 'AssignmentPublished', aggregateId: a.id, payload: { assignmentId: a.id, studentIds: [w.bong.id, w.an.id] } });
    expect(await t.db.select().from(schema.notifications).where(eq(schema.notifications.recipientUserId, w.mom.user.id))).toHaveLength(1);
  });

  it('giờ yên lặng 21:00–6:30: bài giao lúc 22:00 thì 6:30 sáng hôm sau phụ huynh mới nhận', async () => {
    const w = await world();
    clock.current = new Date('2026-11-25T15:00:00Z'); // 22:00 VN
    const lan = api(t, (await loginByPhone(t, w.lan.phone)).accessToken);
    await lan.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài buổi tối', submissionKinds: ['photo'] });
    await drain();
    const [row] = await t.db.select().from(schema.notifications).where(eq(schema.notifications.recipientUserId, w.mom.user.id));
    expect(row!.sendAfter.toISOString()).toBe('2026-11-25T23:30:00.000Z'); // 06:30 VN
    await svc.dispatchDue();
    expect(sentTo(w.momToken)).toHaveLength(0);
    const momApi = api(t, (await loginByPhone(t, w.mom.phone)).accessToken);
    expect((await momApi.get('/me/notifications')).json().items).toHaveLength(0); // chưa tới giờ thì chưa hiện

    clock.current = new Date('2026-11-25T23:31:00Z'); // 06:31 VN
    await svc.dispatchDue();
    expect(sentTo(w.momToken)).toHaveLength(1);
  });

  it('phụ huynh chưa cài app → tin Zalo; dịch vụ đẩy sập → thử lại sau; máy đã gỡ app → xoá mã', async () => {
    const w = await world();
    // Bố Bống liên kết nhưng chưa cài app (không có thiết bị)
    const [inv] = (await api(t, w.lan.token).post(`/classes/${w.classes['1A']!.id}/guardian-invites`, { studentIds: [w.bong.id] })).json();
    const dadPhone = randomPhone();
    const dad = await loginByPhone(t, dadPhone);
    await api(t, dad.accessToken).post('/me/children/claim', { code: inv.code, relationship: 'bo', acceptPolicyVersion: CURRENT_POLICY_VERSION });
    // Mẹ có thêm một máy cũ đã gỡ app
    await api(t, w.mom.accessToken).post('/devices', { platform: 'android', pushToken: 'dead-token-may-cu-cua-me' });

    t.push.failNext = true;
    await give(w);
    await drain();
    const r1 = await svc.dispatchDue();
    expect(t.zalo.sent).toEqual([expect.objectContaining({ phone: `+84${dadPhone.slice(1)}`, template: 'assignment_published' })]);
    expect(r1.retry).toBeGreaterThanOrEqual(1); // tin của mẹ chờ thử lại
    const [momRow] = await t.db.select().from(schema.notifications).where(eq(schema.notifications.recipientUserId, w.mom.user.id));
    expect(momRow).toMatchObject({ status: 'pending', attempts: 1, lastError: 'push service down' });

    clock.advance(10 * 60_000);
    await svc.dispatchDue();
    expect(sentTo(w.momToken)).toHaveLength(1);
    expect(await t.db.select().from(schema.devices).where(eq(schema.devices.pushToken, 'dead-token-may-cu-cua-me'))).toEqual([]);
  });

  it('cô chấm / yêu cầu làm lại → phụ huynh nhận; sửa nhận xét thì không báo lại', async () => {
    const w = await world();
    const a = await give(w);
    const sa = (await api(t, w.lan.token).get(`/assignments/${a.id}/submissions`)).json().find((r: { student: { id: string } }) => r.student.id === w.bong.id).studentAssignmentId;
    const m1 = await upload(t, w.mom.accessToken, `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const d1 = (await api(t, w.mom.accessToken).post(`/student-assignments/${sa}/submissions`, { mediaIds: [m1] })).json();
    await api(t, w.lan.token).put(`/submissions/${d1.attempts[0].id}/evaluation`, { requiresRedo: true, comment: 'Viết lại câu 2' });
    const m2 = await upload(t, w.mom.accessToken, `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const d2 = (await api(t, w.mom.accessToken).post(`/student-assignments/${sa}/submissions`, { mediaIds: [m2] })).json();
    await api(t, w.lan.token).put(`/submissions/${d2.attempts[0].id}/evaluation`, { level: 'HOAN_THANH_TOT' });
    await api(t, w.lan.token).put(`/submissions/${d2.attempts[0].id}/evaluation`, { level: 'HOAN_THANH', comment: 'sửa' });
    await drain();
    await svc.dispatchDue();
    expect(sentTo(w.momToken).map((m) => m.title)).toEqual(['Bài mới · Tiếng Việt', 'Cô nhờ làm lại · Tiếng Việt', 'Cô đã nhận xét · Tiếng Việt']);
  });

  it('18:00 nhắc bài hạn ngày mai mà em chưa nộp (em đã nộp thì không nhắc); 20:00 một bản tổng hợp cho cô', async () => {
    const w = await world();
    const a = await give(w); // hạn 20:00 thứ Năm
    const sa = (await api(t, w.lan.token).get(`/assignments/${a.id}/submissions`)).json();
    const anSa = sa.find((r: { student: { id: string } }) => r.student.id === w.an.id).studentAssignmentId;
    const anToken = await w.cardToken(w.classes['1A']!.id, w.an.id);
    const m = await upload(t, anToken, `/student-assignments/${anSa}/uploads`, 'photo', files.photo);
    await api(t, anToken).post(`/student-assignments/${anSa}/submissions`, { mediaIds: [m] });
    await drain();
    await svc.dispatchDue();
    t.push.sent.length = 0;

    clock.current = new Date('2026-11-25T11:00:00Z'); // 18:00 thứ Tư VN
    await triggers.dueReminders();
    await triggers.dueReminders(); // chạy lại không nhắc trùng
    await svc.dispatchDue();
    expect(sentTo(w.momToken)).toEqual([expect.objectContaining({ title: 'Nhắc bài · Tiếng Việt', body: 'Bống chưa nộp "Đọc bài "Cái Bống"" — hạn tối mai' })]);
    const anReminders = (await t.db.select().from(schema.notifications).where(eq(schema.notifications.recipientStudentId, w.an.id))).filter((n) => n.template === 'due_reminder');
    expect(anReminders).toEqual([]);

    clock.current = new Date('2026-11-25T13:00:00Z'); // 20:00 VN
    await triggers.teacherDigests();
    await triggers.teacherDigests();
    await svc.dispatchDue();
    expect(sentTo(w.lanToken)).toEqual([expect.objectContaining({ title: 'Tổng hợp bài nộp hôm nay', body: '1A: 1/2 em đã nộp Tiếng Việt' })]);
  });

  it('"Nhắc các em chưa nộp": gửi phụ huynh các em chưa nộp, mỗi bài một lần / 2 giờ, chỉ cô phụ trách', async () => {
    const w = await world();
    const a = await give(w);
    await drain();
    await svc.dispatchDue();
    t.push.sent.length = 0;
    const res = await api(t, w.lan.token).post(`/assignments/${a.id}/remind`);
    expect(res.json()).toEqual({ reminded: 2 });
    expect((await api(t, w.lan.token).post(`/assignments/${a.id}/remind`)).json().error.message).toMatch(/^Cô vừa nhắc rồi/);
    expect((await api(t, w.nam.token).post(`/assignments/${a.id}/remind`)).statusCode).toBe(403);
    await svc.dispatchDue();
    expect(sentTo(w.momToken)).toEqual([expect.objectContaining({ title: 'Cô nhắc nộp bài · Tiếng Việt' })]);
  });

  it('máy riêng của học sinh nhận thông báo của em; máy đổi chủ thì chuyển theo', async () => {
    const w = await world();
    const anToken = await w.cardToken(w.classes['1A']!.id, w.an.id);
    const device = `ExponentPushToken[an-${Math.random()}]`;
    await api(t, anToken).post('/devices', { platform: 'android', pushToken: device });
    await give(w);
    await drain();
    await svc.dispatchDue();
    expect(sentTo(device)).toEqual([expect.objectContaining({ title: 'Con có bài mới 🎒', body: 'Tiếng Việt: Đọc bài "Cái Bống"' })]);
    // Máy đó giờ của mẹ Bống
    await api(t, w.mom.accessToken).post('/devices', { platform: 'android', pushToken: device });
    const [d] = await t.db.select().from(schema.devices).where(eq(schema.devices.pushToken, device));
    expect(d).toMatchObject({ userId: w.mom.user.id, studentId: null });
    clock.advance(HOUR);
  });
});
