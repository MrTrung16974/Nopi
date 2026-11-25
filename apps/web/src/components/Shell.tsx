'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ChepConSvg } from '@/components/ChepConSvg';
import { inboxSchema } from '@nopi/contracts';
import { call, webSession, type WebSession } from '@/lib/client';

/** Khung trang cần đăng nhập: thanh điều hướng kính mờ hiện đại + kiểm tra phiên. */
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [s, setS] = useState<WebSession | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const cur = webSession.get();
    if (!cur) router.replace('/dang-nhap');
    else setS(cur);
  }, [router]);
  // Số thông báo chưa đọc (cập nhật mỗi phút)
  useEffect(() => {
    if (!s) return;
    const load = () => call('/me/notifications', { schema: inboxSchema }).then((r) => setUnread(r.unread), () => undefined);
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [s, pathname]);
  if (!s) return null;

  const logout = async () => {
    await call('/auth/logout', { method: 'POST' }).catch(() => undefined);
    webSession.set(null);
    router.replace('/dang-nhap');
  };

  const displayName = s.user.fullName || s.user.phone || 'Bạn';
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="row" style={{ alignItems: 'center', gap: 20 }}>
            <Link href="/" className="brand">
              <ChepConSvg size={38} />
              <span>
                <span className="brand-accent">Nopi</span>
              </span>
            </Link>
            <nav className="nav-links" aria-label="Điều hướng chính">
              <Link href="/" className="nav-link" aria-current={pathname === '/' ? 'page' : undefined}>
                Trang chủ
              </Link>
              <Link href="/gia-dinh" className="nav-link" aria-current={pathname === '/gia-dinh' ? 'page' : undefined}>
                Gia đình
              </Link>
              <Link href="/hoc-sinh?demo=nhi" className="nav-link" aria-current={pathname === '/hoc-sinh' ? 'page' : undefined}>
                Học sinh
              </Link>
              <Link href="/mon-hoc?lop=1" className="nav-link" aria-current={pathname === '/mon-hoc' ? 'page' : undefined}>
                Môn 1–9
              </Link>
            </nav>
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link href="/thong-bao" className="nav-link" aria-current={pathname === '/thong-bao' ? 'page' : undefined} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}>
              🔔{unread > 0 && <span className="badge" style={{ marginLeft: 6 }}>{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <span className="user-chip">
              <span className="user-avatar" aria-hidden="true">{initial}</span>
              <span>{displayName}</span>
            </span>
            <button onClick={logout} style={{ minHeight: 38, padding: '0 14px', fontSize: 13.5, borderRadius: 999 }}>
              Đăng xuất
            </button>
          </div>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
