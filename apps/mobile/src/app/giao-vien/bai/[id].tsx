import { gradingRowSchema, remindResultSchema, teacherAssignmentSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { z } from 'zod';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { Screen } from '@/components/Screen';
import { StatusBadge } from '@/components/StatusBadge';
import { T } from '@/components/Text';
import { api, ApiError } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

/** Lưới bài nộp (mục 6.3): ảnh thu nhỏ, tên em, trạng thái — "Chờ chấm" lên đầu. */
function GradingGrid() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = useQuery({ queryKey: ['assignment', id], queryFn: () => api(`/assignments/${id}`, { schema: teacherAssignmentSchema }) });
  const rows = useQuery({ queryKey: ['assignment', id, 'grading'], queryFn: () => api(`/assignments/${id}/submissions`, { schema: z.array(gradingRowSchema) }) });
  const waiting = rows.data?.filter((r) => r.status === 'submitted').length ?? 0;
  const missing = rows.data?.filter((r) => r.status === 'assigned' || r.status === 'overdue' || r.status === 'returned').length ?? 0;
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const remind = async () => {
    try {
      const r = await api(`/assignments/${id}/remind`, { method: 'POST', schema: remindResultSchema });
      setRemindMsg(vi.notify.reminded(r.reminded));
    } catch (e) {
      setRemindMsg(e instanceof ApiError ? e.friendly : String(e));
    }
  };
  return (
    <Screen footer={waiting > 0 ? <PrimaryButton label={`${vi.teacher.grade} (${waiting})`} onPress={() => router.push({ pathname: '/giao-vien/cham/[id]', params: { id } })} /> : undefined}>
      <Stack.Screen options={{ title: a.data ? `${a.data.subject.shortName} ${a.data.class.name}` : '' }} />
      {a.data && (
        <View style={{ gap: 4 }}>
          <T variant="title">{a.data.title}</T>
          <T variant="muted">{vi.teacher.submittedOf(a.data.stats.total - a.data.stats.notSubmitted, a.data.stats.total)} · nộp muộn {a.data.stats.late}</T>
        </View>
      )}
      {missing > 0 && <SecondaryButton label={vi.notify.remindButton(missing)} onPress={remind} />}
      {remindMsg && <T variant="muted">{remindMsg}</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {rows.data?.map((r) => {
          const thumb = r.latest?.media.find((m) => m.thumbnailUrl || (m.kind === 'photo' && m.url));
          return (
            <Pressable
              key={r.studentAssignmentId}
              accessibilityRole="button"
              accessibilityLabel={`${r.student.fullName}, ${vi.status.teacher[r.status]}`}
              onPress={() => r.latest && router.push({ pathname: '/giao-vien/cham/[id]', params: { id, start: r.studentAssignmentId } })}
              style={{ width: '47%', backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, overflow: 'hidden' }}
            >
              <View style={{ height: 100, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                {thumb ? <Image source={{ uri: thumb.thumbnailUrl ?? thumb.url! }} style={{ width: '100%', height: '100%' }} /> : <T style={{ fontSize: 28 }}>{r.latest ? (r.latest.media[0]?.kind === 'audio' ? '🎙️' : '🎬') : '—'}</T>}
              </View>
              <View style={{ padding: 10, gap: 6 }}>
                <T style={{ fontWeight: '700' }}>{r.student.fullName}</T>
                <StatusBadge status={r.status} audience="teacher" />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

export default function Route() {
  return (
    <ThemeProvider mode="adult">
      <GradingGrid />
    </ThemeProvider>
  );
}
