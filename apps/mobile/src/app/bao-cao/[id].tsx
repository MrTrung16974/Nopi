import { reportJobSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { ThemeProvider } from '@/platform/theme';

/** Mở từ thông báo "Báo cáo đã sẵn sàng": lấy link tải mới (link cũ chỉ sống vài phút). */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['report', id],
    queryFn: () => api(`/reports/${id}`, { schema: reportJobSchema }),
    refetchInterval: (query) => (query.state.data?.status === 'queued' || query.state.data?.status === 'running' ? 2000 : false),
  });
  const job = q.data;
  return (
    <ThemeProvider mode="adult">
      <Stack.Screen options={{ title: vi.reports.childSection }} />
      <Screen>
        {q.isLoading && <ActivityIndicator />}
        {q.error && <T>{(q.error as Error).message}</T>}
        {job && (job.status === 'queued' || job.status === 'running') && <T variant="muted">{vi.reports.preparing}</T>}
        {job?.status === 'failed' && <T>{job.error ?? vi.reports.failed}</T>}
        {job?.status === 'done' && job.downloadUrl && (
          <>
            <T style={{ fontWeight: '700' }}>{job.fileName}</T>
            <PrimaryButton icon="📄" label={vi.reports.open} onPress={() => Linking.openURL(job.downloadUrl!)} />
          </>
        )}
        {job?.status === 'done' && !job.downloadUrl && <T variant="muted">{vi.reports.expired}</T>}
      </Screen>
    </ThemeProvider>
  );
}
