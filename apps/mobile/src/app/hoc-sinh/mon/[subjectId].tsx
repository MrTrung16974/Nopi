import { studentAssignmentItemSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { z } from 'zod';
import { AssignmentCard } from '@/components/AssignmentCard';
import { MascotBanner } from '@/components/ChepCon';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { useSession } from '@/platform/session';
import { useStudentMode } from '@/platform/student-mode';
import { ThemeProvider, useTheme } from '@/platform/theme';

function SubjectBody({ subjectId }: { subjectId: string }) {
  const t = useTheme();
  const { student } = useSession();
  const work = useQuery({
    queryKey: ['student', 'assignments', student?.student.id],
    queryFn: () => api('/student/assignments', { as: 'student', schema: z.array(studentAssignmentItemSchema) }),
  });
  const items = (work.data ?? []).filter((i) => String(i.subject.id) === subjectId);
  const todo = items.filter((i) => i.status === 'assigned' || i.status === 'returned' || i.status === 'overdue');
  const done = items.filter((i) => i.status === 'submitted' || i.status === 'graded');
  const open = (id: string) => router.push({ pathname: '/bai/[id]', params: { id, as: 'student' } });

  return (
    <Screen>
      {work.isLoading && <ActivityIndicator color={t.color.primary} />}
      {items.length === 0 && !work.isLoading && (
        <View
          style={{
            backgroundColor: t.color.surface,
            borderRadius: t.radius.card,
            borderWidth: 1,
            borderColor: t.color.border,
            padding: t.spacing(t.mode === 'nhi' ? 3 : 5),
          }}
        >
          {t.showMascot ? (
            <MascotBanner mood="happy" title={vi.work.noWork} subtitle="Khi nào cô giao bài mới, bài sẽ hiện ngay ở đây nhé!" />
          ) : (
            <T variant="muted">{vi.work.noWork}</T>
          )}
        </View>
      )}

      {todo.length > 0 && (
        <View style={{ gap: t.spacing(t.mode === 'nhi' ? 1.5 : 3) }}>
          <T style={{ fontWeight: '800' }}>🎒 Cần làm ({todo.length})</T>
          {todo.map((i) => (
            <AssignmentCard key={i.id} item={i} audience="student" onPress={() => open(i.id)} />
          ))}
        </View>
      )}

      {done.length > 0 && (
        <View style={{ gap: t.spacing(t.mode === 'nhi' ? 1.5 : 3), marginTop: todo.length > 0 ? t.spacing(1) : 0 }}>
          <T style={{ fontWeight: '800', color: t.color.textMuted }}>✅ Đã nộp & đã chấm ({done.length})</T>
          {done.map((i) => (
            <AssignmentCard key={i.id} item={i} audience="student" onPress={() => open(i.id)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

/** Danh sách bài của một môn: tách rõ bài cần làm lên trên, bài đã nộp/đã chấm ở dưới. */
export default function SubjectScreen() {
  const { subjectId, name } = useLocalSearchParams<{ subjectId: string; name: string }>();
  const mode = useStudentMode();
  return (
    <ThemeProvider mode={mode}>
      <Stack.Screen options={{ title: name ?? '' }} />
      <SubjectBody subjectId={subjectId} />
    </ThemeProvider>
  );
}
