'use client';
import { otpRequestResponseSchema, qrLoginPollResponseSchema, qrLoginStartResponseSchema, userAuthResponseSchema, type UserAuthResponse } from '@nopi/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ChepConSvg } from '@/components/ChepConSvg';
import { QrImage } from '@/components/QrImage';
import { call, errorText, webSession } from '@/lib/client';

/** Đăng nhập web: bố cục Split Hero hiện đại + chuyển tab Quét QR / Số điện thoại OTP. */
export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'qr' | 'phone'>('qr');
  const [qr, setQr] = useState<{ loginId: string; pollSecret: string; qrPayload: string } | null>(null);
  const [expired, setExpired] = useState(false);
  const [qrLoading, setQrLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = useCallback(
    (r: UserAuthResponse) => {
      webSession.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user });
      router.replace('/');
    },
    [router],
  );

  const startQr = useCallback(async () => {
    setExpired(false);
    setError(null);
    setQrLoading(true);
    try {
      setQr(await call('/auth/qr-login', { method: 'POST', auth: false, schema: qrLoginStartResponseSchema }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    if (webSession.get()) router.replace('/');
    else void startQr();
  }, [router, startQr]);

  useEffect(() => {
    if (!qr || expired) return;
    const id = setInterval(async () => {
      try {
        const r = await call(`/auth/qr-login/${qr.loginId}/poll`, { method: 'POST', auth: false, body: { pollSecret: qr.pollSecret }, schema: qrLoginPollResponseSchema });
        if (r.status === 'approved') {
          clearInterval(id);
          done(r.auth);
        }
      } catch {
        clearInterval(id);
        setExpired(true);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [qr, expired, done]);

  const requestOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await call('/auth/otp/request', { method: 'POST', auth: false, body: { phone }, schema: otpRequestResponseSchema });
      setMasked(r.maskedPhone);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      done(await call('/auth/otp/verify', { method: 'POST', auth: false, body: { phone, code }, schema: userAuthResponseSchema }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-grid">
        {/* Cột trái: Hero thương hiệu & giá trị cho học sinh lớp 1–9 */}
        <section className="auth-hero">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="brand">
              <ChepConSvg size={44} />
              <span className="brand-accent" style={{ fontSize: 24 }}>Nopi</span>
            </div>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.85)', color: '#9a3412' }}>
              ✨ Tiểu học & THCS · Lớp 1–9
            </span>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <h1 style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', lineHeight: 1.15, margin: 0, color: '#0f172a' }}>
              Nộp bài thật vui,
              <br />
              vượt vũ môn cùng <span className="brand-accent">Chép Con</span>
            </h1>
            <p style={{ margin: 0, color: '#475569', fontSize: 15.5, maxWidth: 440 }}>
              Giao bài dưới 1 phút cho thầy cô, nộp bài 1 chạm cho học sinh từ lớp 1 đến lớp 9 — thân thiện, không quảng cáo, an toàn tuyệt đối.
            </p>
            <div className="stack" style={{ gap: 10, marginTop: 6 }}>
              <div className="feature-pill">
                <span style={{ fontSize: 20 }} aria-hidden="true">📸</span>
                <span>Chụp ảnh vở, quay video, ghi âm đọc bài cực dễ</span>
              </div>
              <div className="feature-pill">
                <span style={{ fontSize: 20 }} aria-hidden="true">🔊</span>
                <span>Có giọng đọc đề cho bé lớp 1–2 đọc chưa thạo</span>
              </div>
              <div className="feature-pill">
                <span style={{ fontSize: 20 }} aria-hidden="true">⭐</span>
                <span>Khen thưởng bằng Sticker Chép Con & nhận xét giọng nói</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/trai-nghiem?che-do=nhi"
                className="btn primary"
                style={{ borderRadius: 999, padding: '0 20px', minHeight: 46, fontSize: 14.5 }}
              >
                🐟 Trải nghiệm Nhí (Lớp 1–5)
              </Link>
              <Link
                href="/trai-nghiem?che-do=teen"
                className="btn"
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  borderColor: 'rgba(2,132,199,0.28)',
                  color: '#0369a1',
                  borderRadius: 999,
                  padding: '0 18px',
                  minHeight: 46,
                  fontSize: 14.5,
                }}
              >
                ⚡ Trải nghiệm Teen (Lớp 6–9)
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5, fontWeight: 700 }}>
              <Link href="/dang-nhap-hoc-sinh">🎒 Học sinh đăng nhập bằng thẻ / PIN →</Link>
              <Link href="/mon-hoc?lop=1" style={{ color: '#475569' }}>📚 Danh mục môn GDPT 2018</Link>
            </div>
          </div>
        </section>

        {/* Cột phải: Thẻ đăng nhập gọn gàng 2 tab */}
        <section className="auth-panel">
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800 }}>Chào mừng trở lại</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
              Dành cho giáo viên, phụ huynh và quản trị nhà trường
            </p>
          </div>

          <div className="segmented" role="tablist" aria-label="Chọn cách đăng nhập">
            <button role="tab" aria-selected={tab === 'qr'} onClick={() => { setTab('qr'); setError(null); }}>
              Quét mã QR
            </button>
            <button role="tab" aria-selected={tab === 'phone'} onClick={() => { setTab('phone'); setError(null); }}>
              Số điện thoại
            </button>
          </div>

          {tab === 'qr' ? (
            <div className="stack" style={{ justifyItems: 'center', textAlign: 'center', gap: 16 }}>
              <div className="qr-frame">
                {qrLoading && !qr ? (
                  <div style={{ width: 200, height: 200, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 14 }}>
                    Đang tạo mã QR…
                  </div>
                ) : qr && !expired ? (
                  <QrImage value={qr.qrPayload} size={200} alt="Mã QR đăng nhập Nopi" />
                ) : (
                  <div style={{ width: 200, height: 200, display: 'grid', placeItems: 'center', gap: 10 }}>
                    <button className="primary" onClick={startQr}>
                      Lấy mã QR mới
                    </button>
                  </div>
                )}
              </div>

              {qr && !expired && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#15803d', background: '#dcfce7', padding: '6px 14px', borderRadius: 999 }}>
                  <span className="pulse-dot" />
                  <span>Đang chờ quét từ app Nopi</span>
                </div>
              )}

              <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 320 }}>
                Mở app <strong>Nopi</strong> trên điện thoại → chọn <strong>«Đăng nhập Nopi trên máy tính»</strong> → đưa camera vào mã trên.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <label>
                Số điện thoại
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912 345 678"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>

              {!masked ? (
                <button className="primary" onClick={requestOtp} disabled={busy || phone.replace(/\D/g, '').length < 10}>
                  {busy ? 'Đang gửi mã…' : 'Nhận mã xác nhận'}
                </button>
              ) : (
                <>
                  <div className="ok">Mã 6 số đã được gửi tới {masked}</div>
                  <label>
                    Mã xác nhận (6 chữ số)
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      maxLength={6}
                      placeholder="Nhập 6 chữ số"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </label>
                  <button className="primary" onClick={verifyOtp} disabled={busy || code.length !== 6}>
                    {busy ? 'Đang kiểm tra…' : 'Đăng nhập ngay'}
                  </button>
                  <button
                    onClick={() => {
                      setMasked(null);
                      setCode('');
                      setError(null);
                    }}
                    style={{ minHeight: 40, fontSize: 13.5 }}
                  >
                    Đổi số điện thoại khác
                  </button>
                </>
              )}
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Đăng nhập nhanh bằng mã OTP qua Zalo/SMS — không cần nhớ mật khẩu.
              </p>
            </div>
          )}

          {error && (
            <div className="error" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span>{error}</span>
              {tab === 'qr' && (
                <button onClick={startQr} style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }}>
                  Thử lại
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
