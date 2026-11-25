import { vi } from '@nopi/copy';
import { statusStyle } from '@nopi/ui';
import { Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';

const ICON: Record<string, string> = { backpack: '🎒', hourglass: '⏳', 'rotate-ccw': '🔄', sticker: '⭐', 'alarm-clock': '⏰' };
type Status = keyof typeof statusStyle;

/** Trạng thái bài: màu + biểu tượng + chữ (không bao giờ chỉ dùng màu). */
export function StatusBadge({ status, audience }: { status: Status; audience: 'student' | 'guardian' | 'teacher' }) {
  const t = useTheme();
  const s = statusStyle[status];
  const isNhi = t.mode === 'nhi';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: s.bg,
        paddingHorizontal: isNhi ? 12 : 10,
        paddingVertical: isNhi ? 6 : 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <Text accessibilityElementsHidden style={{ fontSize: isNhi ? 16 : 13 }}>{ICON[s.icon]}</Text>
      <Text style={{ color: s.fg, fontWeight: '800', fontSize: t.font.caption }}>{vi.status[audience][status]}</Text>
    </View>
  );
}
