'use client';
import type { AdminSchool } from '@nopi/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { webSession } from '@/lib/client';

/** Chỉ hiện nội dung cho quản trị hệ thống (API vẫn kiểm quyền; đây chỉ để người khác không thấy trang lỗi). */
export function SystemAdminOnly({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(Boolean(webSession.get()?.user.isSystemAdmin)), []);
  if (ok === null) return null;
  if (!ok) {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Trang dành cho quản trị hệ thống</h1>
        <p className="muted" style={{ margin: 0 }}>Tài khoản của bạn không có quyền xem trang này.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** +84912345678 → 0912 345 678 */
export const phoneText = (p: string | null) => {
  if (!p) return '';
  const local = p.startsWith('+84') ? `0${p.slice(3)}` : p;
  return local.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3');
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

export function contractText(c: AdminSchool['contract']) {
  if (!c) return <span className="muted">Chưa có</span>;
  if (c.status === 'expired' || c.status === 'canceled') return <span className="badge">Hết hạn {fmtDate(c.until)}</span>;
  return <span>{c.planName ?? 'Hợp đồng'} · tới {fmtDate(c.until)}</span>;
}
