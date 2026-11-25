import { auditLogSchema, reportJobSchema, submissionStatsSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { and, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationTriggers } from '../src/modules/notifications/public-api.js';
import { ReportsService } from '../src/modules/reporting/public-api.js';
import { api, loginByPhone, startTestApp, type TestApp } from './helpers.js';
import { DAY, FakeClock, HOUR, m2World, sampleFiles, upload } from './m2-helpers.js';

describe('báo cáo, tỉ lệ nộp, nhật ký truy cập (M6)', () => {
  let t: TestApp;
  let reports: ReportsService;
  let files: Awaited<ReturnType<typeof sampleFiles>>;
  const clock = new FakeClock();
  beforeAll(async () => {
    t = await startTestApp({ clock });
    reports = t.app.get(ReportsService);
    files = await sampleFiles();
  });
  beforeEach(() => (clock.current = new Date('2026-11-25T03:00:00Z'))); // 10:00 thứ Tư giờ VN
  afterAll(() => t.close());

  /** Lớp 1A: cô Lan giao 1 bài, Bống nộp và được chấm "Hoàn thành tốt", An chưa nộp; tua qua hạn. */
  async function world() {
    const w = await m2World(t);
    const L = api(t, w.lan.token);
    const [a] = (await L.post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Chép bài Cái Bống', submissionKinds: ['photo'] })).json();
    const grid = (await L.get(`/assignments/${a.id}/submissions`)).json();
    const sa = grid.find((r: { student: { id: string } }) => r.student.id === w.bong.id).studentAssignmentId as string;
    const bongToken = await w.studentToken(w.bong.id);
    const photo = await upload(t, bongToken, `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const sub = (await api(t, bongToken).post(`/student-assignments/${sa}/submissions`, { mediaIds: [photo] })).json();
    expect((await L.put(`/submissions/${sub.attempts[0].id}/evaluation`, { level: 'HOAN_THANH_TOT', comment: 'Con chép rất sạch đẹp!' })).statusCode).toBe(200);
    clock.advance(2 * DAY); // qua hạn (tối mai 20:00) — token cũ hết hạn, đăng nhập lại
    const relogin = async (phone: string) => (await loginByPhone(t, phone)).accessToken;
    const adminToken = await relogin(w.adminPhone);
    return {
      ...w,
      lan: { ...w.lan, token: await relogin(w.lan.phone) },
      nam: { ...w.nam, token: await relogin(w.nam.phone) },
      mom: { ...w.mom, accessToken: await relogin(w.mom.phone) },
      admin: { ...w.admin, accessToken: adminToken },
      A: api(t, adminToken),
      a,
      sa,
      photo,
    };
  }

  /** Như worker: chạy việc xuất rồi đọc lại trạng thái. */
  const runAndGet = async (token: string, id: string) => {
    await reports.run(id);
    const res = await api(t, token).get(`/reports/${id}`);
    expect(res.statusCode).toBe(200);
    return reportJobSchema.parse(res.json());
  };
  const download = async (url: string) => {
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    return { bytes: Buffer.from(await res.arrayBuffer()), disposition: res.headers.get('content-disposition') };
  };

  it('báo cáo lớp Excel: giáo viên bộ môn xuất được lớp mình dạy, có mức đánh giá và "Chưa nộp"; link hết hạn sau 24 giờ', async () => {
    const w = await world();
    const L = api(t, w.lan.token);
    const created = await L.post('/reports', { type: 'class', format: 'xlsx', classId: w.classes['1A']!.id, from: '2026-11-01', to: '2026-11-30' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: 'queued', downloadUrl: null });

    const job = await runAndGet(w.lan.token, created.json().id);
    expect(job).toMatchObject({ status: 'done', fileName: 'bao-cao-lop-1a-2026-11-01-2026-11-30.xlsx', downloadUrl: expect.stringContaining('X-Amz-Signature') });
    const { bytes, disposition } = await download(job.downloadUrl!);
    expect(disposition).toContain('bao-cao-lop-1a');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Tiếng Việt')!;
    const rows: unknown[][] = [];
    ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
    expect(rows[0]![0]).toBe('Báo cáo lớp 1A — Tiếng Việt');
    const header = rows.find((r) => r[0] === 'STT')!;
    expect(header[2]).toMatch(/^Chép bài Cái Bống \(hạn \d\d\/11\)$/);
    expect(rows).toContainEqual([1, 'Phạm Minh An', 'Chưa nộp', '0/1', 0, '0%']);
    expect(rows).toContainEqual([2, 'Nguyễn Ngọc Bống', 'Hoàn thành tốt', '1/1', 0, '100%']);

    // Người yêu cầu nhận thông báo "Báo cáo đã sẵn sàng" (không chờ giờ yên lặng)
    const [n] = await t.db.select().from(schema.notifications).where(and(eq(schema.notifications.recipientUserId, w.lan.id), eq(schema.notifications.template, 'report_ready')));
    expect(n).toMatchObject({ title: 'Báo cáo đã sẵn sàng', payload: expect.objectContaining({ reportId: job.id }) });

    // Thầy Nam (dạy Toán 7A) không xuất được lớp 1A; người khác không xem được job của cô Lan
    expect((await api(t, w.nam.token).post('/reports', { type: 'class', format: 'pdf', classId: w.classes['1A']!.id, from: '2026-11-01', to: '2026-11-30' })).statusCode).toBe(403);
    expect((await api(t, w.nam.token).get(`/reports/${job.id}`)).statusCode).toBe(404);

    clock.advance(25 * HOUR);
    expect((await api(t, (await loginByPhone(t, w.lan.phone)).accessToken).get(`/reports/${job.id}`)).json()).toMatchObject({ status: 'done', downloadUrl: null });
  });

  it('phụ huynh tải báo cáo PDF của con (đủ dấu tiếng Việt), không xuất được cho em khác', async () => {
    const w = await world();
    const M = api(t, w.mom.accessToken);
    const created = await M.post('/reports', { type: 'student', format: 'pdf', studentId: w.bong.id, from: '2026-11-01', to: '2026-11-30' });
    expect(created.statusCode).toBe(201);
    const job = await runAndGet(w.mom.accessToken, created.json().id);
    expect(job).toMatchObject({ status: 'done', fileName: 'bao-cao-nguyen-ngoc-bong-2026-11-01-2026-11-30.pdf' });
    const { bytes } = await download(job.downloadUrl!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('BeVietnamPro'); // font nhúng kèm
    expect((await M.post('/reports', { type: 'student', format: 'pdf', studentId: w.an.id, from: '2026-11-01', to: '2026-11-30' })).statusCode).toBe(403);
    // Thiếu tham số / sai khoảng ngày → 400
    expect((await M.post('/reports', { type: 'student', format: 'pdf', from: '2026-11-30', to: '2026-11-01' })).statusCode).toBe(400);
  });

  it('quản trị: tỉ lệ nộp theo lớp × môn + báo cáo toàn trường; giáo viên không xem được', async () => {
    const w = await world();
    const q = `academicYearId=${w.year.id}&from=2026-11-01&to=2026-11-30`;
    const res = await w.A.get(`/schools/${w.school.id}/submission-stats?${q}`);
    expect(res.statusCode).toBe(200);
    const { rows } = submissionStatsSchema.parse(res.json());
    expect(rows.find((r) => r.className === '1A')).toMatchObject({ subjectName: 'Tiếng Việt', teacherName: 'Trần Thị Lan', assignments: 1, expected: 2, submitted: 1, late: 0, rate: 0.5 });
    expect(rows.find((r) => r.className === '7A')).toMatchObject({ subjectName: 'Toán', assignments: 0, expected: 0, rate: null });
    expect((await api(t, w.lan.token).get(`/schools/${w.school.id}/submission-stats?${q}`)).statusCode).toBe(403);

    const created = await w.A.post('/reports', { type: 'school', format: 'xlsx', schoolId: w.school.id, academicYearId: w.year.id, from: '2026-11-01', to: '2026-11-30' });
    expect(created.statusCode).toBe(201);
    const job = await runAndGet(w.admin.accessToken, created.json().id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await download(job.downloadUrl!)).bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Theo lớp', 'Theo lớp và môn']);
    const byClass: unknown[][] = [];
    wb.getWorksheet('Theo lớp')!.eachRow((r) => byClass.push((r.values as unknown[]).slice(1)));
    expect(byClass).toContainEqual(['1A', 1, 2, 1, 0, '50%']);
    expect((await api(t, w.lan.token).post('/reports', { type: 'school', format: 'xlsx', schoolId: w.school.id, academicYearId: w.year.id, from: '2026-11-01', to: '2026-11-30' })).statusCode).toBe(403);
  });

  it('nhật ký truy cập: quản trị xem được (phân trang), bảng chỉ ghi thêm — không sửa/xoá được', async () => {
    const w = await world();
    await api(t, w.lan.token).post('/reports', { type: 'class', format: 'xlsx', classId: w.classes['1A']!.id, from: '2026-11-01', to: '2026-11-30' });
    const res = await w.A.get(`/schools/${w.school.id}/audit-logs?limit=200`);
    expect(res.statusCode).toBe(200);
    const log = auditLogSchema.parse(res.json());
    expect(log.items[0]).toMatchObject({ action: 'report.export', actorName: 'Trần Thị Lan', actorType: 'user' });
    expect(log.items.map((i) => i.action)).toEqual(expect.arrayContaining(['report.export', 'teaching.assign']));

    const page1 = auditLogSchema.parse((await w.A.get(`/schools/${w.school.id}/audit-logs?limit=1`)).json());
    expect(page1.items).toHaveLength(1);
    const page2 = auditLogSchema.parse((await w.A.get(`/schools/${w.school.id}/audit-logs?limit=1&before=${page1.nextBefore}`)).json());
    expect(page2.items[0]!.id).toBeLessThan(page1.items[0]!.id);
    const filtered = auditLogSchema.parse((await w.A.get(`/schools/${w.school.id}/audit-logs?action=report.`)).json());
    expect(new Set(filtered.items.map((i) => i.action))).toEqual(new Set(['report.export']));
    // Lần xem nhật ký cũng được ghi lại
    expect((await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.schoolId, w.school.id), eq(schema.auditLogs.action, 'audit.view')))).length).toBeGreaterThan(0);
    expect((await api(t, w.lan.token).get(`/schools/${w.school.id}/audit-logs`)).statusCode).toBe(403);

    await expect(t.db.update(schema.auditLogs).set({ action: 'hidden' }).where(eq(schema.auditLogs.schoolId, w.school.id))).rejects.toThrow();
    await expect(t.db.delete(schema.auditLogs).where(eq(schema.auditLogs.schoolId, w.school.id))).rejects.toThrow();
  });

  it('báo trước 7 ngày khi ảnh bài nộp sắp bị xoá theo hạn lưu, không báo trùng', async () => {
    const w = await world(); // hôm nay 27/11 (VN)
    await t.db.update(schema.mediaFiles).set({ status: 'ready', deleteAfter: '2026-12-04' }).where(eq(schema.mediaFiles.id, w.photo));
    const triggers = t.app.get(NotificationTriggers);
    expect(await triggers.mediaExpiringWarnings()).toBe(1);
    expect(await triggers.mediaExpiringWarnings()).toBe(0);
    const [n] = await t.db.select().from(schema.notifications).where(and(eq(schema.notifications.recipientUserId, w.mom.user.id), eq(schema.notifications.template, 'media_expiring')));
    expect(n).toMatchObject({ title: 'Sắp xoá ảnh/video bài cũ', body: expect.stringContaining('1 ảnh/video bài của Bống sẽ được xoá ngày 04/12') });
  });
});
