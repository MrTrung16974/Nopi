import { ITEM_TYPE_LABELS, type AssignmentItemInput, type MediaView } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { Image, Linking, Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@/platform/theme';
import { T } from './Text';

export type ReviewItem = AssignmentItemInput & { key: string };

/** Soát lại đề AI đã đọc: ảnh gốc ở trên, các câu ở dưới (sửa, bỏ, đổi thứ tự); câu AI chưa chắc tô vàng. */
export function ScanReviewList({ originals, items, onChange }: { originals: MediaView[]; items: ReviewItem[]; onChange: (items: ReviewItem[]) => void }) {
  const t = useTheme();
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {originals.map((m, i) => (
          <Pressable key={m.id} accessibilityLabel={`Trang ${i + 1} (ảnh gốc)`} onPress={() => m.url && Linking.openURL(m.url)}>
            <Image source={{ uri: m.thumbnailUrl ?? m.url ?? undefined }} style={{ width: 90, height: 120, borderRadius: 8, backgroundColor: '#E2E8F0' }} />
          </Pressable>
        ))}
      </View>
      <T variant="muted">{vi.scan.reviewHint}</T>
      {items.map((it, i) => {
        const unsure = it.aiConfidence !== null && it.aiConfidence !== undefined && it.aiConfidence < 0.7;
        return (
          <View key={it.key} style={{ gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: unsure ? '#FACC15' : t.color.border, backgroundColor: unsure ? '#FEF9C3' : t.color.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={{ fontWeight: '700' }}>{vi.scan.question(i + 1)}</T>
              <T variant="muted">{ITEM_TYPE_LABELS[it.itemType]}</T>
              {unsure && <T style={{ color: '#713F12', fontWeight: '700' }}>· {vi.scan.unsure}</T>}
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Đưa câu ${i + 1} lên`} disabled={i === 0} onPress={() => move(i, -1)} style={{ padding: 6 }}><T>↑</T></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Đưa câu ${i + 1} xuống`} disabled={i === items.length - 1} onPress={() => move(i, 1)} style={{ padding: 6 }}><T>↓</T></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${vi.scan.remove} câu ${i + 1}`} onPress={() => onChange(items.filter((x) => x.key !== it.key))} style={{ padding: 6 }}><T variant="error">{vi.scan.remove}</T></Pressable>
            </View>
            <TextInput
              accessibilityLabel={`Nội dung câu ${i + 1}`}
              multiline
              value={it.promptText}
              onChangeText={(text) => onChange(items.map((x) => (x.key === it.key ? { ...x, promptText: text, aiConfidence: null } : x)))}
              style={{ fontSize: t.font.body, color: t.color.text, minHeight: 44, borderWidth: 1, borderColor: t.color.border, borderRadius: 8, padding: 8, backgroundColor: '#fff' }}
            />
            {it.options?.map((o, j) => <T key={j} variant="muted">{o}</T>)}
          </View>
        );
      })}
    </View>
  );
}
