import { Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';

type Mood = 'happy' | 'cheer' | 'celebrate' | 'encourage';

const MOOD_BADGE: Record<Mood, { main: string; accent: string; bg: string; ring: string }> = {
  happy: { main: '🐟', accent: '✨', bg: '#FFEDD5', ring: '#FDBA74' },
  cheer: { main: '🐟', accent: '🎒', bg: '#FFEDD5', ring: '#FB923C' },
  celebrate: { main: '🐟', accent: '🎉', bg: '#FEF3C7', ring: '#FBBF24' },
  encourage: { main: '🐟', accent: '💪', bg: '#E0F2FE', ring: '#7DD3FC' },
};

/**
 * Linh vật Chép Con — đồng hành cùng học sinh Tiểu học (chế độ Nhí)
 * và xuất hiện làm biểu trưng thân thiện ở màn chào mừng.
 */
export function ChepCon({ mood = 'happy', size = 64 }: { mood?: Mood; size?: number }) {
  const m = MOOD_BADGE[mood];
  const badgeSize = Math.round(size * 0.42);
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: m.bg,
        borderWidth: 3,
        borderColor: m.ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: Math.round(size * 0.5) }}>{m.main}</Text>
      <View
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: m.ring,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: Math.round(badgeSize * 0.56) }}>{m.accent}</Text>
      </View>
    </View>
  );
}

/** Khung chào có Chép Con + bóng thoại thân thiện cho học sinh lớp 1–5. */
export function MascotBanner({ mood = 'happy', title, subtitle }: { mood?: Mood; title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing(2) }}>
      <ChepCon mood={mood} size={t.mode === 'nhi' ? 68 : 52} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: t.mode === 'nhi' ? t.font.body + 2 : t.font.body, fontWeight: '800', color: t.color.text, lineHeight: (t.mode === 'nhi' ? t.font.body + 2 : t.font.body) * 1.3 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: t.font.caption + 1, color: t.color.textMuted, lineHeight: (t.font.caption + 1) * 1.35 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
