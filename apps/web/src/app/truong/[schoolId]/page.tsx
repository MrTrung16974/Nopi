'use client';
import { academicYearSchema, auditLogSchema, spaceSettingsDtoSchema, type SpaceSettingsDto, classSchema, importResultSchema, mySchoolSchema, submissionStatsSchema, teacherSchema, teachingGridSchema, type ImportResult } from '@nopi/contracts';
import { GRADES } from '@nopi/domain';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { defaultRange, ReportExport } from '@/components/ReportExport';
import { Shell } from '@/components/Shell';
import { call, download, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

type Tab = 'lop' | 'giao-vien' | 'phan-cong' | 'nhap' | 'bao-cao' | 'nhat-ky' | 'cai-dat';

function useMsg() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
      return false;
    }
  };
  const view = msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>;
  return { run, view };
}

// ---------------- Năm học & lớp ----------------
function ClassesTab({ schoolId, yearId, setYearId, isAdmin, teachers }: { schoolId: string; yearId: string | null; setYearId: (id: string) => void; isAdmin: boolean; teachers: z.infer<typeof teacherSchema>[] }) {
  const years = useApi(() => call(`/schools/${schoolId}/academic-years`, { schema: z.array(academicYearSchema) }), [schoolId]);
  const classes = useApi(
    () => (yearId ? call(`/schools/${schoolId}/classes?academicYearId=${yearId}`, { schema: z.array(classSchema) }) : Promise.resolve([])),
    [schoolId, yearId],
  );
  const y = useMsg();
  const c = useMsg();
  const nextYear = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [year, setYear] = useState({ name: `${nextYear}-${nextYear + 1}`, startsOn: `${nextYear}-09-05`, endsOn: `${nextYear + 1}-05-31` });
  const [cls, setCls] = useState({ grade: 1, name: '', homeroomTeacherId: '' });

  useEffect(() => {
    if (!yearId && years.data?.[0]) setYearId(years.data[0].id);
  }, [years.data, yearId, setYearId]);

  return (
    <div className="stack">
      <div className="row">
        <label>
          Năm học
          <select value={yearId ?? ''} onChange={(e) => setYearId(e.target.value)}>
            {years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
      </div>
      {years.data?.length === 0 && <p className="muted">Chưa có năm học nào. Tạo năm học trước rồi thêm lớp.</p>}

      {isAdmin && (
        <details className="card" open={years.data?.length === 0}>
          <summary><strong>Tạo năm học</strong></summary>
          <div className="row" style={{ marginTop: 12 }}>
            <label>Tên<input value={year.name} onChange={(e) => setYear({ ...year, name: e.target.value })} /></label>
            <label>Bắt đầu<input type="date" value={year.startsOn} onChange={(e) => setYear({ ...year, startsOn: e.target.value })} /></label>
            <label>Kết thúc<input type="date" value={year.endsOn} onChange={(e) => setYear({ ...year, endsOn: e.target.value })} /></label>
            <button className="primary" onClick={() => y.run(async () => { const r = await call(`/schools/${schoolId}/academic-years`, { method: 'POST', body: year, schema: academicYearSchema }); await years.reload(); setYearId(r.id); }, 'Đã tạo năm học')}>Tạo</button>
          </div>
        </details>
      )}
      {y.view}

      {yearId && (
        <>
          <h2>Lớp</h2>
          <table>
            <thead><tr><th>Lớp</th><th>Khối</th><th>Sĩ số</th><th>Chủ nhiệm</th><th>Mã lớp</th></tr></thead>
            <tbody>
              {classes.data?.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/lop/${x.id}`}>{x.name}</Link></td>
                  <td>{x.grade}</td>
                  <td>{x.studentCount}</td>
                  <td>{teachers.find((t) => t.id === x.homeroomTeacherId)?.fullName ?? '—'}</td>
                  <td><code>{x.joinCode}</code></td>
                </tr>
              ))}
              {classes.data?.length === 0 && <tr><td colSpan={5} className="muted">Chưa có lớp.</td></tr>}
            </tbody>
          </table>
          {isAdmin && (
            <div className="card">
              <strong>Thêm lớp</strong>
              <div className="row" style={{ marginTop: 12 }}>
                <label>Khối<select value={cls.grade} onChange={(e) => setCls({ ...cls, grade: Number(e.target.value) })}>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
                <label>Tên lớp<input value={cls.name} onChange={(e) => setCls({ ...cls, name: e.target.value })} placeholder={`${cls.grade}A`} style={{ width: 100 }} /></label>
                <label>Chủ nhiệm<select value={cls.homeroomTeacherId} onChange={(e) => setCls({ ...cls, homeroomTeacherId: e.target.value })}><option value="">— Chưa chọn —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></label>
                <button className="primary" disabled={!cls.name.trim()} onClick={() => c.run(async () => { await call(`/schools/${schoolId}/classes`, { method: 'POST', body: { academicYearId: yearId, grade: cls.grade, name: cls.name, homeroomTeacherId: cls.homeroomTeacherId || undefined } }); setCls({ ...cls, name: '' }); await classes.reload(); }, 'Đã thêm lớp')}>Thêm</button>
              </div>
              {c.view}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Giáo viên ----------------
function TeachersTab({ schoolId, isAdmin, teachers, reload }: { schoolId: string; isAdmin: boolean; teachers: z.infer<typeof teacherSchema>[]; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ fullName: '', phone: '' });
  const m = useMsg();
  return (
    <div className="stack">
      <table>
        <thead><tr><th>Họ tên</th><th>Số điện thoại</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {teachers.map((t) => (
            <tr key={t.id}>
              <td>{t.fullName}</td>
              <td>{t.phone ? `0${t.phone.slice(3)}` : '—'}</td>
              <td>{t.status === 'invited' ? <span className="badge">Chưa kích hoạt</span> : t.status === 'active' ? 'Đang dùng' : 'Đã khoá'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Giáo viên «chưa kích hoạt» chỉ cần mở app Nopi, nhập số điện thoại và mã OTP là vào được — lớp và môn đã có sẵn.</p>
      {isAdmin && (
        <div className="card">
          <strong>Thêm giáo viên</strong>
          <div className="row" style={{ marginTop: 12 }}>
            <label>Họ tên<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
            <label>Số điện thoại<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></label>
            <button className="primary" onClick={() => m.run(async () => { await call(`/schools/${schoolId}/teachers`, { method: 'POST', body: form }); setForm({ fullName: '', phone: '' }); await reload(); }, 'Đã thêm giáo viên')}>Thêm</button>
          </div>
          {m.view}
        </div>
      )}
    </div>
  );
}

// ---------------- Phân công ----------------
/** Giáo viên chủ nhiệm tiểu học thường dạy hầu hết các môn: giao một lần mọi môn còn trống. */
function ClaimAll({ teachers, onClaim }: { teachers: z.infer<typeof teacherSchema>[]; onClaim: (teacherId: string) => void }) {
  const [id, setId] = useState('');
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <label>
        Giao mọi môn còn trống cho
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">— Chọn giáo viên —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
        </select>
      </label>
      <button disabled={!id} onClick={() => onClaim(id)}>Giao</button>
    </div>
  );
}

function TeachingTab({ schoolId, yearId, teachers }: { schoolId: string; yearId: string | null; teachers: z.infer<typeof teacherSchema>[] }) {
  const grid = useApi(
    () => (yearId ? call(`/schools/${schoolId}/academic-years/${yearId}/teaching-grid`, { schema: teachingGridSchema }) : Promise.resolve([])),
    [schoolId, yearId],
  );
  const m = useMsg();
  if (!yearId) return <p className="muted">Chọn năm học ở tab «Năm học & lớp» trước.</p>;

  const assign = (classId: string, subjectId: number, teacherId: string) =>
    m.run(async () => {
      await call(`/classes/${classId}/teaching/${subjectId}`, teacherId ? { method: 'PUT', body: { teacherId } } : { method: 'DELETE' });
      await grid.reload();
    });

  return (
    <div className="stack">
      <p className="muted">Mỗi ô lớp–môn chọn một giáo viên. Đổi giáo viên giữa năm thì bài đã giao vẫn giữ nguyên lịch sử.</p>
      {m.view}
      {grid.data?.map((row) => (
        <div key={row.classId} className="card">
          <strong>Lớp {row.className}</strong>
          <ClaimAll teachers={teachers} onClaim={(teacherId) => m.run(async () => { await call(`/classes/${row.classId}/teaching/claim-all`, { method: 'POST', body: { teacherId } }); await grid.reload(); }, `Đã giao các môn còn trống của lớp ${row.className}`)} />
          <div className="scroll-x">
            <table style={{ marginTop: 8 }}>
              <tbody>
                {row.slots.map((s) => (
                  <tr key={s.subjectId}>
                    <td style={{ width: 200 }}>{s.subjectName}{s.isOptional && <span className="muted"> · tự chọn</span>}</td>
                    <td>
                      <select aria-label={`Giáo viên ${s.subjectName} lớp ${row.className}`} value={s.teacher?.id ?? ''} onChange={(e) => assign(row.classId, s.subjectId, e.target.value)}>
                        <option value="">— Chưa phân công —</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Nhập Excel ----------------
function ImportBox({ title, template, filename, url, onDone }: { title: string; template: string; filename: string; url: string | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (dryRun: boolean) => {
    if (!file || !url) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await call(`${url}${url.includes('?') ? '&' : '?'}dryRun=${dryRun}`, { method: 'POST', form, schema: importResultSchema });
      setResult(r);
      if (!dryRun && r.errors.length === 0) onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <strong>{title}</strong>
      <div className="row">
        <button onClick={() => download(template, filename).catch((e) => setError(errorText(e)))}>Tải file mẫu</button>
        <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} aria-label={`Chọn file ${title}`} />
        <button disabled={!file || busy || !url} onClick={() => send(true)}>Kiểm tra file</button>
        <button className="primary" disabled={!file || busy || !url || !result || result.errors.length > 0 || !result.dryRun} onClick={() => send(false)}>Nhập {result?.valid ?? ''} dòng</button>
      </div>
      {!url && <p className="muted">Chọn năm học trước.</p>}
      {error && <p className="error">{error}</p>}
      {result && result.errors.length === 0 && (
        <p className="ok">{result.dryRun ? `File hợp lệ: ${result.valid} dòng. Bấm «Nhập» để lưu.` : `Đã nhập xong (${result.created} mới).`}</p>
      )}
      {result && result.errors.length > 0 && (
        <>
          <p className="error">Có {result.errors.length} lỗi — sửa trong file rồi tải lên lại. Chưa có dữ liệu nào được lưu.</p>
          <table>
            <thead><tr><th>Dòng</th><th>Cột</th><th>Lỗi</th></tr></thead>
            <tbody>{result.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.column ?? ''}</td><td>{e.message}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---------------- Báo cáo tỉ lệ nộp ----------------
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
function StatsTab({ schoolId, yearId }: { schoolId: string; yearId: string | null }) {
  const [range, setRange] = useState(defaultRange);
  const stats = useApi(
    () => (yearId ? call(`/schools/${schoolId}/submission-stats?academicYearId=${yearId}&from=${range.from}&to=${range.to}`, { schema: submissionStatsSchema }) : Promise.resolve(null)),
    [schoolId, yearId, range.from, range.to],
  );
  if (!yearId) return <p className="muted">Chọn năm học ở tab «Năm học & lớp» trước.</p>;
  const rows = stats.data?.rows ?? [];
  const total = rows.reduce((a, r) => ({ expected: a.expected + r.expected, submitted: a.submitted + r.submitted, late: a.late + r.late }), { expected: 0, submitted: 0, late: 0 });
  return (
    <div className="stack">
      <div className="row">
        <label>Từ ngày<input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label>Đến ngày<input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>
      <p className="muted">Chỉ tính bài đã qua hạn nộp. Toàn trường: <strong>{pct(total.expected ? total.submitted / total.expected : null)}</strong> ({total.submitted}/{total.expected} lượt, {total.late} nộp muộn).</p>
      {stats.error && <p className="error">{stats.error}</p>}
      <div className="scroll-x">
        <table>
          <thead><tr><th>Lớp</th><th>Môn</th><th>Giáo viên</th><th>Số bài</th><th>Đã nộp / đến hạn</th><th>Nộp muộn</th><th>Tỉ lệ nộp</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.classId}:${r.subjectId}`}>
                <td>{r.className}</td>
                <td>{r.subjectName}</td>
                <td>{r.teacherName ?? <span className="muted">Chưa phân công</span>}</td>
                <td>{r.assignments}</td>
                <td>{r.submitted}/{r.expected}</td>
                <td>{r.late || ''}</td>
                <td>
                  <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <span aria-hidden style={{ display: 'inline-block', width: 80, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(r.rate ?? 0) * 100}%`, background: r.rate !== null && r.rate < 0.7 ? 'var(--warning, #B45309)' : 'var(--primary, #EA580C)' }} />
                    </span>
                    {pct(r.rate)}
                  </span>
                </td>
              </tr>
            ))}
            {stats.data && rows.length === 0 && <tr><td colSpan={7} className="muted">Chưa có lớp–môn nào được phân công.</td></tr>}
          </tbody>
        </table>
      </div>
      <ReportExport label="Tải báo cáo tỉ lệ nộp toàn trường" target={{ type: 'school', schoolId, academicYearId: yearId }} range={range} />
    </div>
  );
}

// ---------------- Nhật ký truy cập ----------------
const ACTION_LABEL: Record<string, string> = {
  'report.export': 'Xuất báo cáo',
  'audit.view': 'Xem nhật ký',
  'evaluation.update': 'Sửa đánh giá',
  'assignment.create': 'Giao bài',
  'teaching.assign': 'Phân công giảng dạy',
  'student.create': 'Thêm học sinh',
  'student.card.issue': 'Cấp thẻ đăng nhập',
  'student.pin.set': 'Đặt PIN học sinh',
  'student.session.start': 'Phụ huynh mở phiên cho con',
  'student.session.revoke': 'Thu hồi phiên của con',
  'guardian.invite.issue': 'In phiếu mời phụ huynh',
  'guardian.link': 'Phụ huynh liên kết',
  'guardian.consent': 'Phụ huynh đồng ý điều khoản',
  'import.students': 'Nhập học sinh từ Excel',
  'import.teachers': 'Nhập giáo viên từ Excel',
  'billing.contract': 'Hợp đồng',
  'billing.paid': 'Thanh toán',
  'school.create': 'Tạo trường',
  'school.settings.update': 'Sửa cài đặt trường',
  'submission.view': 'Xem bài nộp',
  'auth.refresh.reuse': 'Chặn phiên nghi bị lộ',
  'auth.login.otp': 'Đăng nhập',
  'guardian.link.creator': 'Phụ huynh tạo hồ sơ con',
  'family.create': 'Tạo không gian gia đình',
  'family.child.add': 'Thêm con vào gia đình',
};
const ACTION_FILTERS: [string, string][] = [['', 'Tất cả'], ['submission.', 'Xem bài nộp'], ['report.', 'Xuất báo cáo'], ['evaluation.', 'Đánh giá'], ['student.', 'Học sinh'], ['guardian.', 'Phụ huynh'], ['import.', 'Nhập Excel'], ['audit.', 'Xem nhật ký']];

function AuditTab({ schoolId }: { schoolId: string }) {
  const [action, setAction] = useState('');
  const [items, setItems] = useState<z.infer<typeof auditLogSchema>['items']>([]);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (before?: number) => {
    setBusy(true);
    try {
      const q = new URLSearchParams({ limit: '50', ...(action ? { action } : {}), ...(before ? { before: String(before) } : {}) });
      const r = await call(`/schools/${schoolId}/audit-logs?${q}`, { schema: auditLogSchema });
      setItems((prev) => (before ? [...prev, ...r.items] : r.items));
      setNext(r.nextBefore);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [schoolId, action]);
  return (
    <div className="stack">
      <p className="muted">Ai đã làm gì với dữ liệu học sinh. Nhật ký chỉ được ghi thêm, không ai sửa hay xoá được — kể cả quản trị.</p>
      <div className="row">
        <label>Loại việc<select value={action} onChange={(e) => setAction(e.target.value)}>{ACTION_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="scroll-x">
        <table>
          <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Việc</th><th>Học sinh</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(i.at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{i.actorName}{i.actorType === 'student' && <span className="muted"> (học sinh)</span>}</td>
                <td>{ACTION_LABEL[i.action] ?? i.action}</td>
                <td>{i.studentName ?? <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!busy && items.length === 0 && <tr><td colSpan={4} className="muted">Chưa có mục nào.</td></tr>}
          </tbody>
        </table>
      </div>
      {next && <div><button disabled={busy} onClick={() => load(next)}>Xem cũ hơn</button></div>}
    </div>
  );
}

// ---------------- Cài đặt trường ----------------
function SettingsTab({ schoolId }: { schoolId: string }) {
  const q = useApi(() => call(`/schools/${schoolId}/settings`, { schema: spaceSettingsDtoSchema }), [schoolId]);
  const [form, setForm] = useState<SpaceSettingsDto | null>(null);
  const m = useMsg();
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  if (!form) return q.error ? <p className="error">{q.error}</p> : null;
  const days = (k: keyof SpaceSettingsDto['retentionDays'], label: string) => (
    <label>{label}<input type="number" min={30} max={3650} value={form.retentionDays[k]} onChange={(e) => setForm({ ...form, retentionDays: { ...form.retentionDays, [k]: Number(e.target.value) } })} style={{ width: 110 }} /></label>
  );
  return (
    <div className="stack">
      <div className="card stack">
        <strong>Thông báo</strong>
        <div className="row">
          <label>Giờ yên lặng từ<input type="time" value={form.quietHours.start} onChange={(e) => setForm({ ...form, quietHours: { ...form.quietHours, start: e.target.value } })} /></label>
          <label>đến<input type="time" value={form.quietHours.end} onChange={(e) => setForm({ ...form, quietHours: { ...form.quietHours, end: e.target.value } })} /></label>
          <label>Gửi bản tổng hợp cho giáo viên lúc<input type="time" step={3600} value={form.teacherDigestTime} onChange={(e) => setForm({ ...form, teacherDigestTime: `${e.target.value.slice(0, 2)}:00` })} /></label>
        </div>
        <p className="muted" style={{ margin: 0 }}>Trong giờ yên lặng, thông báo cho học sinh và phụ huynh được dời tới sáng hôm sau. Bản tổng hợp gửi theo giờ tròn.</p>
      </div>
      <div className="card stack">
        <strong>Bài nộp &amp; quét đề</strong>
        <div className="row">
          <label>Video dài tối đa (giây)<input type="number" min={30} max={1800} value={form.maxVideoSeconds} onChange={(e) => setForm({ ...form, maxVideoSeconds: Number(e.target.value) })} style={{ width: 110 }} /></label>
          <label>Mặc định khi giao bài (giây)<input type="number" min={10} max={1800} value={form.defaultVideoSeconds} onChange={(e) => setForm({ ...form, defaultVideoSeconds: Number(e.target.value) })} style={{ width: 110 }} /></label>
          <label>Lượt quét đề / ngày<input type="number" min={0} max={500} value={form.scanQuotaPerDay} onChange={(e) => setForm({ ...form, scanQuotaPerDay: Number(e.target.value) })} style={{ width: 110 }} /></label>
        </div>
      </div>
      <div className="card stack">
        <strong>Thời hạn lưu bài nộp (ngày)</strong>
        <div className="row">{days('video', 'Video')}{days('photo', 'Ảnh')}{days('audio', 'Ghi âm')}{days('document', 'Tài liệu')}</div>
        <p className="muted" style={{ margin: 0 }}>Áp dụng cho file tải lên từ nay. Phụ huynh được báo trước 7 ngày khi ảnh/video của con sắp bị xoá.</p>
      </div>
      <div><button className="primary" onClick={() => m.run(async () => { q.setData(await call(`/schools/${schoolId}/settings`, { method: 'PATCH', body: form, schema: spaceSettingsDtoSchema })); }, 'Đã lưu cài đặt')}>Lưu cài đặt</button></div>
      {m.view}
    </div>
  );
}

// ---------------- Trang ----------------
function SchoolPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const [tab, setTab] = useState<Tab>('lop');
  const [yearId, setYearId] = useState<string | null>(null);
  const me = useApi(() => call('/me/schools', { schema: z.array(mySchoolSchema) }), []);
  const teachers = useApi(() => call(`/schools/${schoolId}/teachers`, { schema: z.array(teacherSchema) }), [schoolId]);
  const school = me.data?.find((s) => s.id === schoolId);
  const isAdmin = Boolean(school?.roles.includes('admin'));

  const tabs: [Tab, string, boolean][] = [
    ['lop', 'Năm học & lớp', true],
    ['giao-vien', 'Giáo viên', true],
    ['phan-cong', 'Phân công giảng dạy', isAdmin],
    ['nhap', 'Nhập từ Excel', isAdmin],
    ['bao-cao', 'Báo cáo tỉ lệ nộp', isAdmin],
    ['nhat-ky', 'Nhật ký truy cập', isAdmin],
    ['cai-dat', 'Cài đặt', isAdmin],
  ];

  return (
    <>
      <h1>{school?.name ?? ' '}</h1>
      <div className="tabs" role="tablist">
        {tabs.filter(([, , show]) => show).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {teachers.error && <p className="error">{teachers.error}</p>}
      {tab === 'lop' && <ClassesTab schoolId={schoolId} yearId={yearId} setYearId={setYearId} isAdmin={isAdmin} teachers={teachers.data ?? []} />}
      {tab === 'giao-vien' && <TeachersTab schoolId={schoolId} isAdmin={isAdmin} teachers={teachers.data ?? []} reload={teachers.reload} />}
      {tab === 'phan-cong' && <TeachingTab schoolId={schoolId} yearId={yearId} teachers={teachers.data ?? []} />}
      {tab === 'bao-cao' && <StatsTab schoolId={schoolId} yearId={yearId} />}
      {tab === 'nhat-ky' && <AuditTab schoolId={schoolId} />}
      {tab === 'cai-dat' && <SettingsTab schoolId={schoolId} />}
      {tab === 'nhap' && (
        <div className="stack">
          <ImportBox title="Danh sách giáo viên" template="/imports/templates/teachers.xlsx" filename="mau-giao-vien.xlsx" url={`/schools/${schoolId}/imports/teachers`} onDone={() => void teachers.reload()} />
          <ImportBox title="Danh sách học sinh (theo năm học đang chọn)" template="/imports/templates/students.xlsx" filename="mau-hoc-sinh.xlsx" url={yearId ? `/schools/${schoolId}/imports/students?academicYearId=${yearId}` : null} onDone={() => undefined} />
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <SchoolPage />
    </Shell>
  );
}
