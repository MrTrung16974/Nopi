import { teacherAssignmentSchema } from '@nopi/contracts';
import { friendlyDue, vi } from '@nopi/copy';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

function TeachingScreen() {
  const t = useTheme();
  const { taId, name } = useLocalSearchParams<{ taId: string; name: string }>();
  const q = useQuery({ queryKey: ['teaching', taId, 'assignments'], queryFn: () => api(`/teaching/${taId}/assignments`, { schema: z.array(teacherAssignmentSchema) }) });
  return (
    <Screen footer={<PrimaryButton label={vi.teacher.newAssignment} onPress={() => router.push({ pathname: '/giao-vien/giao-bai', params: { taId } })} />}>
      <Stack.Screen options={{ title: name ?? '' }} />
      {q.data?.length === 0 && <T variant="muted">Chưa giao bài nào.</T>}
      {q.data?.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/giao-vien/bai/[id]', params: { id: a.id } })}
          style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, padding: t.spacing(4), gap: 4, borderWidth: 1, borderColor: t.color.border }}
        >
          <T style={{ fontWeight: '700' }}>{a.title}</T>
          <T variant="muted">
            {a.status === 'scheduled' ? `Hẹn giao ${new Date(a.publishAt).toLocaleString('vi-VN')}` : `${vi.teacher.submittedOf(a.stats.total - a.stats.notSubmitted, a.stats.total)} · ${friendlyDue(new Date(a.dueAt), new Date())}`}
          </T>
          {a.stats.submitted > 0 && (
            <View style={{ backgroundColor: '#DBEAFE', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
              <T style={{ color: '#1E40AF', fontWeight: '700' }}>Chờ chấm {a.stats.submitted}</T>
            </View>
          )}
        </Pressable>
      ))}
    </Screen>
  );
}

export default function Route() {
  return (
    <ThemeProvider mode="adult">
      <TeachingScreen />
    </ThemeProvider>
  );
}
