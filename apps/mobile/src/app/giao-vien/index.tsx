import { teacherOverviewSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { subjectIcon } from '@nopi/ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

/** "Hôm nay" của giáo viên: Cần chấm N bài + các lớp–môn đang dạy. */
function TeacherHome() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['teacher', 'overview'], queryFn: () => api('/teacher/overview', { schema: teacherOverviewSchema }), refetchInterval: 60_000 });
  const first = q.data?.teaching[0];
  const toGrade = q.data?.toGrade ?? 0;

  return (
    <Screen footer={first ? <PrimaryButton icon="✏️" label={vi.teacher.newAssignment} onPress={() => router.push({ pathname: '/giao-vien/giao-bai', params: { taId: first.teachingAssignmentId } })} /> : undefined}>
      <View
        style={{
          backgroundColor: toGrade > 0 ? '#DBEAFE' : '#DCFCE7',
          borderWidth: 1,
          borderColor: toGrade > 0 ? '#93C5FD' : '#86EFAC',
          borderRadius: t.radius.card,
          padding: t.spacing(4),
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Text accessibilityElementsHidden style={{ fontSize: 32 }}>{toGrade > 0 ? '📝' : '🎉'}</Text>
        <View style={{ flex: 1 }}>
          <T style={{ fontSize: t.font.title, fontWeight: '800', color: toGrade > 0 ? '#1E3A8A' : '#166534' }}>
            {vi.teacher.toGrade(toGrade)}
          </T>
          <T variant="muted">{toGrade > 0 ? 'Chọn lớp bên dưới để chấm nhanh' : 'Tất cả bài nộp đã được chấm xong'}</T>
        </View>
      </View>

      <T style={{ fontWeight: '800' }}>🏫 {vi.teacher.myClasses}</T>
      {q.error && <T variant="error">{(q.error as Error).message}</T>}
      {q.data?.teaching.map((x) => (
        <Pressable
          key={x.teachingAssignmentId}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/giao-vien/lop/[taId]', params: { taId: x.teachingAssignmentId, name: `${x.subject.shortName} ${x.class.name}` } })}
          style={({ pressed }) => ({
            backgroundColor: t.color.surface,
            borderRadius: t.radius.card,
            borderWidth: 1,
            borderColor: t.color.border,
            borderLeftWidth: 6,
            borderLeftColor: x.subject.color,
            padding: t.spacing(4),
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: pressed ? 0.9 : 1,
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 5,
            elevation: 1,
          })}
        >
          <View
            accessibilityElementsHidden
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: `${x.subject.color}1A`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 22 }}>{subjectIcon(x.subject.icon)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontWeight: '800' }}>
              {x.subject.shortName} · Lớp {x.class.name}
            </T>
            <T variant="muted">
              {x.studentCount} em · {x.openAssignments} bài đang mở
            </T>
          </View>
          {x.toGrade > 0 && (
            <View style={{ backgroundColor: t.color.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <Text style={{ color: '#9A3412', fontWeight: '800', fontSize: 13 }}>Chờ chấm {x.toGrade}</Text>
            </View>
          )}
        </Pressable>
      ))}
      {q.data?.teaching.length === 0 && (
        <View style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(4) }}>
          <T variant="muted">Bạn chưa được phân công lớp nào. Nhờ quản trị trường phân công trên web nhé.</T>
        </View>
      )}
    </Screen>
  );
}

export default function TeacherHomeScreen() {
  return (
    <ThemeProvider mode="adult">
      <TeacherHome />
    </ThemeProvider>
  );
}
