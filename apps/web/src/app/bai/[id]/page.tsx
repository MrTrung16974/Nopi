'use client';
import { commentTemplateSchema, gradingRowSchema, remindResultSchema, teacherAssignmentSchema, type GradingRow, type MediaView } from '@nopi/contracts';
import { stageOfGrade, STICKERS, type Grade } from '@nopi/domain';
import { statusStyle } from '@nopi/ui';
import { vi } from '@nopi/copy';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Shell } from '@/components/Shell';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

const LEVELS: Record<string, string[]> = { completion_level: ['HOAN_THANH_TOT', 'HOAN_THANH', 'CHUA_HOAN_THANH'], pass_fail: ['DAT', 'CHUA_DAT'] };

function Media({ m }: { m: MediaView }) {
  if (m.status === 'failed') {
    return (
      <p className="error" role="alert" style={{ margin: 0 }}>
        ⚠️ File {m.kind === 'video' ? 'video' : m.kind === 'audio' ? 'ghi âm' : 'ảnh'} này bị lỗi khi xử lý (có thể hỏng khi tải lên). Thầy cô bấm «Yêu cầu làm lại» để em nộp lại.
        {m.url && <> <a href={m.url} target="_blank" rel="noreferrer">Thử mở bản gốc</a></>}
      </p>
    );
  }
  if (!m.url) return <p className="muted">{m.status === 'deleted' ? 'File đã hết thời hạn lưu' : 'Đang xử lý…'}</p>;
  if (m.kind === 'photo') return <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="Bài làm" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} /></a>;
  if (m.kind === 'video') return <video src={m.url} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />;
  if (m.kind === 'audio') return <audio src={m.url} controls style={{ width: '100%' }} />;
  return <a href={m.url} target="_blank" rel="noreferrer">Mở tài liệu</a>;
}

/**
 * Chấm trên máy tính (mục 7.5): danh sách em bên trái, bài làm ở giữa, ô đánh giá bên phải.
 * Phím tắt: 1/2/3 chọn mức · Enter lưu & bài tiếp · ↑/↓ đổi em · R yêu cầu làm lại.
 */
function GradingPage() {
  const { id } = useParams<{ id: string }>();
  const a = useApi(() => call(`/assignments/${id}`, { schema: teacherAssignmentSchema }), [id]);
  const rows = useApi(() => call(`/assignments/${id}/submissions`, { schema: z.array(gradingRowSchema) }), [id]);
  const comments = useApi(
    () => (a.data ? call(`/comment-templates?subjectId=${a.data.subject.id}&stage=${stageOfGrade(a.data.class.grade as Grade)}`, { schema: z.array(commentTemplateSchema) }) : Promise.resolve([])),
    [a.data?.subject.id],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [sticker, setSticker] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const list = rows.data ?? [];
  const row: GradingRow | undefined = list.find((r) => r.studentAssignmentId === selected) ?? list.find((r) => r.status === 'submitted') ?? list[0];
  const scheme = a.data?.gradingScheme;

  useEffect(() => {
    const e = row?.evaluation;
    setLevel(e?.level ?? null);
    setScore(e?.score != null ? String(e.score) : '');
    setComment(e?.comment ?? '');
    setSticker(e?.sticker ?? null);
  }, [row?.studentAssignmentId, row?.evaluation?.id]);

  const next = useCallback(() => {
    const waiting = list.filter((r) => r.status === 'submitted' && r.studentAssignmentId !== row?.studentAssignmentId);
    setSelected(waiting[0]?.studentAssignmentId ?? row?.studentAssignmentId ?? null);
  }, [list, row]);

  const save = useCallback(
    async (requiresRedo: boolean) => {
      if (!row?.latest || !scheme) return;
      setMsg(null);
      try {
        const body: Record<string, unknown> = { requiresRedo, comment: comment || undefined, sticker: sticker ?? undefined };
        if (!requiresRedo) {
          if (scheme === 'score_10') body.score = Number(score.replace(',', '.'));
          else body.level = level ?? undefined;
        }
        const updated = await call(`/submissions/${row.latest.id}/evaluation`, { method: 'PUT', body, schema: gradingRowSchema });
        rows.setData(list.map((r) => (r.studentAssignmentId === updated.studentAssignmentId ? updated : r)));
        setMsg({ ok: true, text: requiresRedo ? `Đã yêu cầu ${row.student.fullName} làm lại` : `Đã chấm ${row.student.fullName}` });
        const waiting = list.filter((r) => r.status === 'submitted' && r.studentAssignmentId !== row.studentAssignmentId);
        setSelected(waiting[0]?.studentAssignmentId ?? row.studentAssignmentId);
      } catch (e) {
        setMsg({ ok: false, text: errorText(e) });
      }
    },
    [row, scheme, comment, sticker, score, level, list, rows],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Enter' && (!typing || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void save(false);
      }
      if (typing) return;
      const levels = scheme ? LEVELS[scheme] : undefined;
      if (levels && /^[1-3]$/.test(e.key) && levels[Number(e.key) - 1]) setLevel(levels[Number(e.key) - 1]!);
      if (e.key.toLowerCase() === 'r') void save(true);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const i = list.findIndex((r) => r.studentAssignmentId === row?.studentAssignmentId);
        const j = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        setSelected(list[j]?.studentAssignmentId ?? null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, scheme, list, row]);

  if (!a.data || !rows.data) return <p className="muted">Đang tải…</p>;
  const waitingCount = list.filter((r) => r.status === 'submitted').length;
  const missingCount = list.filter((r) => r.status === 'assigned' || r.status === 'overdue' || r.status === 'returned').length;
  const remind = async () => {
    setMsg(null);
    try {
      const r = await call(`/assignments/${id}/remind`, { method: 'POST', schema: remindResultSchema });
      setMsg({ ok: true, text: vi.notify.reminded(r.reminded) });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  return (
    <>
      <h1>{a.data.title}</h1>
      <p className="muted">{a.data.subject.shortName} {a.data.class.name} · {a.data.stats.total - a.data.stats.notSubmitted}/{a.data.stats.total} đã nộp · chờ chấm {waitingCount}</p>
      {missingCount > 0 && <button onClick={remind} style={{ marginBottom: 8 }}>{vi.notify.remindButton(missingCount)}</button>}
      <p className="muted" style={{ fontSize: 13 }}>Phím tắt: 1/2/3 chọn mức · Enter lưu & bài tiếp · R yêu cầu làm lại · ↑/↓ đổi em</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr minmax(260px, 340px)', gap: 16, alignItems: 'start' }}>
        <nav className="card" style={{ padding: 8 }} aria-label="Danh sách học sinh">
          {list.map((r) => {
            const s = statusStyle[r.status];
            return (
              <button key={r.studentAssignmentId} onClick={() => setSelected(r.studentAssignmentId)} aria-current={r.studentAssignmentId === row?.studentAssignmentId} style={{ width: '100%', justifyContent: 'space-between', border: 'none', background: r.studentAssignmentId === row?.studentAssignmentId ? 'var(--primary-soft)' : 'transparent', marginBottom: 2, gap: 6 }}>
                <span style={{ textAlign: 'left', fontWeight: 500 }}>{r.student.fullName}</span>
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>{vi.status.teacher[r.status]}</span>
              </button>
            );
          })}
        </nav>
        <section className="card stack">
          {row && <h2 style={{ margin: 0 }}>{row.student.fullName}</h2>}
          {row?.latest ? (
            <>
              <span className="muted">Lần nộp {row.latest.attemptNo} · {new Date(row.latest.submittedAt).toLocaleString('vi-VN')}{row.latest.isLate ? ' · Nộp muộn' : ''}{row.latest.byGuardian ? ' · Phụ huynh nộp hộ' : ''}</span>
              {row.latest.media.map((m) => <Media key={m.id} m={m} />)}
            </>
          ) : (
            <p className="muted">Em chưa nộp bài.</p>
          )}
        </section>
        <aside className="card stack">
          {scheme === 'score_10' ? (
            <label>Điểm (0–10, bước 0,25)<input value={score} onChange={(e) => setScore(e.target.value)} inputMode="decimal" style={{ fontSize: 24, width: 120 }} /></label>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {(LEVELS[scheme ?? ''] ?? []).map((l, i) => (
                <button key={l} className={level === l ? 'primary' : ''} onClick={() => setLevel(l)}>{i + 1}. {vi.levels[l]}</button>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            {comments.data?.slice(0, 8).map((c) => (
              <button key={c.id} onClick={() => setComment(c.text)} style={{ minHeight: 32, fontWeight: 400, fontSize: 13, borderRadius: 999 }}>{c.text}</button>
            ))}
          </div>
          <label>Nhận xét<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} style={{ font: 'inherit', padding: 10, borderRadius: 10, border: '1.5px solid var(--border)' }} /></label>
          <div className="row" style={{ gap: 6 }}>
            {STICKERS.map((s) => (
              <button key={s.id} className={sticker === s.id ? 'primary' : ''} onClick={() => setSticker(sticker === s.id ? null : s.id)} style={{ minHeight: 32, fontSize: 13 }}>{s.label}</button>
            ))}
          </div>
          <button className="primary" disabled={!row?.latest} onClick={() => save(false)}>Lưu & bài tiếp (Enter)</button>
          <button disabled={!row?.latest} onClick={() => save(true)}>Yêu cầu làm lại (R)</button>
          <button onClick={next}>Bỏ qua</button>
          {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <GradingPage />
    </Shell>
  );
}
