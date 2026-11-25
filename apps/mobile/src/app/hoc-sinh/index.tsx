import { studentAssignmentItemSchema, type StudentAssignmentItem } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { uiModeOfGrade, type Grade } from '@nopi/domain';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { AssignmentCard } from '@/components/AssignmentCard';
import { MascotBanner } from '@/components/ChepCon';
import { ParentGate } from '@/components/ParentGate';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { ReadAloudButton } from '@/components/ReadAloudButton';
import { SubjectTile } from '@/components/SubjectTile';
import { T } from '@/components/Text';
import { api } from '@/platform/api';
import { registerForPush, unregisterPush } from '@/platform/push';
import { session, useSession } from '@/platform/session';
import { useStudentHome } from '@/platform/student-mode';
import { ThemeProvider, useTheme } from '@/platform/theme';

const isTodo = (i: StudentAssignmentItem) => i.status === 'assigned' || i.status === 'returned' || i.status === 'overdue';

/**
 * Trang chủ học sinh:
 * - Chế độ Nhí (lớp 1–5): Chép Con chào + loa đọc + nút "Làm ngay" rất to + lưới môn màu tươi có biểu tượng.
 * - Chế độ Teen (lớp 6–9): mặc định mở tab "Việc cần làm" theo hạn nộp, tab thứ hai là "Môn học".
 */
function Home({ home }: { home: NonNullable<ReturnType<typeof useStudentHome>['data']> }) {
  const t = useTheme();
  const isNhi = t.mode === 'nhi';
  const [gate, setGate] = useState(false);
  const [teenTab, setTeenTab] = useState<'todo' | 'subjects'>('todo');
  const { student } = useSession();
  const work = useQuery({
    queryKey: ['student', 'assignments', home.student.id],
    queryFn: () => api('/student/assignments', { as: 'student', schema: z.array(studentAssignmentItemSchema) }),
    refetchInterval: 60_000,
  });
  const todo = (work.data ?? []).filter(isTodo);
  const name = home.student.nickname ?? home.student.fullName.split(' ').pop()!;
  const classSummary = home.classes.map((c) => (c.schoolKind === 'family' ? vi.parentAssignedLabel : `Lớp ${c.name}`)).join(' · ');
  // Gộp theo môn: con học cả ở trường lẫn "Bố mẹ giao" thì vẫn chỉ một ô mỗi môn
  const subjects = [...new Map(home.classes.flatMap((c) => c.subjects).map((s) => [s.id, { ...s, key: String(s.id) }])).values()];
  const pendingOf = (subjectId: number) => todo.filter((i) => i.subject.id === subjectId).length;

  useEffect(() => {
    if (student && !student.viaGuardian) void registerForPush('student');
  }, [student]);

  const open = (i: StudentAssignmentItem) => router.push({ pathname: '/bai/[id]', params: { id: i.id, as: 'student' } });
  const openSubject = (s: { id: number; shortName: string }) =>
    router.push({ pathname: '/hoc-sinh/mon/[subjectId]', params: { subjectId: String(s.id), name: s.shortName } });

  const exit = async () => {
    setGate(false);
    const viaGuardian = student?.viaGuardian ?? false;
    if (!viaGuardian) await unregisterPush('student');
    await api('/auth/logout', { method: 'POST', as: 'student' }).catch(() => undefined);
    await session.setStudent(null);
    router.replace(viaGuardian && session.get().adult ? '/phu-huynh' : '/dang-nhap');
  };

  const heroTitle = home.classes.length === 0 ? vi.student.noClass : vi.todayCount(todo.length);
  const heroSubtitle = todo[0]
    ? `Bài gần hạn nhất: ${todo[0].subject.shortName} — ${todo[0].title}`
    : home.classes.length > 0
      ? 'Con đã hoàn thành hết bài rồi!'
      : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: t.spacing(isNhi ? 2 : 4),
          paddingVertical: t.spacing(isNhi ? 1.5 : 3),
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="title">{vi.greeting(name)}</T>
          {classSummary ? <T variant="muted">{classSummary}</T> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vi.student.exit}
          onPress={() => setGate(true)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            minHeight: 44,
            borderRadius: 999,
            backgroundColor: t.color.surface,
            borderWidth: 1,
            borderColor: t.color.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text accessibilityElementsHidden style={{ fontSize: 14 }}>🔒</Text>
          <Text style={{ color: t.color.textMuted, fontWeight: '700', fontSize: 14 }}>{vi.student.exit}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing(isNhi ? 2 : 4),
          paddingBottom: 36,
          gap: t.spacing(isNhi ? 2.5 : 4),
        }}
      >
        {/* Thẻ Hôm nay */}
        <View
          style={{
            backgroundColor: t.color.surface,
            borderRadius: t.radius.card,
            borderWidth: isNhi ? 2 : 1,
            borderColor: isNhi ? '#FDBA74' : t.color.border,
            padding: t.spacing(isNhi ? 2.5 : 4),
            gap: t.spacing(isNhi ? 2 : 3),
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.06,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          {t.showMascot ? (
            <MascotBanner mood={todo.length === 0 ? 'celebrate' : 'cheer'} title={heroTitle} subtitle={heroSubtitle} />
          ) : (
            <View style={{ gap: 4 }}>
              <T style={{ fontSize: t.font.body + 2, fontWeight: '800' }}>{heroTitle}</T>
              {heroSubtitle ? <T variant="muted">{heroSubtitle}</T> : null}
            </View>
          )}

          {isNhi && <ReadAloudButton text={heroSubtitle ? `${heroTitle}. ${heroSubtitle}` : heroTitle} label="Nghe đọc" />}

          {todo[0] && <PrimaryButton icon="🚀" label={vi.actions.doNow} onPress={() => open(todo[0]!)} />}
        </View>

        {/* Chế độ Teen (lớp 6–9): chuyển tab Việc cần làm / Môn học */}
        {!isNhi && (
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: t.color.surfaceSoft,
              borderRadius: t.radius.button,
              padding: 4,
              gap: 4,
            }}
          >
            {(
              [
                ['todo', `Việc cần làm${todo.length ? ` (${todo.length})` : ''}`],
                ['subjects', `Môn học (${subjects.length})`],
              ] as const
            ).map(([key, label]) => {
              const active = teenTab === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTeenTab(key)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: t.radius.button - 2,
                    backgroundColor: active ? t.color.surface : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#0F172A',
                    shadowOpacity: active ? 0.06 : 0,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: active ? 1 : 0,
                  }}
                >
                  <Text style={{ fontWeight: '700', fontSize: t.font.body - 1, color: active ? t.color.primary : t.color.textMuted }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Tab Việc cần làm cho Teen */}
        {!isNhi && teenTab === 'todo' && (
          <View style={{ gap: t.spacing(3) }}>
            {todo.length === 0 && !work.isLoading && (
              <View
                style={{
                  backgroundColor: t.color.surface,
                  borderRadius: t.radius.card,
                  borderWidth: 1,
                  borderColor: t.color.border,
                  padding: t.spacing(6),
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 36 }}>🎉</Text>
                <T style={{ fontWeight: '700', textAlign: 'center' }}>Không còn bài nào cần làm</T>
                <T variant="muted" style={{ textAlign: 'center' }}>
                  Bạn có thể sang tab «Môn học» để xem lại bài đã nộp và nhận xét của thầy cô.
                </T>
              </View>
            )}
            {todo.map((i) => (
              <AssignmentCard key={i.id} item={i} audience="student" onPress={() => open(i)} />
            ))}
            {/* Lớp 6–9 tự quét đề để luyện (không gửi thầy cô) */}
            <SecondaryButton label={vi.scan.practiceButton} onPress={() => router.push({ pathname: '/quet-de', params: { mode: 'practice' } })} />
          </View>
        )}

        {/* Lưới môn học: luôn hiện ở Nhí, hiện ở tab 2 của Teen */}
        {(isNhi || teenTab === 'subjects') && (
          <View style={{ gap: t.spacing(isNhi ? 1.5 : 3) }}>
            {isNhi && subjects.length > 0 && (
              <T style={{ fontWeight: '800', fontSize: t.font.body + 1 }}>📚 Môn học của con</T>
            )}
            {home.classes.length > 0 && subjects.length === 0 && <T variant="muted">{vi.student.noSubjects}</T>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing(isNhi ? 1.5 : 3) }}>
              {subjects.map((s) => (
                <View key={s.key} style={{ width: '48%' }}>
                  <SubjectTile subject={s} pending={pendingOf(s.id)} onPress={() => openSubject(s)} />
                </View>
              ))}
            </View>
          </View>
        )}

        {work.isLoading && <ActivityIndicator color={t.color.primary} style={{ marginTop: 12 }} />}
      </ScrollView>

      <ParentGate visible={gate} onPass={exit} onCancel={() => setGate(false)} />
    </SafeAreaView>
  );
}

export default function StudentHomeScreen() {
  const q = useStudentHome();
  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7ED' }}>
        <ActivityIndicator size="large" color="#EA580C" />
      </View>
    );
  }
  if (q.error || !q.data) {
    return (
      <ThemeProvider mode="nhi">
        <SafeAreaView style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: '#FFF7ED' }}>
          <T>{(q.error as Error | null)?.message ?? 'Có lỗi xảy ra'}</T>
          <PrimaryButton icon="🔄" label="Thử lại" onPress={() => q.refetch()} />
        </SafeAreaView>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider mode={q.data.grade ? uiModeOfGrade(q.data.grade as Grade) : 'nhi'}>
      <Home home={q.data} />
    </ThemeProvider>
  );
}
