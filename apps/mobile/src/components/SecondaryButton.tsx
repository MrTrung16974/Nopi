import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';

export function SecondaryButton({
  label,
  icon,
  tone = 'default',
  onPress,
  disabled,
}: {
  label: string;
  icon?: string;
  tone?: 'default' | 'accent' | 'danger';
  onPress?: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const isNhi = t.mode === 'nhi';
  const palette =
    tone === 'accent'
      ? { bg: t.color.accentSoft, border: '#7DD3FC', text: '#075985' }
      : tone === 'danger'
        ? { bg: t.color.dangerSoft, border: '#FCA5A5', text: t.color.danger }
        : { bg: t.color.surface, border: t.color.border, text: t.color.text };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: t.touch.min,
        borderRadius: t.radius.button,
        borderWidth: isNhi ? 2 : 1.5,
        borderBottomWidth: isNhi ? 4 : 2,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.spacing(3),
        paddingVertical: t.spacing(1),
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ translateY: pressed && !disabled ? 1 : 0 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {icon ? <Text accessibilityElementsHidden style={{ fontSize: t.font.body + 1 }}>{icon}</Text> : null}
        <Text style={{ color: palette.text, fontSize: t.font.body, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
      </View>
    </Pressable>
  );
}
