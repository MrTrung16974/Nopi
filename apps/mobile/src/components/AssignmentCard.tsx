import type { StudentAssignmentItem } from '@nopi/contracts';
import { friendlyDue, vi } from '@nopi/copy';
import { subjectIcon } from '@nopi/ui';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';
import { StatusBadge } from './StatusBadge';
import { T } from './Text';

/** Thẻ bài tập: biểu tượng + màu môn ở viền trái, tên rõ ràng, trạng thái và hạn nộp đời thường. */
export function AssignmentCard({
  item,
  audience,
  onPress,
}: {
  item: StudentAssignmentItem;
  audience: 'student' | 'guardian';
  onPress: () => void;
}) {
  const t = useTheme();
  const isNhi = t.mode === 'nhi';
  const showDue = !item.isPractice && (item.status === 'assigned' || item.status === 'returned' || item.status === 'overdue');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.subject.shortName}: ${item.title}, ${vi.status[audience][item.status]}`}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: t.color.surface,
        borderRadius: t.radius.card,
        borderWidth: 1,
        borderColor: t.color.border,
        borderLeftWidth: isNhi ? 8 : 6,
        borderLeftColor: item.subject.color,
        padding: t.spacing(isNhi ? 2 : 4),
        gap: isNhi ? 10 : 8,
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
        minHeight: t.touch.primary,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <View
            accessibilityElementsHidden
            style={{
              width: isNhi ? 34 : 26,
              height: isNhi ? 34 : 26,
              borderRadius: isNhi ? 10 : 8,
              backgroundColor: `${item.subject.color}1A`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: isNhi ? 18 : 14 }}>{subjectIcon(item.subject.icon)}</Text>
          </View>
          <T variant="muted" style={{ fontWeight: '700', color: t.color.textMuted }}>
            {item.subject.shortName}
          </T>
          {(item.fromFamily || item.isPractice) && (
            <View style={{ backgroundColor: t.color.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ fontSize: t.font.caption - 1, fontWeight: '700', color: '#9A3412' }}>{item.isPractice ? vi.scan.practiceLabel : vi.parentAssignedLabel}</Text>
            </View>
          )}
        </View>
        {item.isLate && (
          <View style={{ backgroundColor: t.color.warningSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ fontSize: t.font.caption - 1, fontWeight: '700', color: t.color.warning }}>{vi.lateLabel}</Text>
          </View>
        )}
      </View>

      <T style={{ fontWeight: '800', fontSize: isNhi ? t.font.body + 1 : t.font.body + 1, lineHeight: (t.font.body + 1) * 1.35 }}>
        {item.title}
      </T>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {item.isPractice && item.status === 'submitted' ? (
          <T style={{ color: '#166534', fontWeight: '700' }}>✅ {vi.scan.done}</T>
        ) : (
          <StatusBadge status={item.status} audience={audience} />
        )}
        {showDue && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text accessibilityElementsHidden style={{ fontSize: t.font.caption }}>🕒</Text>
            <T variant="muted" style={{ fontWeight: '600' }}>
              {friendlyDue(new Date(item.dueAt), new Date())}
            </T>
          </View>
        )}
      </View>
    </Pressable>
  );
}
