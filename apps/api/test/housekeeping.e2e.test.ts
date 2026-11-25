import { schema } from '@nopi/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MediaService } from '../src/modules/media/public-api.js';
import { NotificationTriggers } from '../src/modules/notifications/public-api.js';
import { api, startTestApp, type TestApp } from './helpers.js';
import { DAY, FakeClock, m2World } from './m2-helpers.js';

describe('việc nền: dọn upload bỏ dở, nhắc gói sắp hết hạn, nhật ký xem bài', () => {
  let t: TestApp;
  const clock = new FakeClock();
  beforeAll(async () => (t = await startTestApp({ clock })));
  beforeEach(() => (clock.current = new Date('2026-11-25T03:00:00Z')));
  afterAll(() => t.close());

  it('lượt tải lên không bao giờ hoàn tất → sau 7 ngày mới bị dọn', async () => {
    const w = await m2World(t);
    const [a] = (await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài', submissionKinds: ['photo'] })).json();
    const grid = (await api(t, w.lan.token).get(`/assignments/${a.id}/submissions`)).json();
    const sa = grid.find((r: { student: { id: string } }) => r.student.id === w.bong.id).studentAssignmentId;
    const ticket = (await api(t, await w.studentToken(w.bong.id)).post(`/student-assignments/${sa}/uploads`, { kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 1000 })).json();
    const media = t.app.get(MediaService);
    clock.advance(6 * DAY);
    await media.deleteAbandonedUploads();
    expect((await t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.id, ticket.mediaId)))[0]!.status).toBe('uploading');
    clock.advance(2 * DAY);
    expect(await media.deleteAbandonedUploads()).toBeGreaterThanOrEqual(1);
    expect((await t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.id, ticket.mediaId)))[0]!.status).toBe('deleted');
  });

  it('dùng thử gia đình còn 3 ngày → báo bố mẹ một lần; đã gia hạn thì không báo', async () => {
    const w = await m2World(t);
    const M = api(t, w.mom.accessToken);
    const space = (await M.post('/family-spaces')).json(); // dùng thử 7 ngày
    const triggers = t.app.get(NotificationTriggers);
    // Chỉ đếm thông báo của mẹ Bống (DB test dùng chung với các file khác)
    const mine = () => t.db.select().from(schema.notifications).where(and(eq(schema.notifications.recipientUserId, w.mom.user.id), eq(schema.notifications.template, 'plan_expiring')));
    await triggers.planExpiringWarnings();
    expect(await mine()).toHaveLength(0); // còn 7 ngày
    clock.advance(5 * DAY);
    await triggers.planExpiringWarnings();
    await triggers.planExpiringWarnings(); // không báo trùng
    const rows = await mine();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Sắp hết thời gian dùng thử', schoolId: space.id });
  });

  it('giáo viên mở lưới chấm → ghi "submission.view" (tối đa 1 lần/giờ mỗi bài)', async () => {
    const w = await m2World(t);
    const L = api(t, w.lan.token);
    const [a] = (await L.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài xem', submissionKinds: ['photo'] })).json();
    await L.get(`/assignments/${a.id}/submissions`);
    await L.get(`/assignments/${a.id}/submissions`);
    const rows = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, 'submission.view'), eq(schema.auditLogs.targetId, a.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: w.lan.id, schoolId: w.school.id });
  });
});
