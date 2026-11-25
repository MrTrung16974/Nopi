'use client';
import { reportJobSchema, type CreateReportInput, type ReportFormat } from '@nopi/contracts';
import { useState } from 'react';
import { call, errorText } from '@/lib/client';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Mặc định: cả tháng này theo hạn nộp (tính cả bài sắp đến hạn); tuần đầu tháng thì lấy từ đầu tháng trước. */
export function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (now.getDate() <= 7 ? 1 : 0), 1);
  return { from: iso(start), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

type Target = Omit<CreateReportInput, 'format' | 'from' | 'to'>;

/**
 * Nút xuất báo cáo Excel/PDF: gửi yêu cầu → hệ thống làm nền → tự tải về khi xong
 * (người dùng có thể đóng trang, khi xong sẽ có thông báo trong app).
 */
export function ReportExport({ target, label = 'Xuất báo cáo', range: controlled }: { target: Target; label?: string; range?: { from: string; to: string } }) {
  const [own, setOwn] = useState(defaultRange);
  const range = controlled ?? own;
  const [state, setState] = useState<{ busy: boolean; text: string | null; ok: boolean; link?: string; fileName?: string | null }>({ busy: false, text: null, ok: true });

  const run = async (format: ReportFormat) => {
    setState({ busy: true, text: 'Đang chuẩn bị báo cáo…', ok: true });
    try {
      let job = await call('/reports', { method: 'POST', body: { ...target, format, ...range }, schema: reportJobSchema });
      const until = Date.now() + 120_000;
      while ((job.status === 'queued' || job.status === 'running') && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 1500));
        job = await call(`/reports/${job.id}`, { schema: reportJobSchema });
      }
      if (job.status === 'done' && job.downloadUrl) {
        setState({ busy: false, text: 'Báo cáo đã sẵn sàng.', ok: true, link: job.downloadUrl, fileName: job.fileName });
        window.location.assign(job.downloadUrl);
      } else if (job.status === 'failed') setState({ busy: false, text: job.error ?? 'Không xuất được báo cáo', ok: false });
      else setState({ busy: false, text: 'Báo cáo đang được làm, khi xong sẽ có thông báo trong app.', ok: true });
    } catch (e) {
      setState({ busy: false, text: errorText(e), ok: false });
    }
  };

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <strong>{label}</strong>
      <div className="row">
        {!controlled && (
          <>
            <label>Từ ngày<input type="date" value={own.from} max={own.to} onChange={(e) => setOwn({ ...own, from: e.target.value })} /></label>
            <label>Đến ngày<input type="date" value={own.to} min={own.from} onChange={(e) => setOwn({ ...own, to: e.target.value })} /></label>
          </>
        )}
        <button className="primary" disabled={state.busy} onClick={() => run('xlsx')}>Tải Excel</button>
        <button disabled={state.busy} onClick={() => run('pdf')}>Tải PDF</button>
      </div>
      {state.text && (
        <p className={state.ok ? 'ok' : 'error'} role="status" style={{ margin: 0 }}>
          {state.text}{' '}
          {state.link && <a href={state.link}>Tải lại {state.fileName ?? ''}</a>}
        </p>
      )}
    </div>
  );
}
