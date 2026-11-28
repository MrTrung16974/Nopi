'use client';
import { adminSchoolSchema, entitlementSchema, type AdminSchool } from '@nopi/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { SystemAdminOnly, contractText, phoneText } from '@/components/SystemAdmin';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

/** Quản trị hệ thống: một trường — đổi tên, tạm khoá/mở, quản trị trường, hợp đồng. */
function SchoolAdminPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const school = useApi(() => call(`/admin/schools/${schoolId}`, { schema: adminSchoolSchema }), [schoolId]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState('');
  const [admin, setAdmin] = useState({ fullName: '', phone: '' });
  const [externalId, setExternalId] = useState('');
  const s = school.data;
  useEffect(() => {
    if (s) setName(s.name);
  }, [s?.name]);

  /** Gọi API rồi thay dữ liệu trường bằng bản server trả về. */
  const run = async (fn: () => Promise<AdminSchool | void>, okText: string) => {
    setMsg(null);
    try {
      const next = await fn();
      if (next) school.setData(next);
      else await school.reload();
      setMsg({ ok: true, text: okText });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
      return false;
    }
  };

  if (school.error) return <p className="error">{school.error}</p>;
  if (!s) return <p className="muted">Đang tải…</p>;

  const toggleLock = () => {
    const locking = s.status === 'active';
    const ok = window.confirm(
      locking
        ? `Tạm khoá «${s.name}»?\n\nQuản trị và giáo viên của trường sẽ không giao bài, chấm bài hay quản lý lớp được nữa. Học sinh và phụ huynh vẫn xem được bài cũ. Dữ liệu giữ nguyên, mở lại bất cứ lúc nào.`
        : `Mở lại «${s.name}»? Nhà trường dùng lại được như bình thường.`,
    );
    if (ok) void run(() => call(`/admin/schools/${s.id}`, { method: 'PATCH', body: { status: locking ? 'locked' : 'active' }, schema: adminSchoolSchema }), locking ? 'Đã tạm khoá trường' : 'Đã mở lại trường');
  };

  return (
    <>
      <nav className="muted" style={{ fontSize: 14, marginBottom: 8 }} aria-label="Đường dẫn">
        <Link href="/quan-tri">Quản trị hệ thống</Link> › {s.name}
      </nav>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{s.name}</h1>
        {s.status === 'locked' ? <span className="badge">Tạm khoá</span> : <span className="badge badge-ok">Đang hoạt động</span>}
      </div>
      <p className="muted">
        {s.classCount} lớp · {s.studentCount} học sinh · {s.teacherCount} giáo viên · tạo ngày {new Date(s.createdAt).toLocaleDateString('vi-VN')}
        {' · '}
        <Link href={`/truong/${s.id}`}>Mở trang quản trị của trường →</Link>
      </p>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}

      <div className="stack" style={{ gap: 16 }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Thông tin trường</h2>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label style={{ flex: 1, minWidth: 240 }}>Tên trường<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <button
              className="primary"
              disabled={name.trim().length < 3 || name.trim() === s.name}
              onClick={() => run(() => call(`/admin/schools/${s.id}`, { method: 'PATCH', body: { name }, schema: adminSchoolSchema }), 'Đã đổi tên trường')}
            >
              Lưu tên
            </button>
          </div>
          <div className="row" style={{ marginTop: 16, alignItems: 'center' }}>
            <button onClick={toggleLock} style={s.status === 'active' ? { background: '#FEE2E2', borderColor: '#FCA5A5', color: '#991B1B' } : undefined}>
              {s.status === 'active' ? '🔒 Tạm khoá trường' : '🔓 Mở lại trường'}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>Khoá khi hết hợp đồng hoặc cần dừng tạm thời; không xoá dữ liệu.</span>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Quản trị trường ({s.admins.length})</h2>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Họ tên</th><th>SĐT</th><th>Tài khoản</th><th></th></tr></thead>
              <tbody>
                {s.admins.map((a) => (
                  <tr key={a.id}>
                    <td>{a.fullName}</td>
                    <td>{phoneText(a.phone)}</td>
                    <td>{a.status === 'invited' ? <span className="badge">Chưa đăng nhập lần nào</span> : a.status === 'locked' ? <span className="badge">Đã khoá</span> : 'Đang dùng'}</td>
                    <td>
                      <button
                        disabled={s.admins.length <= 1}
                        title={s.admins.length <= 1 ? 'Trường phải còn ít nhất một quản trị' : undefined}
                        onClick={() => {
                          if (window.confirm(`Gỡ quyền quản trị của ${a.fullName}? Nếu người này cũng là giáo viên thì vẫn dạy bình thường.`)) {
                            void run(() => call(`/admin/schools/${s.id}/admins/${a.id}`, { method: 'DELETE', schema: adminSchoolSchema }), `Đã gỡ quyền quản trị của ${a.fullName}`);
                          }
                        }}
                      >
                        Gỡ quyền
                      </button>
                    </td>
                  </tr>
                ))}
                {s.admins.length === 0 && <tr><td colSpan={4} className="muted">Trường chưa có quản trị — thêm bên dưới.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <label style={{ flex: 1, minWidth: 200 }}>Họ tên<input value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} /></label>
            <label style={{ minWidth: 160 }}>SĐT<input inputMode="tel" value={admin.phone} onChange={(e) => setAdmin({ ...admin, phone: e.target.value })} placeholder="0912345678" /></label>
            <button
              className="primary"
              disabled={admin.fullName.trim().length < 2 || admin.phone.trim().length < 9}
              onClick={async () => {
                if (await run(() => call(`/admin/schools/${s.id}/admins`, { method: 'POST', body: admin, schema: adminSchoolSchema }), `Đã thêm ${admin.fullName} làm quản trị`)) setAdmin({ fullName: '', phone: '' });
              }}
            >
              Thêm quản trị
            </button>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Hợp đồng</h2>
          <p style={{ marginTop: 0 }}>Hiện tại: {contractText(s.contract)}</p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label style={{ flex: 1, minWidth: 220 }}>Số hợp đồng<input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="HD-2026-001" /></label>
            <button
              className="primary"
              disabled={externalId.trim().length < 1}
              onClick={async () => {
                if (!window.confirm(`Mở gói "Hợp đồng trường — theo năm học" (tới 31/5) cho «${s.name}» theo hợp đồng ${externalId.trim()}?`)) return;
                const ok = await run(async () => {
                  await call(`/admin/schools/${s.id}/subscriptions`, { method: 'POST', body: { planId: 'school_year', externalId: externalId.trim() }, schema: entitlementSchema });
                }, 'Đã mở gói theo hợp đồng');
                if (ok) setExternalId('');
              }}
            >
              Mở gói năm học
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Nhập lại cùng số hợp đồng sẽ gia hạn hợp đồng đó, không tạo trùng.</p>
        </section>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <SystemAdminOnly>
        <SchoolAdminPage />
      </SystemAdminOnly>
    </Shell>
  );
}
