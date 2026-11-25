'use client';
import { STICKERS } from '@nopi/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChepConSvg, type ChepConMood } from './ChepConSvg';

const STICKER_META: Record<string, { mood: ChepConMood; badge: string; bg: string; border: string; text: string }> = {
  'gioi-lam': { mood: 'jump', badge: '👍', bg: '#FEF3C7', border: '#FBBF24', text: '#92400E' },
  'tuyet-voi': { mood: 'jump', badge: '🌟', bg: '#FFEDD5', border: '#FB923C', text: '#9A3412' },
  'co-len': { mood: 'cheer', badge: '💪', bg: '#E0F2FE', border: '#38BDF8', text: '#075985' },
  'chu-dep': { mood: 'wave', badge: '✍️', bg: '#FCE7F3', border: '#F472B6', text: '#9D174D' },
  'doc-hay': { mood: 'headphones', badge: '🎤', bg: '#DCFCE7', border: '#4ADE80', text: '#166534' },
};

/** Huy hiệu Sticker Chép Con (mục 7.7) — khen thưởng ấm áp, không so sánh giữa các em. */
export function StickerBadge({ id, size = 'large' }: { id: string; size?: 'large' | 'small' }) {
  const s = STICKERS.find((x) => x.id === id);
  if (!s) return null;
  const m = STICKER_META[s.id] ?? STICKER_META['gioi-lam']!;
  const big = size === 'large';

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: big ? 8 : 4,
        padding: big ? '16px 22px' : '8px 12px',
        borderRadius: big ? 24 : 16,
        background: m.bg,
        border: `2.5px solid ${m.border}`,
        boxShadow: big ? '0 8px 20px -6px rgba(15,23,42,0.12)' : 'none',
      }}
    >
      <div style={{ position: 'relative' }}>
        <ChepConSvg size={big ? 66 : 38} mood={m.mood} />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -6,
            bottom: -4,
            fontSize: big ? 22 : 14,
            background: '#fff',
            borderRadius: 999,
            width: big ? 32 : 22,
            height: big ? 32 : 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${m.border}`,
          }}
        >
          {m.badge}
        </span>
      </div>
      <span style={{ fontWeight: 800, color: m.text, fontSize: big ? 17 : 12.5 }}>{s.label}</span>
    </div>
  );
}

/** Đọc tiếng Việt bằng trình duyệt (Web Speech API) cho trẻ lớp 1–2 chưa đọc thạo. */
export function useReadAloud(rate = 0.9) {
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
      if (speaking) {
        stop();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      u.rate = rate;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [rate, speaking, stop],
  );

  useEffect(() => stop, [stop]);
  return { speaking, speak, stop };
}

const CONFETTI_COLORS = ['#FF6B2B', '#FBBF24', '#38BDF8', '#4ADE80', '#F472B6', '#A78BFA'];

/** Hiệu ứng pháo giấy khi bé nộp bài xong (mục 6.2). */
export function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="confetti-layer" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 7) * 0.08}s`,
            animationDuration: `${1.5 + (i % 4) * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Cổng phụ huynh (mục 4): giải phép nhân để thoát chế độ học sinh, tránh trẻ vô tình bấm ra ngoài. */
export function ParentGateModal({
  open,
  onPass,
  onClose,
}: {
  open: boolean;
  onPass: () => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);
  const [a, b] = useMemo(() => {
    void open;
    return [6 + Math.floor(Math.random() * 4), 6 + Math.floor(Math.random() * 4)] as const;
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (Number(answer) === a * b) {
      setAnswer('');
      setError(false);
      onPass();
    } else {
      setError(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cổng phụ huynh"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div className="card stack" style={{ width: '100%', maxWidth: 400, padding: 28, borderRadius: 26, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: '#FFEDD5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            🔒
          </span>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Dành cho bố mẹ</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Giải phép tính nhanh để thoát chế độ học sinh</p>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0', borderRadius: 16, background: '#F8FAFC', border: '1.5px solid #E2E8F0', fontSize: 30, fontWeight: 800 }}>
          {a} × {b} = ?
        </div>

        <label>
          Nhập kết quả
          <input
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value.replace(/\D/g, ''));
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            inputMode="numeric"
            maxLength={3}
            placeholder="Ví dụ: 42"
            autoFocus
          />
        </label>
        {error && <div className="error">Chưa đúng, thử lại nhé!</div>}

        <div className="row" style={{ justifyContent: 'stretch' }}>
          <button onClick={onClose} style={{ flex: 1 }}>Quay lại</button>
          <button className="primary" onClick={submit} disabled={!answer} style={{ flex: 1 }}>Xác nhận</button>
        </div>
      </div>
    </div>
  );
}
