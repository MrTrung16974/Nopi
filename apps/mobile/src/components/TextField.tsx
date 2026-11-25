import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/platform/theme';
import { T } from './Text';

export function TextField({ label, error, onFocus, onBlur, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T variant="muted" style={{ fontWeight: '600', color: t.color.text }}>
        {label}
      </T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#94A3B8"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          minHeight: t.touch.min + 4,
          borderWidth: focused || error ? 2 : 1.5,
          borderColor: error ? t.color.danger : focused ? t.color.primary : t.color.border,
          borderRadius: t.radius.button > 100 ? 18 : t.radius.button,
          backgroundColor: t.color.surface,
          paddingHorizontal: 16,
          fontSize: t.font.body + 1,
          color: t.color.text,
        }}
        {...props}
      />
      {error ? <T variant="error">{error}</T> : null}
    </View>
  );
}
