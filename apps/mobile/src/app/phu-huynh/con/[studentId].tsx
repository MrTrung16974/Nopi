import { studentAssignmentItemSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { z } from 'zod';
import { AssignmentCard } from '@/components/AssignmentCard';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { monthRange, requestReport } from '@/platform/reports';
import { ThemeProvider, useTheme } from '@/platform/theme';

/** Phụ huynh tải báo cáo học tập của con (PDF) — xuất nền, mở link tải khi xong. */
function ChildReport({ studentId }: { studentId: string }) {
  const t = useTheme();
  const [state, setState] = useState<{ busy: boolean; text?: string; ok?: boolean; url?: string }>({ busy: false });
  const run = async (offset: 0 | -1) => {
    setState({ busy: true, text: vi.reports.preparing, ok: true });
    try {
      const job = await requestReport({ type: 'student', format: 'pdf', studentId, ...monthRange(offset) });
      if (job.status === 'done' && job.downloadUrl) {
        setState({ busy: false, url: job.downloadUrl });
        await Linking.openURL(job.downloadUrl);
      } else if (job.status === 'failed') setState({ busy: false, text: job.error ?? vi.reports.failed, ok: false });
      else setState({ busy: false, text: vi.reports.later, ok: true });
    } catch (e) {
      setState({ busy: false, text: (e as Error).message, ok: false });
    }
  };
  return (
    <View style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(4), gap: t.spacing(2), marginTop: t.spacing(2) }}>
      <T style={{ fontWeight: '800' }}>📄 {vi.reports.childSection}</T>
      <T variant="muted">{vi.reports.childHint}</T>
      <SecondaryButton tone="accent" label={vi.reports.thisMonth} disabled={state.busy} onPress={() => run(0)} />
      <SecondaryButton label={vi.reports.lastMonth} disabled={state.busy} onPress={() => run(-1)} />
      {state.text ? <T style={{ color: state.ok ? t.color.textMuted : '#B91C1C' }}>{state.text}</T> : null}
      {state.url ? <SecondaryButton label={vi.reports.open} onPress={() => Linking.openURL(state.url!)} /> : null}
    </View>
  );
}

/** Phụ huynh xem bài của con (thấy cả "quá hạn"), bấm vào để xem nhận xét hoặc nộp hộ. */
export default function ChildWorkScreen() {
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const q = useQuery({
    queryKey: ['child', studentId, 'assignments'],
    queryFn: () => api(`/me/children/${studentId}/assignments`, { schema: z.array(studentAssignmentItemSchema) }),
  });
  return (
    <ThemeProvider mode="adult">
      <Stack.Screen options={{ title: name ?? vi.work.seeWork }} />
      <Screen>
        {q.data?.length === 0 && <T variant="muted">{vi.work.noWork}</T>}
        {q.data?.map((i) => (
          <AssignmentCard key={i.id} item={i} audience="guardian" onPress={() => router.push({ pathname: '/bai/[id]', params: { id: i.id, as: 'adult' } })} />
        ))}
        <ChildReport studentId={studentId} />
      </Screen>
    </ThemeProvider>
  );
}
