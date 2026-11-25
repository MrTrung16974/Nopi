import { studentAssignmentItemSchema, teacherAssignmentSchema, teacherOverviewSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AssignmentsService } from '../src/modules/assignments/public-api.js';
import { api, loginByPhone, startTestApp, type TestApp } from './helpers.js';
import { DAY, FakeClock, HOUR, m2World } from './m2-helpers.js';

describe('giao bài', () => {
  let t: TestApp;
  const clock = new FakeClock();
  beforeAll(async () => (t = await startTestApp({ clock })));
  beforeEach(() => (clock.current = new Date('2026-11-25T03:00:00Z'))); // 10:00 sáng thứ Tư giờ VN
  afterAll(() => t.close());

  it('giao một lần cho 2 lớp: mặc định hạn 20:00 ngày mai, thang theo khối, tạo bài cho từng em', async () => {
    const w = await m2World(t);
    const L = api(t, w.lan.token);
    const res = await L.post('/assignments', {
      teachingAssignmentIds: [w.taTV1A, w.taTV1B],
      title: 'Đọc bài "Cái Bống"',
      instructions: 'Con đọc to, rõ ràng nhé',
      submissionKinds: ['audio'],
      maxMediaSeconds: 180,
    });
    expect(res.statusCode).toBe(201);
    const created = res.json().map((x: unknown) => teacherAssignmentSchema.parse(x));
    expect(created).toHaveLength(2);
    expect(created[0].batchId).toBe(created[1].batchId);
    expect(created[0]).toMatchObject({
      status: 'published',
      gradingScheme: 'completion_level', // tiểu học: TT 27/2020
      dueAt: '2026-11-26T13:00:00.000Z', // 20:00 ngày mai giờ VN
      class: { name: '1A' },
      subject: { code: 'TIENG_VIET' },
      stats: { total: 2, notSubmitted: 2 },
    });
    expect(created[1].stats.total).toBe(1);

    const events = await t.db.select().from(schema.outbox).where(eq(schema.outbox.aggregateId, created[0].id));
    expect(events.map((e) => e.eventType)).toEqual(['AssignmentPublished']);

    // Học sinh thấy bài; phụ huynh thấy bài của con
    const bongToken = await w.studentToken(w.bong.id);
    const mine = (await api(t, bongToken).get('/student/assignments')).json();
    expect(studentAssignmentItemSchema.parse(mine[0])).toMatchObject({ title: 'Đọc bài "Cái Bống"', status: 'assigned', fromFamily: false });
    const child = (await api(t, w.mom.accessToken).get(`/me/children/${w.bong.id}/assignments`)).json();
    expect(child).toHaveLength(1);
    expect((await api(t, w.mom.accessToken).get(`/me/children/${w.khoi.id}/assignments`)).statusCode).toBe(403);
  });

  it('chỉ giáo viên được phân công mới giao được; giới hạn video theo cài đặt trường', async () => {
    const w = await m2World(t);
    const nam = api(t, w.nam.token);
    const forbidden = await nam.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'X', submissionKinds: ['photo'] });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.message).toBe('Bạn không được phân công dạy môn này ở lớp 1A');

    await t.db.update(schema.schools).set({ settings: { maxVideoSeconds: 300 } }).where(eq(schema.schools.id, w.school.id));
    const tooLong = await nam.post('/assignments', { teachingAssignmentIds: [w.taToan7A], title: 'Thuyết trình', submissionKinds: ['video'], maxMediaSeconds: 600 });
    expect(tooLong.json().error.message).toBe('Trường/gia đình đặt giới hạn video tối đa 5 phút');

    // THCS: Toán chấm điểm 0–10 (TT 22/2021)
    const ok = await nam.post('/assignments', { teachingAssignmentIds: [w.taToan7A], title: 'Bài 1 trang 10', submissionKinds: ['photo'] });
    expect(ok.json()[0].gradingScheme).toBe('score_10');

    const badDue = await nam.post('/assignments', { teachingAssignmentIds: [w.taToan7A], title: 'X', submissionKinds: ['photo'], dueAt: '2026-11-24T00:00:00+07:00' });
    expect(badDue.json().error.message).toBe('Hạn nộp phải sau thời điểm giao bài');
  });

  it('giao cho vài em: chỉ các em được chọn có bài', async () => {
    const w = await m2World(t);
    const res = await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Viết lại bài', submissionKinds: ['photo'], studentIds: [w.an.id] });
    expect(res.json()[0].stats.total).toBe(1);
    const multi = await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A, w.taTV1B], title: 'X', submissionKinds: ['photo'], studentIds: [w.an.id] });
    expect(multi.statusCode).toBe(400);
  });

  it('hẹn giờ giao: chưa tới giờ thì học sinh chưa thấy; tới giờ worker giao (chạy lại không giao trùng)', async () => {
    const w = await m2World(t);
    const res = await api(t, w.lan.token).post('/assignments', {
      teachingAssignmentIds: [w.taTV1A],
      title: 'Bài hẹn giờ',
      submissionKinds: ['photo'],
      publishAt: '2026-11-25T19:00:00+07:00',
    });
    const a = res.json()[0];
    expect(a).toMatchObject({ status: 'scheduled', stats: { total: 0 }, dueAt: '2026-11-26T13:00:00.000Z' });
    const bongToken = await w.studentToken(w.bong.id);
    expect((await api(t, bongToken).get('/student/assignments')).json()).toEqual([]);

    const svc = t.app.get(AssignmentsService);
    await svc.publishDue();
    expect((await api(t, w.lan.token).get(`/assignments/${a.id}`)).json().status).toBe('scheduled');

    clock.advance(10 * HOUR);
    await Promise.all([svc.publishDue(), svc.publishDue()]);
    // Token 15 phút đã hết hạn sau khi tua đồng hồ → đăng nhập lại
    const lanToken = (await loginByPhone(t, w.lan.phone)).accessToken;
    expect((await api(t, bongToken).get('/student/assignments')).statusCode).toBe(401);
    const after = (await api(t, lanToken).get(`/assignments/${a.id}`)).json();
    expect(after).toMatchObject({ status: 'published', stats: { total: 2 } });
    expect((await api(t, await w.studentToken(w.bong.id, (await loginByPhone(t, w.mom.phone)).accessToken)).get('/student/assignments')).json()).toHaveLength(1);
    const events = await t.db.select().from(schema.outbox).where(eq(schema.outbox.aggregateId, a.id));
    expect(events).toHaveLength(1);
  });

  it('trang "Hôm nay" của giáo viên và danh sách bài theo lớp–môn', async () => {
    const w = await m2World(t);
    await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài 1', submissionKinds: ['photo'] });
    clock.advance(2 * DAY); // thứ Sáu: Bài 1 (hạn 20:00 thứ Năm) đã quá hạn
    const lan = api(t, (await loginByPhone(t, w.lan.phone)).accessToken);
    await lan.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài 2', submissionKinds: ['photo'] });
    const ov = teacherOverviewSchema.parse((await lan.get('/teacher/overview')).json());
    expect(ov.teaching.map((x) => `${x.subject.shortName} ${x.class.name}`)).toEqual(['Tiếng Việt 1A', 'Tiếng Việt 1B']);
    expect(ov.teaching[0]).toMatchObject({ studentCount: 2, openAssignments: 1, toGrade: 0 }); // Bài 1 đã quá hạn
    const list = (await lan.get(`/teaching/${w.taTV1A}/assignments`)).json();
    expect(list.map((x: { title: string }) => x.title)).toEqual(['Bài 2', 'Bài 1']);
    const nam = api(t, (await loginByPhone(t, w.nam.phone)).accessToken);
    expect((await nam.get(`/teaching/${w.taTV1A}/assignments`)).statusCode).toBe(403);
  });
});
