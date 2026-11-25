'use client';
import { studentAuthResponseSchema } from '@nopi/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChepConSvg } from '@/components/ChepConSvg';
import { call, errorText } from '@/lib/client';
import { studentWebSession } from '@/lib/student-client';

/** Trang đăng nhập dành riêng cho học sinh trên máy tính/máy tính bảng (mã thẻ QR hoặc mã HS + PIN). */
export default function StudentWebLoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'card' | 'pin'>('card');
  const [card, setCard] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const r = await call(path, { method: 'POST', auth: false, body, schema: studentAuthResponseSchema });
      studentWebSession.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, student: r.student });
      router.replace('/hoc-sinh');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="card stack" style={{ width: '100%', maxWidth: 480, padding: 32, borderRadius: 28, gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/dang-nhap" className="btn" style={{ minHeight: 38, padding: '0 14px', fontSize: 13.5, borderRadius: 999 }}>
            ← Quay lại
          </Link>
          <span className="badge">🎒 Học sinh lớp 1–9</span>
        </div>

        <div style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 10 }}>
          <ChepConSvg size={80} mood="wave" />
          <h1 style={{ margin: 0, fontSize: 26 }}>Chào con! Vào học cùng Chép Con</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
            Nhập mã trên thẻ cô giáo phát, hoặc dùng mã học sinh + PIN 6 số (lớp 4–9).
          </p>
        </div>

        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'card'} onClick={() => { setTab('card'); setError(null); }}>
            🏷️ Mã trên thẻ
          </button>
          <button type="button" role="tab" aria-selected={tab === 'pin'} onClick={() => { setTab('pin'); setError(null); }}>
            🔑 Mã HS + PIN
          </button>
        </div>

        {tab === 'card' ? (
          <div className="stack" style={{ gap: 14 }}>
            <label>
              Mã trên thẻ của con
              <input
                value={card}
                onChange={(e) => setCard(e.target.value.toUpperCase())}
                placeholder="Ví dụ: ABC-DEF-GHJK"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="btn-nhi"
              style={{ minHeight: 62, fontSize: 19 }}
              disabled={busy || card.replace(/\W/g, '').length < 6}
              onClick={() => login('/auth/student/card', { code: card })}
            >
              {busy ? 'Đang vào lớp…' : '🚀 Vào học ngay'}
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            <label>
              Mã học sinh (8 số)
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={8} inputMode="numeric" placeholder="12345678" />
            </label>
            <label>
              Mã PIN (6 số)
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} maxLength={6} inputMode="numeric" type="password" placeholder="••••••" />
            </label>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 54 }}
              disabled={busy || code.length !== 8 || pin.length !== 6}
              onClick={() => login('/auth/student/pin', { studentCode: code, pin })}
            >
              {busy ? 'Đang vào lớp…' : '🚀 Vào học'}
            </button>
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'grid', gap: 8, textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 13.5 }}>Chưa có thẻ? Trải nghiệm thử giao diện học sinh ngay:</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/hoc-sinh?demo=nhi" className="btn" style={{ minHeight: 40, fontSize: 13.5, borderRadius: 999 }}>
              🐟 Thử Chế độ Nhí (Lớp 1–5)
            </Link>
            <Link href="/hoc-sinh?demo=teen" className="btn" style={{ minHeight: 40, fontSize: 13.5, borderRadius: 999 }}>
              ⚡ Thử Chế độ Teen (Lớp 6–9)
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
