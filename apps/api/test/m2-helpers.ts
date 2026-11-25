import { schema } from '@nopi/db';
import { uploadTicketSchema } from '@nopi/contracts';
import { eq } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { addTeacher, api, loginByPhone, randomPhone, setupSchool, type TestApp } from './helpers.js';
import { CURRENT_POLICY_VERSION } from '@nopi/domain';

const run = promisify(execFile);

/** Đồng hồ điều khiển được: test tua thời gian để thử hẹn giờ giao, nộp muộn. */
export class FakeClock {
  current = new Date();
  now = () => new Date(this.current);
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** File media nhỏ sinh bằng ffmpeg (ảnh JPEG, video MP4 2 giây, ghi âm WebM 2 giây). */
export async function sampleFiles() {
  const dir = await mkdtemp(join(tmpdir(), 'nopi-test-'));
  const f = { photo: join(dir, 'p.jpg'), video: join(dir, 'v.mp4'), audio: join(dir, 'a.webm') };
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x960:rate=1', '-frames:v', '1', f.photo]);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f.video]);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:a', 'libopus', f.audio]);
  return { photo: await readFile(f.photo), video: await readFile(f.video), audio: await readFile(f.audio) };
}

const MIME = { photo: 'image/jpeg', video: 'video/mp4', audio: 'audio/webm', document: 'application/pdf' } as const;

/** Xin URL → PUT thẳng lên MinIO → báo hoàn tất. Trả về mediaId. */
export async function upload(
  t: TestApp,
  token: string,
  path: string,
  kind: keyof typeof MIME,
  bytes: Buffer,
  opts: { durationS?: number; mime?: string } = {},
) {
  const res = await api(t, token).post(path, { kind, mimeType: opts.mime ?? MIME[kind], sizeBytes: bytes.length, durationS: opts.durationS });
  if (res.statusCode !== 201) throw new Error(`upload ${res.statusCode} ${res.body}`);
  const ticket = uploadTicketSchema.parse(res.json());
  if (ticket.method !== 'put') throw new Error('expected single PUT');
  const put = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`PUT ${put.status} ${await put.text()}`);
  const done = await api(t, token).post(`/media/${ticket.mediaId}/complete`, {});
  if (done.statusCode !== 200) throw new Error(`complete ${done.statusCode} ${done.body}`);
  return ticket.mediaId;
}

/**
 * Thế giới thử: trường có lớp 1A (2 em: Bống có mẹ, An) và 7A (1 em: Khôi),
 * cô Lan dạy Tiếng Việt 1A, thầy Nam dạy Toán 7A.
 */
export async function m2World(t: TestApp) {
  const s = await setupSchool(t, { classes: [{ grade: 1, name: '1A' }, { grade: 1, name: '1B' }, { grade: 7, name: '7A' }] });
  const lan = await addTeacher(t, s.A, s.school.id, 'Trần Thị Lan');
  const nam = await addTeacher(t, s.A, s.school.id, 'Lê Văn Nam');
  const subj = async (code: string) => (await t.db.select().from(schema.subjects).where(eq(schema.subjects.code, code)))[0]!.id;
  const tv = await subj('TIENG_VIET');
  const toan = await subj('TOAN');
  await s.A.put(`/classes/${s.classes['1A']!.id}/teaching/${tv}`, { teacherId: lan.id });
  await s.A.put(`/classes/${s.classes['1B']!.id}/teaching/${tv}`, { teacherId: lan.id });
  await s.A.put(`/classes/${s.classes['7A']!.id}/teaching/${toan}`, { teacherId: nam.id });
  const add = async (cls: string, fullName: string, nickname?: string) =>
    (await s.A.post(`/classes/${s.classes[cls]!.id}/students`, { fullName, nickname })).json() as { id: string };
  const bong = await add('1A', 'Nguyễn Ngọc Bống', 'Bống');
  const an = await add('1A', 'Phạm Minh An');
  const binh = await add('1B', 'Đỗ Thanh Bình');
  const khoi = await add('7A', 'Trần Minh Khôi');

  const ta = async (classId: string) => {
    const rows = await t.db.select().from(schema.teachingAssignments).where(eq(schema.teachingAssignments.classId, classId));
    return rows[0]!.id;
  };
  // Mẹ Bống liên kết qua phiếu mời
  const [inv] = (await api(t, lan.token).post(`/classes/${s.classes['1A']!.id}/guardian-invites`, { studentIds: [bong.id] })).json();
  const momPhone = randomPhone();
  const mom = { ...(await loginByPhone(t, momPhone)), phone: momPhone };
  await api(t, mom.accessToken).post('/me/children/claim', { code: inv.code, relationship: 'me', acceptPolicyVersion: CURRENT_POLICY_VERSION });
  const studentToken = async (studentId: string, guardianToken = mom.accessToken) =>
    (await api(t, guardianToken).post(`/me/children/${studentId}/session`)).json().accessToken as string;
  // Học sinh không có phụ huynh liên kết: đăng nhập bằng thẻ QR
  const cardToken = async (classId: string, studentId: string) => {
    const [card] = (await s.A.post(`/classes/${classId}/login-cards`, { studentIds: [studentId] })).json();
    return (await api(t).post('/auth/student/card', { code: card.code })).json().accessToken as string;
  };
  return {
    ...s,
    lan,
    nam,
    mom,
    bong,
    an,
    binh,
    khoi,
    taTV1A: await ta(s.classes['1A']!.id),
    taTV1B: await ta(s.classes['1B']!.id),
    taToan7A: await ta(s.classes['7A']!.id),
    studentToken,
    cardToken,
  };
}
