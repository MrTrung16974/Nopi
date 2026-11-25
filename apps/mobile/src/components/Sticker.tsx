import { STICKERS } from '@nopi/domain';
import { Text, View } from 'react-native';

const EMOJI: Record<string, string> = { 'gioi-lam': '🐟👍', 'tuyet-voi': '🐟🌟', 'co-len': '🐟💪', 'chu-dep': '🐟✍️', 'doc-hay': '🐟🎤' };

/** Sticker Chép Con: huy hiệu khen thưởng ấm áp, không so sánh điểm số giữa các em. */
export function Sticker({ id, size = 'large' }: { id: string; size?: 'large' | 'small' }) {
  const s = STICKERS.find((x) => x.id === id);
  if (!s) return null;
  const big = size === 'large';
  return (
    <View
      accessibilityLabel={`Sticker ${s.label}`}
      style={{
        alignItems: 'center',
        gap: big ? 6 : 3,
        paddingHorizontal: big ? 20 : 10,
        paddingVertical: big ? 14 : 6,
        borderRadius: big ? 24 : 14,
        backgroundColor: '#FEF3C7',
        borderWidth: 2,
        borderColor: '#FCD34D',
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: big ? 44 : 22 }}>{EMOJI[s.id]}</Text>
      <Text style={{ fontWeight: '800', color: '#92400E', fontSize: big ? 18 : 12 }}>{s.label}</Text>
    </View>
  );
}
