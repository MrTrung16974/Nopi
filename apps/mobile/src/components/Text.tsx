import type { ReactNode } from 'react';
import { Text as RNText, type TextStyle } from 'react-native';
import { useTheme } from '@/platform/theme';

type Variant = 'title' | 'body' | 'muted' | 'error';

export function T({ children, variant = 'body', style }: { children: ReactNode; variant?: Variant; style?: TextStyle }) {
  const t = useTheme();
  const base: Record<Variant, TextStyle> = {
    title: { fontSize: t.font.title, fontWeight: '700', color: t.color.text },
    body: { fontSize: t.font.body, color: t.color.text },
    muted: { fontSize: t.font.caption + 1, color: t.color.textMuted },
    error: { fontSize: t.font.caption + 1, color: '#B91C1C' },
  };
  return (
    <RNText accessibilityRole={variant === 'title' ? 'header' : undefined} style={[base[variant], style]}>
      {children}
    </RNText>
  );
}
