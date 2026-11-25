import type { DisplayStatus, UiMode } from '@nopi/domain';

/**
 * Design tokens. Component KHÔNG viết cứng cỡ chữ/màu mà đọc từ themeFor(mode).
 * Thêm chế độ mới (vd. chế độ tương phản cao) = thêm một bộ token.
 * Đơn vị: dp (React Native) — web quy đổi 1dp = 1px.
 */
export interface Theme {
  mode: UiMode;
  font: { family: string; body: number; title: number; caption: number; lineHeight: number };
  /** Nút chính: Nhí ~2×2 cm (≈ 76dp), người lớn tối thiểu 48dp */
  touch: { primary: number; min: number };
  radius: { card: number; button: number };
  spacing: (n: number) => number;
  /** Tối đa số lựa chọn trên một màn (nguyên tắc "mỗi màn một việc") */
  maxChoicesPerScreen: number;
  showMascot: boolean;
  /** Nhí: mỗi môn một màu tươi. Teen/người lớn: màu trung tính, màu chỉ dùng cho trạng thái */
  colorfulSubjects: boolean;
  color: {
    bg: string;
    surface: string;
    surfaceSoft: string;
    text: string;
    textMuted: string;
    primary: string;
    primaryDark: string;
    primarySoft: string;
    onPrimary: string;
    accent: string;
    accentSoft: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    border: string;
  };
}

const neutral = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSoft: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#475569',
  primary: '#EA580C', // màu cam của Chép Con
  primaryDark: '#C2410C',
  primarySoft: '#FFEDD5',
  onPrimary: '#FFFFFF',
  accent: '#0284C7',
  accentSoft: '#E0F2FE',
  success: '#166534',
  successSoft: '#DCFCE7',
  warning: '#92400E',
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  border: '#E2E8F0',
};

export const themes: Record<UiMode, Theme> = {
  nhi: {
    mode: 'nhi',
    font: { family: 'Nunito', body: 20, title: 28, caption: 16, lineHeight: 1.4 },
    touch: { primary: 76, min: 64 },
    radius: { card: 24, button: 999 },
    spacing: (n) => n * 8,
    maxChoicesPerScreen: 3,
    showMascot: true,
    colorfulSubjects: true,
    color: { ...neutral, bg: '#FFF7ED', surfaceSoft: '#FFFAF0', border: '#FED7AA' },
  },
  teen: {
    mode: 'teen',
    font: { family: 'Be Vietnam Pro', body: 16, title: 22, caption: 13, lineHeight: 1.45 },
    touch: { primary: 56, min: 48 },
    radius: { card: 16, button: 12 },
    spacing: (n) => n * 4,
    maxChoicesPerScreen: 6,
    showMascot: false,
    colorfulSubjects: false,
    color: neutral,
  },
  adult: {
    mode: 'adult',
    font: { family: 'Be Vietnam Pro', body: 16, title: 22, caption: 13, lineHeight: 1.45 },
    touch: { primary: 52, min: 48 },
    radius: { card: 14, button: 12 },
    spacing: (n) => n * 4,
    maxChoicesPerScreen: 8,
    showMascot: false,
    colorfulSubjects: false,
    color: neutral,
  },
};

export const themeFor = (mode: UiMode): Theme => themes[mode];

/** Biểu tượng môn học theo danh mục GDPT 2018 — dùng chung cho app và web. */
export const SUBJECT_ICONS: Record<string, string> = {
  'book-open': '📖',
  calculator: '🔢',
  languages: '🔤',
  heart: '❤️',
  sprout: '🌱',
  search: '🔍',
  'flask-conical': '🧪',
  globe: '🌍',
  monitor: '💻',
  wrench: '🔧',
  volleyball: '⚽',
  music: '🎵',
  palette: '🎨',
  star: '⭐',
  'map-pin': '📍',
  type: '🗣️',
};

export const subjectIcon = (icon?: string | null): string => (icon && SUBJECT_ICONS[icon]) || '📚';

/**
 * Màu + biểu tượng trạng thái — thống nhất toàn app. Màu không bao giờ là tín hiệu duy nhất:
 * luôn đi kèm biểu tượng và chữ (WCAG). Màu chữ trên nền đạt AA (kiểm trong test).
 */
export const statusStyle: Record<DisplayStatus, { fg: string; bg: string; icon: string }> = {
  assigned: { fg: '#9A3412', bg: '#FFEDD5', icon: 'backpack' }, // Cam · chiếc cặp
  submitted: { fg: '#1E40AF', bg: '#DBEAFE', icon: 'hourglass' }, // Xanh dương · đồng hồ cát
  returned: { fg: '#6B21A8', bg: '#F3E8FF', icon: 'rotate-ccw' }, // Tím · mũi tên vòng
  graded: { fg: '#166534', bg: '#DCFCE7', icon: 'sticker' }, // Xanh lá · sticker
  overdue: { fg: '#991B1B', bg: '#FEE2E2', icon: 'alarm-clock' }, // Đỏ — chỉ giáo viên, phụ huynh
};
