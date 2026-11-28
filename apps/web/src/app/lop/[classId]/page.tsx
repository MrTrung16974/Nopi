'use client';
import { classStudentSchema, classTeachingSchema, printableCodeSchema } from '@nopi/contracts';
import { canUsePinLogin, checkPin, PIN_PROBLEM_MESSAGES, type Grade } from '@nopi/domain';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { QrImage } from '@/components/QrImage';
import { ReportExport } from '@/components/ReportExport';
import { Shell } from '@/components/Shell';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

type Printable = z.infer<typeof printableCodeSchema>;

/** Trang in: thẻ đăng nhập (học sinh) hoặc phiếu mời (phụ huynh), 2 thẻ/hàng, cắt theo đường nét đứt. */
function PrintSheet({ kind, items, onClose }: { kind: 'card' | 'invite'; items: Printable[]; onClose: () => void }) {
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 16 }}>
        <button className="primary" onClick={() => window.print()}>In</button>
        <button onClick={onClose}>Đóng</button>
        <span className="muted">
          {kind === 'card'
            ? 'Thẻ cũ của các em này đã hết hiệu lực. Thẻ mới dùng được 1 năm.'
            : 'Phiếu cũ đã hết hiệu lực. Phiếu mới dùng được 60 ngày; bố và mẹ có thể cùng quét một phiếu.'}
        </span>
      </div>
      <div className="print-sheet">
        {items.map((i) => (
          <div key={i.studentId} className="print-card">
            <QrImage value={i.qrPayload} size={120} alt={`Mã QR của ${i.fullName}`} />
            <div className="stack" style={{ gap: 4 }}>
              <strong>{i.fullName}</strong>
              <span className="muted">Lớp {i.className}</span>
              {kind === 'invite' ? (
                <span style={{ fontSize: 13 }}>
                  Bố mẹ tải app <strong>Nopi</strong>, chọn «Thêm con» rồi quét mã này, hoặc nhập mã:
                </span>
              ) : (
                <span style={{ fontSize: 13 }}>Thẻ đăng nhập — giữ cẩn thận, không cho bạn mượn</span>
              )}
              <span className="print-code">{i.code}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const students = useApi(() => call(`/classes/${classId}/students`, { schema: z.array(classStudentSchema) }), [classId]);
  const teaching = useApi(() => call(`/classes/${classId}/teaching`, { schema: classTeachingSchema }), [classId]);
  const [print, setPrint] = useState<{ kind: 'card' | 'invite'; items: Printable[] } | null>(null);
  const [form, setForm] = useState({ fullName: '', nickname: '', birthDate: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const grade = teaching.data?.grade as Grade | undefined;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  /** Cấp thẻ/phiếu mới làm thẻ/phiếu CŨ hết hiệu lực ngay → luôn hỏi lại trước. */
  const issue = (kind: 'card' | 'invite', studentIds?: string[], name?: string) => {
    const who = name ?? `cả lớp (${students.data?.length ?? 0} em)`;
    const warn =
      kind === 'card'
        ? `In thẻ đăng nhập mới cho ${who}?\n\nThẻ cũ sẽ hết hiệu lực ngay: ${name ? 'em' : 'các em'} đang đăng nhập bằng thẻ cũ phải quét thẻ mới.`
        : `In phiếu mời phụ huynh mới cho ${who}?\n\nPhiếu cũ chưa dùng sẽ hết hiệu lực. Phụ huynh đã liên kết rồi thì không bị ảnh hưởng.`;
    if (!window.confirm(warn)) return;
    return run(async () => {
      const items = await call(`/classes/${classId}/${kind === 'card' ? 'login-cards' : 'guardian-invites'}`, {
        method: 'POST',
        body: { studentIds },
        schema: z.array(printableCodeSchema),
      });
      setPrint({ kind, items });
    });
  };

  // Đặt PIN bằng form (ẩn số, nhập 2 lần) thay cho window.prompt
  const [pinFor, setPinFor] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPinValue] = useState({ a: '', b: '' });
  const pinProblem = !/^\d{6}$/.test(pin.a) ? 'Mã PIN gồm 6 chữ số' : (() => { const p = checkPin(pin.a); return p ? PIN_PROBLEM_MESSAGES[p] : null; })();
  const savePin = () => {
    if (!pinFor || pinProblem || pin.a !== pin.b) return;
    const { id, name } = pinFor;
    void run(async () => {
      await call(`/students/${id}/pin`, { method: 'PUT', body: { pin: pin.a } });
      setPinFor(null);
      setPinValue({ a: '', b: '' });
      await students.reload();
    }, `Đã đặt PIN cho ${name}`);
  };

  if (print) return <PrintSheet {...print} onClose={() => setPrint(null)} />;

  return (
    <>
      <h1>{teaching.data ? `Lớp ${teaching.data.className}` : ' '}</h1>
      <div className="row no-print" style={{ margin: '12px 0' }}>
        <button className="primary" onClick={() => issue('invite')} disabled={!students.data?.length}>In phiếu mời phụ huynh</button>
        <button onClick={() => issue('card')} disabled={!students.data?.length}>In thẻ đăng nhập cho cả lớp</button>
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
      {pinFor && (
        <form className="card no-print" style={{ margin: '12px 0' }} onSubmit={(e) => { e.preventDefault(); savePin(); }}>
          <strong>Đặt mã PIN cho {pinFor.name}</strong>
          <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <label>PIN mới (6 số)<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} autoFocus value={pin.a} onChange={(e) => setPinValue({ ...pin, a: e.target.value.replace(/\D/g, '') })} /></label>
            <label>Nhập lại<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin.b} onChange={(e) => setPinValue({ ...pin, b: e.target.value.replace(/\D/g, '') })} /></label>
            <button type="submit" className="primary" disabled={Boolean(pinProblem) || pin.a !== pin.b}>Lưu PIN</button>
            <button type="button" onClick={() => setPinFor(null)}>Huỷ</button>
          </div>
          {pin.a.length === 6 && pinProblem && <p className="error" style={{ margin: '8px 0 0' }}>{pinProblem}</p>}
          {pin.b.length === 6 && !pinProblem && pin.a !== pin.b && <p className="error" style={{ margin: '8px 0 0' }}>Hai lần nhập chưa khớp</p>}
        </form>
      )}
      {students.error && <p className="error">{students.error}</p>}

      <h2>Học sinh ({students.data?.length ?? 0})</h2>
      <div className="scroll-x">
        <table>
          <thead><tr><th>Họ tên</th><th>Mã HS</th><th>Ngày sinh</th><th>Phụ huynh</th><th></th></tr></thead>
          <tbody>
            {students.data?.map((s) => (
              <tr key={s.id}>
                <td>{s.fullName}{s.nickname && <span className="muted"> ({s.nickname})</span>}</td>
                <td><code>{s.studentCode}</code></td>
                <td>{s.birthDate ? s.birthDate.split('-').reverse().join('/') : '—'}</td>
                <td>{s.guardianCount > 0 ? `${s.guardianCount} đã liên kết` : <span className="badge">Chưa có</span>}</td>
                <td className="row" style={{ gap: 6 }}>
                  <button onClick={() => issue('card', [s.id], s.fullName)}>Cấp lại thẻ</button>
                  {grade && canUsePinLogin(grade) && <button onClick={() => { setPinFor({ id: s.id, name: s.fullName }); setPinValue({ a: '', b: '' }); }}>{s.hasPin ? 'Đổi PIN' : 'Đặt PIN'}</button>}
                </td>
              </tr>
            ))}
            {students.data?.length === 0 && <tr><td colSpan={5} className="muted">Chưa có học sinh. Thêm tay bên dưới hoặc nhập từ Excel ở trang trường.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Thêm học sinh</strong>
        <div className="row" style={{ marginTop: 12 }}>
          <label>Họ và tên<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label>Tên gọi ở nhà<input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} style={{ width: 120 }} /></label>
          <label>Ngày sinh<input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></label>
          <button
            className="primary"
            disabled={form.fullName.trim().length < 2}
            onClick={() =>
              run(async () => {
                await call(`/classes/${classId}/students`, { method: 'POST', body: { fullName: form.fullName, nickname: form.nickname || undefined, birthDate: form.birthDate || undefined } });
                setForm({ fullName: '', nickname: '', birthDate: '' });
                await students.reload();
              }, 'Đã thêm học sinh')
            }
          >
            Thêm
          </button>
        </div>
      </div>

      <h2>Môn & giáo viên</h2>
      <table>
        <tbody>
          {teaching.data?.slots.map((s) => (
            <tr key={s.subjectId}><td style={{ width: 200 }}>{s.subjectName}</td><td>{s.teacher?.fullName ?? <span className="muted">Chưa phân công</span>}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Báo cáo</h2>
      <ReportExport label={`Báo cáo lớp ${teaching.data?.className ?? ''} — mỗi môn một trang (thầy cô bộ môn chỉ thấy môn mình dạy)`} target={{ type: 'class', classId }} />
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <ClassPage />
    </Shell>
  );
}
