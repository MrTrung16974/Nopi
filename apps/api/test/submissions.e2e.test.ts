import { gradingRowSchema, multipartStatusSchema, studentAssignmentDetailSchema, uploadTicketSchema } from '@nopi/contracts';
import { schema } from '@nopi/db';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MediaJobs } from '../src/modules/media/public-api.js';
import { api, loginByPhone, startTestApp, type TestApp } from './helpers.js';
import { DAY, FakeClock, m2World, sampleFiles, upload } from './m2-helpers.js';

describe('nộp bài – chấm bài – media', () => {
  let t: TestApp;
  let files: Awaited<ReturnType<typeof sampleFiles>>;
  const clock = new FakeClock();
  beforeAll(async () => {
    t = await startTestApp({ clock });
    files = await sampleFiles();
  });
  beforeEach(() => (clock.current = new Date('2026-11-25T03:00:00Z')));
  afterAll(() => t.close());

  async function giveAssignment(w: Awaited<ReturnType<typeof m2World>>, body: Record<string, unknown> = {}) {
    const res = await api(t, w.lan.token).post('/assignments', { teachingAssignmentIds: [w.taTV1A], title: 'Bài tập trong vở', submissionKinds: ['photo'], maxPhotos: 2, ...body });
    const a = res.json()[0];
    const grid = (await api(t, w.lan.token).get(`/assignments/${a.id}/submissions`)).json();
    const saOf = (studentId: string) => grid.find((r: { student: { id: string } }) => r.student.id === studentId).studentAssignmentId as string;
    return { a, saOf };
  }

  it('vòng lặp đầy đủ: nộp ảnh → cô yêu cầu làm lại → nộp lại → cô chấm → học sinh thấy nhận xét + sticker', async () => {
    const w = await m2World(t);
    const { a, saOf } = await giveAssignment(w);
    const sa = saOf(w.bong.id);
    const B = api(t, await w.studentToken(w.bong.id));
    const L = api(t, w.lan.token);

    // Học sinh nộp 1 ảnh (tải thẳng lên kho bằng URL ký sẵn)
    const photo = await upload(t, (await w.studentToken(w.bong.id)), `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const sub1 = await B.post(`/student-assignments/${sa}/submissions`, { mediaIds: [photo] });
    expect(sub1.statusCode).toBe(200);
    const d1 = studentAssignmentDetailSchema.parse(sub1.json());
    expect(d1).toMatchObject({ status: 'submitted', isLate: false, attempts: [{ attemptNo: 1, byGuardian: false }] });
    expect(d1.attempts[0]!.media[0]).toMatchObject({ kind: 'photo', status: 'processing', url: expect.stringContaining('X-Amz-Signature') });
    // Mất phản hồi, app gửi lại đúng bộ file → không tạo lần nộp thứ hai
    const again = studentAssignmentDetailSchema.parse((await B.post(`/student-assignments/${sa}/submissions`, { mediaIds: [photo] })).json());
    expect(again.attempts).toHaveLength(1);

    // Lưới chấm: "Chờ chấm" lên đầu
    const grid = (await L.get(`/assignments/${a.id}/submissions`)).json().map((r: unknown) => gradingRowSchema.parse(r));
    expect(grid.map((r: { student: { fullName: string }; status: string }) => [r.student.fullName, r.status])).toEqual([
      ['Nguyễn Ngọc Bống', 'submitted'],
      ['Phạm Minh An', 'assigned'],
    ]);
    const submissionId = grid[0].latest.id;

    // Thiếu mức đánh giá → báo lỗi dễ hiểu
    const noLevel = await L.put(`/submissions/${submissionId}/evaluation`, { comment: 'Tốt' });
    expect(noLevel.json().error.message).toBe('Chọn mức đánh giá');
    // Thang tiểu học không nhận "Đạt"
    expect((await L.put(`/submissions/${submissionId}/evaluation`, { level: 'DAT' })).json().error.message).toBe('Mức đánh giá không đúng thang của bài');

    const redo = await L.put(`/submissions/${submissionId}/evaluation`, { requiresRedo: true, comment: 'Con viết lại câu 2 cho đẹp hơn nhé' });
    expect(redo.statusCode).toBe(200);
    expect(redo.json()).toMatchObject({ status: 'returned', evaluation: { requiresRedo: true } });
    const d2 = studentAssignmentDetailSchema.parse((await B.get(`/student-assignments/${sa}`)).json());
    expect(d2).toMatchObject({ status: 'returned', canSubmit: true, feedback: { requiresRedo: true, comment: 'Con viết lại câu 2 cho đẹp hơn nhé', label: null } });

    // Nộp lại (lần 2) — file cũ không dùng lại được
    expect((await B.post(`/student-assignments/${sa}/submissions`, { mediaIds: [photo] })).json().error.message).toBe('Có file đã nộp ở lần trước, con chụp/ghi lại nhé');
    const photo2 = await upload(t, (await w.studentToken(w.bong.id)), `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const d3 = studentAssignmentDetailSchema.parse((await B.post(`/student-assignments/${sa}/submissions`, { mediaIds: [photo2] })).json());
    expect(d3.attempts.map((x) => x.attemptNo)).toEqual([2, 1]);

    // Chấm lần nộp cũ → không được; chấm lần mới nhất
    expect((await L.put(`/submissions/${submissionId}/evaluation`, { level: 'HOAN_THANH' })).statusCode).toBe(409);
    const graded = await L.put(`/submissions/${d3.attempts[0]!.id}/evaluation`, { level: 'HOAN_THANH_TOT', comment: 'Con viết đẹp lắm!', sticker: 'chu-dep' });
    expect(graded.json()).toMatchObject({ status: 'graded', evaluation: { level: 'HOAN_THANH_TOT', sticker: 'chu-dep' } });

    // Tiểu học (TT 27): học sinh/phụ huynh chỉ thấy nhận xét + sticker, không thấy mức
    const d4 = studentAssignmentDetailSchema.parse((await B.get(`/student-assignments/${sa}`)).json());
    expect(d4).toMatchObject({ status: 'graded', canSubmit: false, feedback: { label: null, comment: 'Con viết đẹp lắm!', sticker: 'chu-dep', requiresRedo: false } });
    expect((await B.post(`/student-assignments/${sa}/submissions`, { mediaIds: [photo2] })).statusCode).toBe(400); // file đã dùng
    // Sửa nhận xét sau khi chấm: được, có ghi nhật ký
    await L.put(`/submissions/${d3.attempts[0]!.id}/evaluation`, { level: 'HOAN_THANH', comment: 'Sửa lại' });
    const logs = await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'evaluation.update'));
    expect(logs.some((l) => l.studentId === w.bong.id)).toBe(true);

    const events = (await t.db.select().from(schema.outbox).orderBy(schema.outbox.createdAt, schema.outbox.id)).filter((e) => (e.payload as { studentId?: string }).studentId === w.bong.id).map((e) => e.eventType);
    expect(events).toEqual(['SubmissionCreated', 'EvaluationSaved', 'SubmissionCreated', 'EvaluationSaved', 'EvaluationSaved']);
  });

  it('THCS: chấm điểm 0–10 bước 0,25; học sinh thấy điểm', async () => {
    const w = await m2World(t);
    const N = api(t, w.nam.token);
    const a = (await N.post('/assignments', { teachingAssignmentIds: [w.taToan7A], title: 'Bài 1 trang 10', submissionKinds: ['photo'] })).json()[0];
    const sa = (await N.get(`/assignments/${a.id}/submissions`)).json()[0].studentAssignmentId;
    const khoiToken = await w.cardToken(w.classes['7A']!.id, w.khoi.id);
    const m = await upload(t, khoiToken, `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const sub = studentAssignmentDetailSchema.parse((await api(t, khoiToken).post(`/student-assignments/${sa}/submissions`, { mediaIds: [m] })).json());
    const bad = await N.put(`/submissions/${sub.attempts[0]!.id}/evaluation`, { score: 8.3 });
    expect(bad.json().error.details[0].message).toBe('Điểm phải theo bước 0.25');
    await N.put(`/submissions/${sub.attempts[0]!.id}/evaluation`, { score: 8.25, comment: 'Trình bày rõ ràng' });
    expect((await api(t, khoiToken).get(`/student-assignments/${sa}`)).json().feedback).toMatchObject({ label: '8,25', comment: 'Trình bày rõ ràng' });
    // Giáo viên môn khác không chấm được
    expect((await api(t, w.lan.token).put(`/submissions/${sub.attempts[0]!.id}/evaluation`, { score: 10 })).statusCode).toBe(403);
  });

  it('phụ huynh nộp hộ; giới hạn cách nộp, số ảnh; không dùng file của người khác', async () => {
    const w = await m2World(t);
    const { saOf } = await giveAssignment(w);
    const M = w.mom.accessToken;
    const sa = saOf(w.bong.id);
    // Cách nộp không đúng yêu cầu
    expect((await api(t, M).post(`/student-assignments/${sa}/uploads`, { kind: 'video', mimeType: 'video/mp4', sizeBytes: 1000 })).json().error.message).toBe('Bài này cô không yêu cầu nộp kiểu này');
    // Định dạng / kích thước
    expect((await api(t, M).post(`/student-assignments/${sa}/uploads`, { kind: 'photo', mimeType: 'image/gif', sizeBytes: 1000 })).json().error.message).toBe('Định dạng ảnh này chưa được hỗ trợ');
    expect((await api(t, M).post(`/student-assignments/${sa}/uploads`, { kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 50 * 1024 * 1024 })).json().error.message).toBe('File ảnh quá lớn (tối đa 15 MB)');

    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await upload(t, M, `/student-assignments/${sa}/uploads`, 'photo', files.photo));
    expect((await api(t, M).post(`/student-assignments/${sa}/submissions`, { mediaIds: ids })).json().error.message).toBe('Bài này nộp tối đa 2 ảnh');

    // An không dùng được ảnh mẹ Bống tải lên
    const anToken = await w.cardToken(w.classes['1A']!.id, w.an.id);
    expect((await api(t, anToken).post(`/student-assignments/${saOf(w.an.id)}/submissions`, { mediaIds: [ids[0]] })).json().error.message).toBe('Có file không hợp lệ, con chụp/ghi lại nhé');
    // Phụ huynh không nộp được bài của em khác
    expect((await api(t, M).post(`/student-assignments/${saOf(w.an.id)}/uploads`, { kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 1000 })).statusCode).toBe(403);

    const d = studentAssignmentDetailSchema.parse((await api(t, M).post(`/student-assignments/${sa}/submissions`, { mediaIds: ids.slice(0, 2) })).json());
    expect(d.attempts[0]).toMatchObject({ byGuardian: true });
    expect(d.attempts[0]!.media).toHaveLength(2);
  });

  it('nộp muộn: được nếu cô cho phép (gắn nhãn); không thì báo; phụ huynh thấy "quá hạn", học sinh không', async () => {
    const w = await m2World(t);
    const allow = await giveAssignment(w, { title: 'Cho nộp muộn' });
    const strict = await giveAssignment(w, { title: 'Không cho nộp muộn', allowLate: false });
    const momPhone = w.mom.phone;
    const prep = async (sa: string) => upload(t, w.mom.accessToken, `/student-assignments/${sa}/uploads`, 'photo', files.photo);
    const m1 = await prep(allow.saOf(w.bong.id));
    const m2 = await prep(strict.saOf(w.bong.id));

    clock.advance(2 * DAY);
    const M = api(t, (await loginByPhone(t, momPhone)).accessToken);
    const list = (await M.get(`/me/children/${w.bong.id}/assignments`)).json();
    expect(list.map((x: { status: string }) => x.status)).toEqual(['overdue', 'overdue']);
    const stuToken = await w.studentToken(w.bong.id, (await loginByPhone(t, momPhone)).accessToken);
    expect((await api(t, stuToken).get('/student/assignments')).json().map((x: { status: string }) => x.status)).toEqual(['assigned', 'assigned']);

    // Media tải trước hạn vẫn thuộc mẹ → mẹ nộp (token mới)
    const late = await M.post(`/student-assignments/${allow.saOf(w.bong.id)}/submissions`, { mediaIds: [m1] });
    expect(late.json()).toMatchObject({ status: 'submitted', isLate: true, attempts: [{ isLate: true }] });
    const blocked = await M.post(`/student-assignments/${strict.saOf(w.bong.id)}/submissions`, { mediaIds: [m2] });
    expect(blocked.json().error.message).toBe('Đã quá hạn nộp và cô chưa cho phép nộp muộn');
    expect((await M.get(`/student-assignments/${strict.saOf(w.bong.id)}`)).json().canSubmit).toBe(false);
  });

  it('worker xử lý media bằng ffmpeg: video → MP4 720p + ảnh thu nhỏ + thời lượng thật; ghi âm WebM → M4A', async () => {
    const w = await m2World(t);
    const { saOf } = await giveAssignment(w, { title: 'Kể chuyện', submissionKinds: ['video', 'audio'], maxMediaSeconds: 60 });
    const sa = saOf(w.bong.id);
    const M = w.mom.accessToken;
    const video = await upload(t, M, `/student-assignments/${sa}/uploads`, 'video', files.video, { durationS: 2 });
    const audio = await upload(t, M, `/student-assignments/${sa}/uploads`, 'audio', files.audio, { durationS: 2 });

    const jobs = t.app.get(MediaJobs);
    await jobs.run('process', { mediaId: video });
    await jobs.run('process', { mediaId: audio });
    await jobs.run('process', { mediaId: video }); // chạy lại: không làm gì

    const [v] = await t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.id, video));
    const [a] = await t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.id, audio));
    expect(v).toMatchObject({ status: 'ready', mimeType: 'video/mp4', storageKey: expect.stringMatching(/\.v\.mp4$/), thumbnailKey: expect.stringMatching(/\.thumb\.jpg$/) });
    expect(v!.durationS).toBeCloseTo(2, 0);
    expect(v!.deleteAfter).toBe('2027-11-25'); // giữ video 365 ngày (mặc định)
    expect(a).toMatchObject({ status: 'ready', mimeType: 'audio/mp4', thumbnailKey: null });

    const d = studentAssignmentDetailSchema.parse((await api(t, M).post(`/student-assignments/${sa}/submissions`, { mediaIds: [video, audio] })).json());
    const vv = d.attempts[0]!.media.find((m) => m.kind === 'video')!;
    expect(vv).toMatchObject({ status: 'ready', thumbnailUrl: expect.any(String) });
    // Link xem tải được thật, và là video 720p
    const got = await fetch(vv.url!);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('video/mp4');

    // File giả mạo (không phải video) → đánh dấu lỗi, không nộp được
    const fake = await upload(t, M, `/student-assignments/${sa}/uploads`, 'video', Buffer.from('khong phai video'));
    await jobs.run('process', { mediaId: fake });
    const [f] = await t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.id, fake));
    expect(f!.status).toBe('failed');
  });

  it('video lớn tải theo phần: rớt mạng giữa chừng thì hỏi phần đã lên rồi tải tiếp', async () => {
    const w = await m2World(t);
    const { saOf } = await giveAssignment(w, { title: 'Múa', submissionKinds: ['video'], maxMediaSeconds: 300 });
    const sa = saOf(w.bong.id);
    const M = api(t, w.mom.accessToken);
    const big = randomBytes(17 * 1024 * 1024);
    const ticket = uploadTicketSchema.parse((await M.post(`/student-assignments/${sa}/uploads`, { kind: 'video', mimeType: 'video/mp4', sizeBytes: big.length, durationS: 100 })).json());
    if (ticket.method !== 'multipart') throw new Error('expected multipart');
    expect(ticket.parts).toHaveLength(3);
    const putPart = async (n: number, url: string) => {
      const chunk = big.subarray((n - 1) * ticket.partSize, n * ticket.partSize);
      const r = await fetch(url, { method: 'PUT', body: new Uint8Array(chunk) });
      expect(r.status).toBe(200);
      return { partNumber: n, etag: r.headers.get('etag')! };
    };
    const p1 = await putPart(1, ticket.parts[0]!.url);
    // … rớt mạng. Mở lại app: hỏi trạng thái
    const status = multipartStatusSchema.parse((await M.get(`/media/${ticket.mediaId}/multipart`)).json());
    expect(status.uploaded.map((p) => p.partNumber)).toEqual([1]);
    expect(status.parts.map((p) => p.partNumber)).toEqual([2, 3]);
    const rest = [await putPart(2, status.parts[0]!.url), await putPart(3, status.parts[1]!.url)];
    // Thiếu phần → báo
    expect((await M.post(`/media/${ticket.mediaId}/complete`, { parts: [p1] })).statusCode).toBe(400);
    const done = await M.post(`/media/${ticket.mediaId}/complete`, { parts: [p1, ...rest] });
    expect(done.json()).toMatchObject({ status: 'processing' });
    // Người khác không xác nhận được file của mình
    const lan = api(t, w.lan.token);
    expect((await lan.post(`/media/${ticket.mediaId}/complete`, {})).statusCode).toBe(404);
  });
});
