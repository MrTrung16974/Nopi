import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';

/** Nút hành động chính — cỡ tự đổi theo chế độ (Nhí ~2×2 cm, có gờ nổi dễ nhận biết để bấm). */
export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  icon?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const t = useTheme();
  const off = disabled || loading;
  const isNhi = t.mode === 'nhi';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: t.touch.primary,
        borderRadius: t.radius.button,
        backgroundColor: pressed && !off ? t.color.primaryDark : t.color.primary,
        borderBottomWidth: off ? 0 : pressed ? 1 : isNhi ? 5 : 3,
        borderBottomColor: t.color.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.spacing(3),
        paddingVertical: t.spacing(1),
        opacity: off ? 0.5 : 1,
        transform: [{ translateY: pressed && !off ? 2 : 0 }],
        shadowColor: t.color.primaryDark,
        shadowOffset: { width: 0, height: isNhi ? 4 : 2 },
        shadowOpacity: off ? 0 : 0.18,
        shadowRadius: isNhi ? 8 : 4,
        elevation: off ? 0 : isNhi ? 4 : 2,
      })}
    >
      {loading ? (
        <ActivityIndicator color={t.color.onPrimary} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {icon ? <Text accessibilityElementsHidden style={{ fontSize: isNhi ? t.font.body + 4 : t.font.body + 2 }}>{icon}</Text> : null}
          <Text style={{ color: t.color.onPrimary, fontSize: t.font.body, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
