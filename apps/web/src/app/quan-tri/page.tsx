'use client';
import { adminSchoolListSchema, schoolSchema } from '@nopi/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { SystemAdminOnly, contractText, phoneText } from '@/components/SystemAdmin';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;

/** Quản trị hệ thống: danh sách trường (tìm, lọc trạng thái, phân trang) + tạo trường mới. */
function SchoolsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'locked'>('');
  const [page, setPage] = useState(1);
  // Gõ tìm kiếm: đợi ngừng gõ 300ms mới gọi API
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const list = useApi(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) p.set('q', query);
    if (status) p.set('status', status);
    return call(`/admin/schools?${p}`, { schema: adminSchoolListSchema });
  }, [query, status, page]);

  const [form, setForm] = useState({ name: '', adminName: '', adminPhone: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const admin = form.adminPhone.trim() ? { fullName: form.adminName, phone: form.adminPhone } : undefined;
      const s = await call('/admin/schools', { method: 'POST', body: { name: form.name, admin }, schema: schoolSchema });
      router.push(`/quan-tri/${s.id}`);
    } catch (e) {
      setMsg(errorText(e));
      setBusy(false);
    }
  };
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <h1>Quản trị hệ thống</h1>
      <p className="muted">Các trường dùng Nopi theo hợp đồng. Không gian gia đình không hiện ở đây.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <strong>Tạo trường mới</strong>
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <label style={{ flex: 2, minWidth: 220 }}>Tên trường<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tiểu học Hoa Sen" /></label>
          <label style={{ flex: 1, minWidth: 180 }}>Quản trị trường (họ tên)<input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} /></label>
          <label style={{ flex: 1, minWidth: 150 }}>SĐT quản trị<input inputMode="tel" value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} placeholder="0912345678" /></label>
          <button className="primary" onClick={create} disabled={busy || form.name.trim().length < 3 || (Boolean(form.adminPhone.trim()) && form.adminName.trim().length < 2)}>
            Tạo trường
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Quản trị trường đăng nhập bằng SĐT này (mã OTP) là vào được trang trường.</p>
        {msg && <p className="error" role="alert">{msg}</p>}
      </div>

      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ flex: 1, minWidth: 220 }}>Tìm theo tên trường<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên trường…" /></label>
        <label>
          Trạng thái
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Tạm khoá</option>
          </select>
        </label>
      </div>

      {list.error && <p className="error">{list.error}</p>}
      <div className="scroll-x">
        <table>
          <thead>
            <tr><th>Trường</th><th>Quản trị</th><th>Lớp</th><th>Học sinh</th><th>Giáo viên</th><th>Hợp đồng</th><th>Trạng thái</th></tr>
          </thead>
          <tbody>
            {list.data?.items.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/quan-tri/${s.id}`} style={{ fontWeight: 700 }}>{s.name}</Link></td>
                <td>{s.admins.length ? s.admins.map((a) => <div key={a.id}>{a.fullName} <span className="muted">{phoneText(a.phone)}</span></div>) : <span className="badge">Chưa có</span>}</td>
                <td>{s.classCount}</td>
                <td>{s.studentCount}</td>
                <td>{s.teacherCount}</td>
                <td>{contractText(s.contract)}</td>
                <td>{s.status === 'locked' ? <span className="badge">Tạm khoá</span> : <span className="badge badge-ok">Hoạt động</span>}</td>
              </tr>
            ))}
            {list.data?.items.length === 0 && <tr><td colSpan={7} className="muted">Không có trường nào{query ? ` khớp «${query}»` : ''}.</td></tr>}
            {!list.data && list.loading && <tr><td colSpan={7} className="muted">Đang tải…</td></tr>}
          </tbody>
        </table>
      </div>
      {list.data && list.data.total > PAGE_SIZE && (
        <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
          <button onClick={() => setPage(page - 1)} disabled={page <= 1}>← Trước</button>
          <span className="muted">Trang {page}/{pages} · {list.data.total} trường</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages}>Sau →</button>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <SystemAdminOnly>
        <SchoolsPage />
      </SystemAdminOnly>
    </Shell>
  );
}
