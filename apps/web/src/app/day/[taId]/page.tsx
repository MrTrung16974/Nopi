'use client';
import { scanJobSchema, teacherAssignmentSchema, teacherOverviewSchema, uploadTicketSchema, type ScanJobDto } from '@nopi/contracts';
import { defaultDueAt } from '@nopi/domain';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { ScanReview, type ReviewItem } from '@/components/ScanReview';
import { ReportExport } from '@/components/ReportExport';
import { Shell } from '@/components/Shell';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

type Kind = 'photo' | 'video' | 'audio';
const KIND_LABEL: Record<Kind, string> = { photo: 'Ảnh', video: 'Video', audio: 'Ghi âm' };

/** "datetime-local" theo giờ máy người dùng (VN) */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function TeachingPage() {
  const { taId } = useParams<{ taId: string }>();
  const ov = useApi(() => call('/teacher/overview', { schema: teacherOverviewSchema }), []);
  const list = useApi(() => call(`/teaching/${taId}/assignments`, { schema: z.array(teacherAssignmentSchema) }), [taId]);
  const current = ov.data?.teaching.find((x) => x.teachingAssignmentId === taId);
  const sameSubject = ov.data?.teaching.filter((x) => x.subject.id === current?.subject.id) ?? [];
  const [form, setForm] = useState({ title: '', instructions: '', kinds: ['photo'] as Kind[], dueAt: toLocalInput(defaultDueAt(new Date())), publishAt: '', classes: [taId] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanJob, setScanJob] = useState<ScanJobDto | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);

  /** Giao lại bài cũ (năm trước, lớp khác…): chép tên, lời dặn, cách nộp; hạn nộp mới mặc định tối mai. */
  const copy = (a: { id: string; title: string; instructions: string | null; submissionKinds: string[] }) => {
    setScanJob(null);
    setItems([]);
    setForm({ ...form, title: a.title, instructions: a.instructions ?? '', kinds: a.submissionKinds as Kind[], dueAt: toLocalInput(defaultDueAt(new Date())), publishAt: '' });
    setCopiedFrom(a.title);
    setOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Quét đề: tải ảnh thẳng lên kho → tạo lượt quét → chờ AI đọc → soát lại. */
  const scanFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg(null);
    setScanning(true);
    try {
      const ids: string[] = [];
      for (const f of Array.from(files).slice(0, 5)) {
        const ticket = uploadTicketSchema.parse(await call('/scan/uploads', { method: 'POST', body: { teachingAssignmentId: taId, mimeType: f.type || 'image/jpeg', sizeBytes: f.size } }));
        if (ticket.method !== 'put') throw new Error('Ảnh quá lớn');
        const put = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: f });
        if (!put.ok) throw new Error('Chưa tải được ảnh lên, thử lại nhé');
        await call(`/media/${ticket.mediaId}/complete`, { method: 'POST', body: {} });
        ids.push(ticket.mediaId);
      }
      let job = await call('/scan-jobs', { method: 'POST', body: { mediaIds: ids, teachingAssignmentId: taId }, schema: scanJobSchema });
      for (let i = 0; i < 90 && (job.status === 'queued' || job.status === 'running'); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        job = await call(`/scan-jobs/${job.id}`, { schema: scanJobSchema });
      }
      if (job.status !== 'done' || !job.result) throw new Error(job.error ?? 'Chưa đọc được đề, thử lại nhé');
      setScanJob(job);
      setItems(job.result.items.map(({ number: _n, ...it }, i) => ({ ...it, key: `${job.id}-${i}` })));
      // Gợi ý cách nộp theo kiểu câu: có câu đọc thành tiếng → ghi âm; còn lại → ảnh
      const hasReading = job.result.items.some((it) => it.itemType === 'read_aloud');
      const hasWriting = job.result.items.some((it) => it.itemType !== 'read_aloud');
      const kinds: Kind[] = [...(hasWriting ? (['photo'] as Kind[]) : []), ...(hasReading ? (['audio'] as Kind[]) : [])];
      setForm((f) => ({ ...f, title: job.result!.title || f.title, instructions: job.result!.instructions ?? f.instructions, kinds: kinds.length ? kinds : f.kinds }));
      setOpen(true);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setScanning(false);
    }
  };

  const submit = async () => {
    setMsg(null);
    try {
      await call('/assignments', {
        method: 'POST',
        body: {
          teachingAssignmentIds: form.classes,
          title: form.title,
          instructions: form.instructions || undefined,
          submissionKinds: form.kinds,
          dueAt: new Date(form.dueAt).toISOString(),
          publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : undefined,
          ...(copiedFrom && !scanJob ? { source: 'copy' } : {}),
          ...(scanJob
            ? { source: 'scan', scanJobId: scanJob.id, originalMediaIds: scanJob.sourceMedia.map((m) => m.id), items: items.map(({ key: _k, ...it }) => it) }
            : {}),
        },
      });
      setForm({ ...form, title: '', instructions: '' });
      setCopiedFrom(null);
      setScanJob(null);
      setItems([]);
      setMsg({ ok: true, text: form.publishAt ? 'Đã hẹn giờ giao bài' : 'Đã giao bài' });
      await list.reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  return (
    <>
      <h1>{current ? `${current.subject.shortName} ${current.class.name}` : ' '}</h1>
      <div className="row" style={{ margin: '16px 0 0' }}>
        <label className="btn" style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'row', color: 'var(--text)' }}>
          {scanning ? 'Đang đọc đề…' : '📷 Quét đề từ ảnh'}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={scanning} aria-label="Chọn ảnh trang đề (tối đa 5)" onChange={(e) => scanFiles(e.target.files)} />
        </label>
        <span className="muted" style={{ fontSize: 13 }}>Chụp trang sách hoặc phiếu bài tập (tối đa 5 trang) — AI tách sẵn từng câu, thầy cô soát lại rồi giao.</span>
      </div>
      <details className="card" style={{ margin: '16px 0' }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary><strong>+ Giao bài{scanJob ? ' (từ ảnh quét)' : copiedFrom ? ` (giao lại «${copiedFrom}»)` : ''}</strong></summary>
        <div className="stack" style={{ marginTop: 12 }}>
          {scanJob && <ScanReview job={scanJob} items={items} onChange={setItems} />}
          <div className="row">
            {sameSubject.map((x) => (
              <label key={x.teachingAssignmentId} style={{ flexDirection: 'row', display: 'flex', gap: 6, alignItems: 'center', color: 'inherit' }}>
                <input type="checkbox" style={{ minHeight: 0 }} checked={form.classes.includes(x.teachingAssignmentId)} onChange={(e) => setForm({ ...form, classes: e.target.checked ? [...form.classes, x.teachingAssignmentId] : form.classes.filter((c) => c !== x.teachingAssignmentId) })} />
                Lớp {x.class.name}
              </label>
            ))}
          </div>
          <label>Tên bài<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ví dụ: Bài 3, 4 trang 25" /></label>
          <label>Lời dặn<textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={3} style={{ font: 'inherit', padding: 10, borderRadius: 10, border: '1.5px solid var(--border)' }} /></label>
          <div className="row">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <label key={k} style={{ flexDirection: 'row', display: 'flex', gap: 6, alignItems: 'center', color: 'inherit' }}>
                <input type="checkbox" style={{ minHeight: 0 }} checked={form.kinds.includes(k)} onChange={(e) => setForm({ ...form, kinds: e.target.checked ? [...form.kinds, k] : form.kinds.filter((x) => x !== k) })} />
                {KIND_LABEL[k]}
              </label>
            ))}
          </div>
          <div className="row">
            <label>Hạn nộp<input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
            <label>Hẹn giờ giao (bỏ trống = giao ngay)<input type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} /></label>
          </div>
          <div><button className="primary" disabled={!form.title.trim() || form.kinds.length === 0 || form.classes.length === 0} onClick={submit}>{form.publishAt ? 'Hẹn giờ giao' : 'Giao ngay'}</button></div>
        </div>
      </details>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
      <table>
        <thead><tr><th>Bài</th><th>Hạn nộp</th><th>Đã nộp</th><th>Chờ chấm</th><th>Đã chấm</th><th></th></tr></thead>
        <tbody>
          {list.data?.map((a) => (
            <tr key={a.id}>
              <td><Link href={`/bai/${a.id}`}>{a.title}</Link>{a.status === 'scheduled' && <span className="badge" style={{ marginLeft: 6 }}>Hẹn giờ</span>}</td>
              <td>{new Date(a.dueAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{a.stats.total - a.stats.notSubmitted}/{a.stats.total}</td>
              <td>{a.stats.submitted || ''}</td>
              <td>{a.stats.graded || ''}</td>
              <td><button onClick={() => copy(a)} style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }}>Giao lại</button></td>
            </tr>
          ))}
          {list.data?.length === 0 && <tr><td colSpan={6} className="muted">Chưa giao bài nào.</td></tr>}
        </tbody>
      </table>
      {current && (
        <div style={{ marginTop: 16 }}>
          <ReportExport label={`Báo cáo ${current.subject.shortName} lớp ${current.class.name} (mỗi em một dòng, mỗi bài một cột)`} target={{ type: 'class', classId: current.class.id, subjectId: current.subject.id }} />
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <TeachingPage />
    </Shell>
  );
}
