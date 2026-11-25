import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/platform/theme';

/** Khung màn hình: nền theo chế độ, cuộn được, tránh bàn phím; nút chính đặt ở `footer` (vùng ngón cái). */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const t = useTheme();
  const pad = t.spacing(t.mode === 'nhi' ? 2 : 5);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: pad, gap: t.spacing(t.mode === 'nhi' ? 2 : 3), paddingBottom: pad + 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer && (
          <View
            style={{
              padding: pad,
              paddingTop: t.spacing(t.mode === 'nhi' ? 1.5 : 3),
              gap: t.spacing(2),
              backgroundColor: t.color.surface,
              borderTopWidth: 1,
              borderTopColor: t.color.border,
            }}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
