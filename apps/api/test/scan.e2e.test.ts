import { scanJobSchema, studentAssignmentDetailSchema, studentAssignmentItemSchema, uploadTicketSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScanError, ScanService } from '../src/modules/scan/public-api.js';
import { api, startTestApp, type TestApp } from './helpers.js';
import { m2World } from './m2-helpers.js';

const run = promisify(execFile);

/** Ảnh "trang đề" khác nhau (màu khác nhau → nội dung khác nhau). */
async function page(color: string) {
  const dir = await mkdtemp(join(tmpdir(), 'nopi-scan-'));
  const f = join(dir, 'p.jpg');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=800x1100`, '-frames:v', '1', f]);
  return readFile(f);
}

describe('quét đề thành bài tập', () => {
  let t: TestApp;
  let scan: ScanService;
  beforeAll(async () => {
    t = await startTestApp();
    scan = t.app.get(ScanService);
  });
  afterAll(() => t.close());

  async function uploadPage(token: string, bytes: Buffer, teachingAssignmentId?: string) {
    const res = await api(t, token).post('/scan/uploads', { teachingAssignmentId, mimeType: 'image/jpeg', sizeBytes: bytes.length });
    if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
    const ticket = uploadTicketSchema.parse(res.json());
    if (ticket.method !== 'put') throw new Error('put');
    await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: new Uint8Array(bytes) });
    await api(t, token).post(`/media/${ticket.mediaId}/complete`, {});
    return ticket.mediaId;
  }

  /** Giáo viên quét → worker đọc → kết quả. */
  async function scanAndRun(token: string, ids: string[], ta?: string) {
    const created = scanJobSchema.parse((await api(t, token).post('/scan-jobs', { mediaIds: ids, teachingAssignmentId: ta })).json());
    if (created.status === 'queued') await scan.run(created.id, 1, 3);
    return scanJobSchema.parse((await api(t, token).get(`/scan-jobs/${created.id}`)).json());
  }

  it('giáo viên quét 2 trang → AI tách câu → soát rồi giao: học sinh thấy từng câu + ảnh gốc', async () => {
    const w = await m2World(t);
    const ids = [await uploadPage(w.lan.token, await page('white'), w.taTV1A), await uploadPage(w.lan.token, await page('gray'), w.taTV1A)];
    const created = scanJobSchema.parse((await api(t, w.lan.token).post('/scan-jobs', { mediaIds: ids, teachingAssignmentId: w.taTV1A })).json());
    expect(created).toMatchObject({ status: 'queued', cached: false, result: null, quota: { used: 1, limit: 30 } });
    await scan.run(created.id, 1, 3);
    const job = scanJobSchema.parse((await api(t, w.lan.token).get(`/scan-jobs/${created.id}`)).json());
    expect(job.status).toBe('done');
    expect(job.result!.items).toHaveLength(3);
    expect(job.result!.items[2]!.aiConfidence).toBeLessThan(0.7); // câu AI không chắc → tô vàng để soát
    expect(job.sourceMedia).toHaveLength(2);

    // Cô sửa câu 3, bỏ câu 2 rồi giao (kèm ảnh gốc)
    const items = [job.result!.items[0]!, { ...job.result!.items[2]!, promptText: 'Viết hai phép cộng có kết quả bằng 10.', aiConfidence: null }].map(({ number: _n, ...it }) => it);
    const a = (await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: job.result!.title, instructions: job.result!.instructions, submissionKinds: ['photo'], items, originalMediaIds: ids, source: 'scan', scanJobId: job.id })).json();
    expect(a[0]).toMatchObject({ title: 'Bài 12: Phép cộng trong phạm vi 10', instructions: 'Tính nhẩm rồi viết kết quả vào vở.' });

    const bongToken = await w.studentToken(w.bong.id);
    const [item] = (await api(t, bongToken).get('/student/assignments')).json();
    const d = studentAssignmentDetailSchema.parse((await api(t, bongToken).get(`/student-assignments/${item.id}`)).json());
    expect(d.items.map((i) => [i.position, i.itemType, i.promptText])).toEqual([
      [1, 'fill_blank', '3 + 4 = .....'],
      [2, 'open', 'Viết hai phép cộng có kết quả bằng 10.'],
    ]);
    expect(d.originals).toHaveLength(2);
    expect(d.originals[0]!.url).toContain('X-Amz-Signature');
  });

  it('ảnh trùng trang đã quét trong trường → dùng lại kết quả ngay, không gọi AI, không tốn lượt', async () => {
    const w = await m2World(t);
    const bytes = await page('beige');
    const first = await scanAndRun(w.lan.token, [await uploadPage(w.lan.token, bytes, w.taTV1A)], w.taTV1A);
    const calls = t.scanEngine.calls;
    // Cô khác trong trường chụp lại đúng trang đó (cùng nội dung ảnh)
    const again = scanJobSchema.parse((await api(t, w.lan.token).post('/scan-jobs', { mediaIds: [await uploadPage(w.lan.token, bytes, w.taTV1A)], teachingAssignmentId: w.taTV1A })).json());
    expect(again).toMatchObject({ status: 'done', cached: true, quota: { used: first.quota.used } });
    expect(again.result).toEqual(first.result);
    expect(t.scanEngine.calls).toBe(calls);
  });

  it('giới hạn lượt quét mỗi ngày; người khác không xem được lượt quét; ảnh của người khác không dùng được', async () => {
    const w = await m2World(t);
    await t.db.update(schema.schools).set({ settings: { scanQuotaPerDay: 1 } }).where(eq(schema.schools.id, w.school.id));
    await scanAndRun(w.lan.token, [await uploadPage(w.lan.token, await page('red'), w.taTV1A)], w.taTV1A);
    const over = await api(t, w.lan.token).post('/scan-jobs', { mediaIds: [await uploadPage(w.lan.token, await page('blue'), w.taTV1A)], teachingAssignmentId: w.taTV1A });
    expect(over.statusCode).toBe(429);
    expect(over.json().error.message).toBe('Hôm nay đã quét đủ 1 lượt, mai quét tiếp nhé');

    const lanPhoto = await uploadPage(w.lan.token, await page('green'), w.taTV1A);
    const job = (await api(t, w.lan.token).post('/scan-jobs', { mediaIds: [lanPhoto], teachingAssignmentId: w.taTV1A })).json();
    expect((await api(t, w.nam.token).post('/scan-jobs', { mediaIds: [lanPhoto], teachingAssignmentId: w.taToan7A })).json().error.message).toBe('Ảnh trang đề không hợp lệ, chụp lại nhé');
    expect((await api(t, w.nam.token).get(`/scan-jobs/${job.id ?? '00000000-0000-0000-0000-000000000000'}`)).statusCode).toBe(404);
    // Không phân công lớp–môn đó thì không quét được
    expect((await api(t, w.nam.token).post('/scan/uploads', { teachingAssignmentId: w.taTV1A, mimeType: 'image/jpeg', sizeBytes: 1000 })).statusCode).toBe(403);
  });

  it('AI lỗi tạm thì thử lại; lỗi dừng hẳn hoặc hết lượt thử thì báo rõ cho người quét', async () => {
    const w = await m2World(t);
    const create = async (color: string) =>
      scanJobSchema.parse((await api(t, w.lan.token).post('/scan-jobs', { mediaIds: [await uploadPage(w.lan.token, await page(color), w.taTV1A)], teachingAssignmentId: w.taTV1A })).json());

    const j1 = await create('yellow');
    t.scanEngine.failNext = new ScanError('Dịch vụ đọc đề đang bận, đang thử lại…', true);
    await expect(scan.run(j1.id, 1, 3)).rejects.toThrow('đang bận');
    expect((await api(t, w.lan.token).get(`/scan-jobs/${j1.id}`)).json().status).toBe('queued');
    await scan.run(j1.id, 2, 3);
    expect((await api(t, w.lan.token).get(`/scan-jobs/${j1.id}`)).json().status).toBe('done');

    const j2 = await create('purple');
    t.scanEngine.failNext = new ScanError('Chưa đọc được trang này, thầy cô soạn tay giúp nhé', false);
    await scan.run(j2.id, 1, 3);
    expect((await api(t, w.lan.token).get(`/scan-jobs/${j2.id}`)).json()).toMatchObject({ status: 'failed', error: 'Chưa đọc được trang này, thầy cô soạn tay giúp nhé' });

    const j3 = await create('orange');
    t.scanEngine.failNext = new ScanError('Dịch vụ đọc đề đang bận, đang thử lại…', true);
    await scan.run(j3.id, 3, 3); // lần thử cuối
    expect((await api(t, w.lan.token).get(`/scan-jobs/${j3.id}`)).json().status).toBe('failed');
  });

  it('học sinh lớp 1 không tự quét; lớp 7 quét → bài tự luyện riêng, không nộp cho cô, tự đánh dấu "Đã xong"', async () => {
    const w = await m2World(t);
    const bongToken = await w.studentToken(w.bong.id);
    const no = await api(t, bongToken).post('/scan/uploads', { mimeType: 'image/jpeg', sizeBytes: 1000 });
    expect(no.json().error.message).toBe('Học sinh lớp 1–5 nhờ bố mẹ quét đề giúp nhé');

    const khoi = await w.cardToken(w.classes['7A']!.id, w.khoi.id);
    const job = await scanAndRun(khoi, [await uploadPage(khoi, await page('pink'))]);
    expect(job.status).toBe('done');
    const toan = (await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, 'TOAN')))[0]!.id;
    const items = job.result!.items.map(({ number: _n, ...it }) => it);
    const created = (await api(t, khoi).post('/student/practice', { scanJobId: job.id, subjectId: toan, title: 'Luyện thêm phép cộng', items })).json();

    const list = (await api(t, khoi).get('/student/assignments')).json().map((x: unknown) => studentAssignmentItemSchema.parse(x));
    expect(list).toEqual([expect.objectContaining({ id: created.studentAssignmentId, isPractice: true, fromFamily: false, status: 'assigned', subject: expect.objectContaining({ code: 'TOAN' }) })]);
    const d = studentAssignmentDetailSchema.parse((await api(t, khoi).get(`/student-assignments/${created.studentAssignmentId}`)).json());
    expect(d).toMatchObject({ canSubmit: false, items: expect.any(Array), originals: [expect.any(Object)] });
    expect((await api(t, khoi).post(`/student-assignments/${created.studentAssignmentId}/uploads`, { kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 100 })).json().error.message).toContain('Bài tự luyện không cần nộp');

    expect((await api(t, khoi).post(`/student/practice/${created.studentAssignmentId}/done`)).statusCode).toBe(204);
    expect((await api(t, khoi).get('/student/assignments')).json()[0].status).toBe('submitted');
    // Không ai khác đánh dấu hộ; không có thông báo "bài mới" cho bài tự luyện
    expect((await api(t, w.nam.token).post(`/student/practice/${created.studentAssignmentId}/done`)).statusCode).toBe(403);
    const events = await t.db.select().from(schema.outbox).where(eq(schema.outbox.eventType, 'AssignmentPublished'));
    expect(events.some((e) => (e.payload as { studentIds: string[] }).studentIds.includes(w.khoi.id))).toBe(false);
    // Môn không thuộc khối → báo
    const tv = (await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, 'TIENG_VIET')))[0]!.id;
    expect((await api(t, khoi).post('/student/practice', { scanJobId: job.id, subjectId: tv, title: 'x', items })).json().error.message).toBe('Môn này không có trong chương trình lớp 7');
  });
});
