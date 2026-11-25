'use client';
import { inboxSchema, notificationSettingsSchema, MUTABLE_TEMPLATES, type NotificationDto } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import Link from 'next/link';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

/** Đường dẫn web khi bấm một thông báo (nếu có màn tương ứng trên web). */
function hrefOf(n: NotificationDto): string | null {
  if (n.template === 'teacher_digest') return '/';
  return null;
}

function Settings() {
  const q = useApi(() => call('/me/notification-settings', { schema: notificationSettingsSchema }), []);
  const [msg, setMsg] = useState<string | null>(null);
  if (!q.data) return null;
  const muted = new Set(q.data.muted);
  const toggle = async (t: (typeof MUTABLE_TEMPLATES)[number], on: boolean) => {
    const next = on ? [...muted].filter((x) => x !== t) : [...muted, t];
    const prev = q.data;
    q.setData({ muted: next }); // đổi ngay trên giao diện, lỗi thì trả lại
    try {
      await call('/me/notification-settings', { method: 'PUT', body: { muted: next }, schema: notificationSettingsSchema });
      setMsg('Đã lưu');
    } catch (e) {
      q.setData(prev);
      setMsg(errorText(e));
    }
  };
  return (
    <details className="card">
      <summary><strong>Cài đặt thông báo</strong></summary>
      <div className="stack" style={{ marginTop: 12, gap: 10 }}>
        <p className="muted" style={{ margin: 0 }}>{vi.notify.settingsHint}</p>
        {MUTABLE_TEMPLATES.map((t) => (
          <label key={t} style={{ flexDirection: 'row', display: 'flex', gap: 8, alignItems: 'center', color: 'inherit' }}>
            <input type="checkbox" style={{ minHeight: 0 }} checked={!muted.has(t)} onChange={(e) => toggle(t, e.target.checked)} />
            {vi.notify.templateLabels[t]}
          </label>
        ))}
        {msg && <span className="muted" role="status">{msg}</span>}
      </div>
    </details>
  );
}

function ReportLink({ id }: { id: string }) {
  const q = useApi(() => call(`/reports/${id}`), [id]);
  const job = q.data as { downloadUrl: string | null; fileName: string | null } | null;
  if (!job) return null;
  return job.downloadUrl ? <a href={job.downloadUrl}>Tải {job.fileName}</a> : <span className="muted">{vi.reports.expired}</span>;
}

function Inbox() {
  const q = useApi(() => call('/me/notifications', { schema: inboxSchema }), []);
  const markAll = async () => {
    await call('/me/notifications/read', { method: 'POST', body: { all: true } });
    await q.reload();
  };
  const open = async (n: NotificationDto) => {
    if (!n.readAt) {
      await call('/me/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => undefined);
      await q.reload();
    }
  };
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Thông báo</h1>
        {q.data && q.data.unread > 0 && <button onClick={markAll}>{vi.notify.markAllRead}</button>}
      </div>
      <Settings />
      {q.error && <p className="error">{q.error}</p>}
      {q.data?.items.length === 0 && <p className="muted">{vi.notify.empty}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {q.data?.items.map((n) => {
          const href = hrefOf(n);
          return (
            <div key={n.id} className="card" onClick={() => open(n)} style={{ cursor: 'pointer', borderColor: n.readAt ? undefined : '#FDBA74', background: n.readAt ? undefined : '#FFF7ED' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontWeight: n.readAt ? 500 : 800 }}>{n.title}</strong>
                <span className="muted" style={{ fontSize: 13 }}>{new Date(n.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <p className="muted" style={{ margin: '6px 0 0', whiteSpace: 'pre-line' }}>{n.body}</p>
              {n.data.reportId && <div style={{ marginTop: 6 }}><ReportLink id={n.data.reportId} /></div>}
              {href && !n.data.reportId && <Link href={href}>Mở</Link>}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <Inbox />
    </Shell>
  );
}
