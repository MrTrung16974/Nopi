import { MUTABLE_TEMPLATES, notificationSettingsSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Switch, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

/** Bật/tắt từng loại thông báo. Loại đã tắt vẫn có trong hộp thư, chỉ không đẩy về máy / nhắn Zalo. */
function Settings() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-settings'], queryFn: () => api('/me/notification-settings', { schema: notificationSettingsSchema }) });
  const muted = new Set(q.data?.muted ?? []);
  const toggle = async (tpl: (typeof MUTABLE_TEMPLATES)[number], on: boolean) => {
    const next = on ? [...muted].filter((x) => x !== tpl) : [...muted, tpl];
    qc.setQueryData(['notification-settings'], { muted: next });
    await api('/me/notification-settings', { method: 'PUT', body: { muted: next }, schema: notificationSettingsSchema }).catch(() => qc.invalidateQueries({ queryKey: ['notification-settings'] }));
  };
  return (
    <Screen>
      <T variant="muted">{vi.notify.settingsHint}</T>
      {q.data &&
        MUTABLE_TEMPLATES.map((tpl) => (
          <View key={tpl} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(4) }}>
            <T style={{ flex: 1 }}>{vi.notify.templateLabels[tpl]}</T>
            <Switch accessibilityLabel={vi.notify.templateLabels[tpl]} value={!muted.has(tpl)} onValueChange={(on) => toggle(tpl, on)} trackColor={{ true: t.color.primary, false: t.color.border }} thumbColor="#FFFFFF" />
          </View>
        ))}
    </Screen>
  );
}

export default function NotificationSettingsScreen() {
  return (
    <ThemeProvider mode="adult">
      <Stack.Screen options={{ title: vi.notify.settings }} />
      <Settings />
    </ThemeProvider>
  );
}
