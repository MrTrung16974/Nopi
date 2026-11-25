/**
 * Kiểm thử tải các đường "giờ cao điểm" (19:00–21:00: học sinh mở bài, nộp bài; giáo viên xem lưới chấm).
 *
 *   pnpm --filter @nopi/api loadtest                     # API ở http://localhost:3000
 *   API_URL=http://localhost:3100 DURATION=20 CONNECTIONS=50 pnpm --filter @nopi/api loadtest
 *
 * Tự dựng dữ liệu riêng (trường "Loadtest …", 1 lớp N học sinh, 3 bài) qua chính API; token ký bằng JWT_SECRET
 * (chỉ chạy với môi trường dev/staging — KHÔNG chạy trên production). Thoát mã 1 nếu vượt ngưỡng.
 */
import autocannon from 'autocannon';
import { SignJWT } from 'jose';
import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const DURATION = Number(process.env.DURATION ?? 15);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 50);
const STUDENTS = Number(process.env.STUDENTS ?? 40);
const P99_MS = Number(process.env.P99_MS ?? 500); // ngưỡng p99 cho đường đọc
const DB_URL = process.env.DATABASE_URL ?? 'postgres://nopi:nopi@localhost:5432/nopi';
const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me-dev-secret-change-me';
if (process.env.NODE_ENV === 'production') throw new Error('Không chạy kiểm thử tải trên production');

const key = new TextEncoder().encode(SECRET);
const sign = (sub, knd, extra = {}) =>
  new SignJWT({ knd, sid: randomUUID(), ...extra }).setProtectedHeader({ alg: 'HS256' }).setIssuer('nopi').setSubject(sub).setIssuedAt().setExpirationTime('2h').sign(key);

async function call(token, method, path, body) {
  const res = await fetch(`${API}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const phone = () => `09${randomInt(10_000_000, 99_999_999)}`;

// ---------- Dựng dữ liệu ----------
const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
const [sa] = await sql`insert into users (id, full_name, status, is_system_admin) values (${randomUUID()}, 'Loadtest SA', 'active', true) returning id`;
const saToken = await sign(sa.id, 'u', { sa: true });
const adminPhone = phone();
const school = await call(saToken, 'POST', '/admin/schools', { name: `Loadtest ${new Date().toISOString()}`, admin: { fullName: 'Hiệu Trưởng Thử', phone: adminPhone } });
const [admin] = await sql`select id from users where phone = ${`+84${adminPhone.slice(1)}`}`;
const adminToken = await sign(admin.id, 'u');
const year = await call(adminToken, 'POST', `/schools/${school.id}/academic-years`, { name: '2026-2027', startsOn: '2026-09-05', endsOn: '2027-05-31' });
const cls = await call(adminToken, 'POST', `/schools/${school.id}/classes`, { academicYearId: year.id, grade: 4, name: '4A' });
const teacher = await call(adminToken, 'POST', `/schools/${school.id}/teachers`, { fullName: 'Cô Thử Tải', phone: phone() });
const [tv] = await sql`select id from subjects where code = 'TIENG_VIET'`;
await call(adminToken, 'PUT', `/classes/${cls.id}/teaching/${tv.id}`, { teacherId: teacher.id });
const students = [];
for (let i = 0; i < STUDENTS; i++) students.push(await call(adminToken, 'POST', `/classes/${cls.id}/students`, { fullName: `Học Sinh Thử ${i + 1}` }));
const teacherToken = await sign(teacher.id, 'u');
const overview = await call(teacherToken, 'GET', '/teacher/overview');
const taId = overview.teaching[0].teachingAssignmentId;
const assignments = [];
for (const title of ['Bài 1 trang 20', 'Bài 2 trang 21', 'Đọc thuộc lòng']) {
  assignments.push(...(await call(teacherToken, 'POST', '/assignments', { teachingAssignmentIds: [taId], title, submissionKinds: ['photo'] })));
}
const grid = await call(teacherToken, 'GET', `/assignments/${assignments[0].id}/submissions`);
const studentTokens = await Promise.all(students.map((s) => sign(s.id, 's')));
const saOf = new Map(grid.map((r) => [r.student.id, r.studentAssignmentId]));
await sql.end();
console.log(`Đã dựng: trường ${school.id}, lớp 4A ${STUDENTS} em, 3 bài. Chạy ${DURATION}s × ${CONNECTIONS} kết nối mỗi kịch bản.\n`);

// ---------- Kịch bản ----------
/** Mỗi request lấy token của một em khác (xoay vòng) để không trúng cache theo người. */
const rotating = (build) => {
  let i = 0;
  return (req) => {
    const k = i++ % students.length;
    const extra = build(k);
    return { ...req, ...extra, headers: { ...req.headers, ...extra.headers, authorization: `Bearer ${studentTokens[k]}` } };
  };
};
const scenarios = [
  { name: 'Học sinh mở trang chủ (GET /student/assignments)', kind: 'read', opts: { url: `${API}/v1/student/assignments`, requests: [{ method: 'GET', setupRequest: rotating(() => ({})) }] } },
  { name: 'Học sinh mở bài (GET /student-assignments/:id)', kind: 'read', opts: { url: API, requests: [{ method: 'GET', setupRequest: rotating((k) => ({ path: `/v1/student-assignments/${saOf.get(students[k].id)}` })) }] } },
  { name: 'Giáo viên xem lưới chấm (GET /assignments/:id/submissions)', kind: 'read', opts: { url: `${API}/v1/assignments/${assignments[0].id}/submissions`, headers: { authorization: `Bearer ${teacherToken}` } } },
  {
    name: 'Học sinh xin URL tải ảnh (POST …/uploads)',
    kind: 'write',
    opts: {
      url: API,
      requests: [
        {
          method: 'POST',
          setupRequest: rotating((k) => ({
            path: `/v1/student-assignments/${saOf.get(students[k].id)}/uploads`,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'photo', mimeType: 'image/jpeg', sizeBytes: 800_000 }),
          })),
        },
      ],
    },
  },
];

const results = [];
for (const s of scenarios) {
  let sample = null; // phản hồi lỗi đầu tiên — để biết vì sao lỗi
  const inst = autocannon({ connections: CONNECTIONS, duration: DURATION, ...s.opts });
  inst.on('response', (_client, status, _bytes, _ms) => {
    if (status >= 400 && !sample) sample = status;
  });
  inst.on('reqError', (err) => (sample ??= err.message));
  const r = await inst;
  const bad = r.non2xx + r.errors + r.timeouts;
  const limit = s.kind === 'read' ? P99_MS : P99_MS * 2;
  const ok = bad === 0 && r.latency.p99 <= limit;
  results.push({ 'Kịch bản': s.name, 'req/s': Math.round(r.requests.average), 'p50 ms': r.latency.p50, 'p99 ms': r.latency.p99, 'Lỗi': bad, 'Ngưỡng p99': limit, 'Đạt': ok ? '✅' : '❌' });
  console.log(`${ok ? '✅' : '❌'} ${s.name}: ${Math.round(r.requests.average)} req/s, p50 ${r.latency.p50} ms, p99 ${r.latency.p99} ms, lỗi ${bad}${sample ? ` (vd. ${sample})` : ''}`);
}
console.table(results);
process.exit(results.every((r) => r['Đạt'] === '✅') ? 0 : 1);
