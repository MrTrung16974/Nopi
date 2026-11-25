import { subjectIcon } from '@nopi/ui';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';

/**
 * Ô môn học.
 * - Nhí (lớp 1–5): nền màu tươi của môn, biểu tượng lớn, dễ chạm, chấm đỏ báo số bài chưa làm.
 * - Teen (lớp 6–9): nền trắng gọn gàng, viền màu môn bên trái, biểu tượng tinh tế.
 */
export function SubjectTile({
  subject,
  pending = 0,
  onPress,
}: {
  subject: { shortName: string; color: string; icon?: string | null };
  pending?: number;
  onPress?: () => void;
}) {
  const t = useTheme();
  const colorful = t.colorfulSubjects;
  const emoji = subjectIcon(subject.icon);

  const content = (
    <>
      {pending > 0 && (
        <View
          style={{
            position: 'absolute',
            top: colorful ? 10 : 8,
            right: colorful ? 10 : 8,
            minWidth: colorful ? 32 : 24,
            height: colorful ? 32 : 24,
            borderRadius: 999,
            backgroundColor: '#DC2626',
            borderWidth: 2,
            borderColor: '#FFFFFF',
            paddingHorizontal: 6,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: colorful ? 15 : 12 }}>{pending}</Text>
        </View>
      )}
      <View
        accessibilityElementsHidden
        style={{
          width: colorful ? 52 : 36,
          height: colorful ? 52 : 36,
          borderRadius: colorful ? 16 : 10,
          backgroundColor: colorful ? 'rgba(255,255,255,0.24)' : `${subject.color}18`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: colorful ? 12 : 8,
        }}
      >
        <Text style={{ fontSize: colorful ? 28 : 20 }}>{emoji}</Text>
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: colorful ? '#FFFFFF' : t.color.text,
          fontSize: colorful ? t.font.body : t.font.body - 1,
          fontWeight: '800',
          lineHeight: (colorful ? t.font.body : t.font.body - 1) * 1.25,
        }}
      >
        {subject.shortName}
      </Text>
    </>
  );

  const baseStyle = {
    flex: 1,
    minHeight: colorful ? 132 : 96,
    borderRadius: t.radius.card,
    padding: t.spacing(colorful ? 2 : 3),
    backgroundColor: colorful ? subject.color : t.color.surface,
    borderWidth: colorful ? 0 : 1,
    borderLeftWidth: colorful ? 0 : 5,
    borderBottomWidth: colorful ? 4 : 1,
    borderColor: colorful ? 'rgba(15,23,42,0.16)' : t.color.border,
    borderLeftColor: colorful ? 'rgba(15,23,42,0.16)' : subject.color,
    justifyContent: 'space-between' as const,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: colorful ? 4 : 2 },
    shadowOpacity: colorful ? 0.12 : 0.05,
    shadowRadius: colorful ? 8 : 4,
    elevation: colorful ? 3 : 1,
  };

  if (!onPress) {
    return <View style={baseStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pending > 0 ? `${subject.shortName}, ${pending} bài chưa làm` : subject.shortName}
      onPress={onPress}
      style={({ pressed }) => ({
        ...baseStyle,
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {content}
    </Pressable>
  );
}
