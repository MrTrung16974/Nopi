'use client';

export type ChepConMood = 'wave' | 'headphones' | 'swim' | 'jump' | 'cheer' | 'bubbles' | 'sleep';

/**
 * Linh vật Chép Con (mục 7.7): cá chép nhỏ màu cam đỏ, bụng màu kem, mắt to tròn.
 * Hỗ trợ đủ 7 trạng thái theo thiết kế: chào, đeo tai nghe đọc đề, bơi khi gửi, nhảy khi nộp xong,
 * giơ vây cổ vũ, thổi bong bóng khi hết bài, và ngủ trong vỏ sò sau 21:00.
 */
export function ChepConSvg({
  size = 64,
  mood = 'wave',
  className = '',
}: {
  size?: number;
  mood?: ChepConMood;
  className?: string;
}) {
  const animClass =
    mood === 'swim'
      ? 'chep-swim'
      : mood === 'jump'
        ? 'chep-jump'
        : mood === 'wave' || mood === 'cheer'
          ? 'chep-float'
          : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animClass} ${className}`.trim()}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="chep-bg" x1="8" y1="8" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={mood === 'sleep' ? '#E0E7FF' : '#FFF7ED'} />
          <stop offset="100%" stopColor={mood === 'sleep' ? '#C7D2FE' : '#FFEDD5'} />
        </linearGradient>
        <linearGradient id="chep-body" x1="22" y1="28" x2="78" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF8A3D" />
          <stop offset="55%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
        <linearGradient id="chep-fin" x1="58" y1="24" x2="88" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
      </defs>

      {/* Nền tròn */}
      <circle
        cx="52"
        cy="52"
        r="48"
        fill="url(#chep-bg)"
        stroke={mood === 'sleep' ? '#818CF8' : '#FDBA74'}
        strokeWidth="3.5"
      />

      {/* Sóng nước hoặc vỏ sò */}
      {mood === 'sleep' ? (
        <path
          d="M18 68C24 58 38 56 52 56C66 56 80 58 86 68C80 78 68 84 52 84C36 84 24 78 18 68Z"
          fill="#E0F2FE"
          stroke="#7DD3FC"
          strokeWidth="2.5"
        />
      ) : (
        <>
          <path
            d="M14 74C23 68 32 78 41 72C50 66 59 78 68 72C77 66 84 75 90 72"
            stroke="#38BDF8"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.75"
          />
          <path
            d="M24 82C33 78 42 85 52 81C62 77 71 84 80 81"
            stroke="#7DD3FC"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.7"
          />
        </>
      )}

      {/* Đuôi cá */}
      <path d="M69 52C77 41 87 38 90 43C85 49 85 55 90 61C86 66 76 62 69 52Z" fill="url(#chep-fin)" />

      {/* Vây lưng */}
      <path d="M43 34C50 22 61 23 66 34C58 36 50 36 43 34Z" fill="url(#chep-fin)" />

      {/* Thân Chép Con */}
      <ellipse cx="48" cy="52" rx="26" ry="19" fill="url(#chep-body)" />

      {/* Bụng kem */}
      <path d="M27 57C34 66 51 68 63 60C55 69 37 70 27 57Z" fill="#FEF3C7" opacity="0.92" />

      {/* Vây ngực (giơ cao nếu cổ vũ / chào) */}
      {mood === 'cheer' || mood === 'jump' ? (
        <path d="M44 49C40 39 45 33 50 36C51 42 49 47 44 49Z" fill="#FDE047" />
      ) : (
        <path d="M46 56C50 63 58 66 61 61C59 56 53 53 46 56Z" fill="#FDE047" />
      )}

      {/* Vảy trang trí nhẹ */}
      <path d="M51 45C54 47 54 51 51 53" stroke="#FFEDD5" strokeWidth="2.2" strokeLinecap="round" opacity="0.65" />
      <path d="M58 47C61 49 61 53 58 55" stroke="#FFEDD5" strokeWidth="2.2" strokeLinecap="round" opacity="0.65" />

      {/* Mắt */}
      {mood === 'sleep' ? (
        <path d="M30 48C33 51 37 51 40 48" stroke="#0F172A" strokeWidth="2.8" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="35" cy="48" r="6" fill="#FFFFFF" />
          <circle cx="34" cy="48" r="3.4" fill="#0F172A" />
          <circle cx="32.6" cy="46.4" r="1.3" fill="#FFFFFF" />
        </>
      )}

      {/* Má hồng & nụ cười */}
      <ellipse cx="38" cy="56" rx="3.8" ry="2.2" fill="#FDA4AF" opacity="0.9" />
      <path
        d={mood === 'jump' || mood === 'cheer' ? 'M25 54C28 59 33 59 36 55' : 'M26 55C28.5 58 32 58.5 34.5 56.5'}
        stroke="#7C2D12"
        strokeWidth="2.3"
        strokeLinecap="round"
      />

      {/* Phụ kiện theo mood */}
      {mood === 'headphones' && (
        <>
          <path d="M30 40C32 23 58 23 60 40" stroke="#0284C7" strokeWidth="4.5" strokeLinecap="round" />
          <rect x="25" y="38" width="9" height="14" rx="4.5" fill="#0EA5E9" stroke="#FFFFFF" strokeWidth="1.8" />
          <rect x="56" y="38" width="9" height="14" rx="4.5" fill="#0EA5E9" stroke="#FFFFFF" strokeWidth="1.8" />
        </>
      )}

      {mood === 'bubbles' && (
        <>
          <circle cx="19" cy="40" r="4.5" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="1.8" />
          <circle cx="14" cy="29" r="6" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="1.8" />
          <circle cx="25" cy="22" r="3.2" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="1.5" />
        </>
      )}

      {mood === 'jump' && (
        <>
          <path d="M77 20L79 25L84 27L79 29L77 34L75 29L70 27L75 25L77 20Z" fill="#FBBF24" />
          <path d="M22 22L23.5 25.5L27 27L23.5 28.5L22 32L20.5 28.5L17 27L20.5 25.5L22 22Z" fill="#F472B6" />
          <circle cx="84" cy="40" r="3" fill="#38BDF8" />
        </>
      )}

      {mood === 'sleep' && (
        <text x="66" y="31" fill="#4F46E5" fontSize="14" fontWeight="800" fontFamily="Nunito, sans-serif">
          Zzz
        </text>
      )}

      {(mood === 'wave' || mood === 'cheer' || mood === 'swim') && (
        <path d="M78 24L79.6 28.4L84 30L79.6 31.6L78 36L76.4 31.6L72 30L76.4 28.4L78 24Z" fill="#FBBF24" />
      )}
    </svg>
  );
}
