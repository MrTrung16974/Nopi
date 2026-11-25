import { inboxSchema, type NotificationDto } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { routeForNotification } from '@/platform/push';
import { ThemeProvider, useTheme } from '@/platform/theme';

/** Hộp thư thông báo của phụ huynh / giáo viên. */
function Inbox() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['inbox'], queryFn: () => api('/me/notifications', { schema: inboxSchema }) });
  const open = async (n: NotificationDto) => {
    if (!n.readAt) {
      await api('/me/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    }
    const target = routeForNotification({ ...n.data, template: n.template }, 'adult');
    if (target) router.push(target as never);
  };
  return (
    <Screen>
      <SecondaryButton icon="⚙️" label={vi.notify.settings} onPress={() => router.push('/phu-huynh/cai-dat-thong-bao')} />
      {q.data && q.data.unread > 0 && (
        <SecondaryButton
          label={vi.notify.markAllRead}
          onPress={async () => {
            await api('/me/notifications/read', { method: 'POST', body: { all: true } });
            void qc.invalidateQueries({ queryKey: ['inbox'] });
          }}
        />
      )}
      {q.data?.items.length === 0 && <T variant="muted">{vi.notify.empty}</T>}
      {q.data?.items.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          onPress={() => open(n)}
          style={{ backgroundColor: n.readAt ? t.color.surface : '#FFF7ED', borderRadius: t.radius.card, borderWidth: 1, borderColor: n.readAt ? t.color.border : '#FDBA74', padding: t.spacing(4), gap: 4 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T style={{ fontWeight: n.readAt ? '500' : '800', flex: 1 }}>{n.title}</T>
            <T variant="muted">{new Date(n.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</T>
          </View>
          <T variant="muted">{n.body}</T>
        </Pressable>
      ))}
    </Screen>
  );
}

export default function InboxScreen() {
  return (
    <ThemeProvider mode="adult">
      <Inbox />
    </ThemeProvider>
  );
}
