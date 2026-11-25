import { inboxSchema, meResponseSchema, mySchoolSchema, studentAuthResponseSchema, type ChildDto } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { CURRENT_POLICY_VERSION } from '@nopi/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import { FamilyCard } from '@/components/FamilyCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { T } from '@/components/Text';
import { api, ApiError } from '@/platform/api';
import { registerForPush, unregisterPush } from '@/platform/push';
import { session } from '@/platform/session';
import { ThemeProvider, useTheme } from '@/platform/theme';

const AVATAR_BG = ['#EA580C', '#2563EB', '#16A34A', '#7C3AED', '#DB2777', '#0D9488'];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_BG[Math.abs(hash) % AVATAR_BG.length]!;
}

function ChildCard({ child }: { child: ChildDto }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** "Cho con học": mở chế độ học sinh của bé ngay trên máy này. */
  const letStudy = async () => {
    setLoading(true);
    setError(null);
    try {
      if (child.needsConsent) {
        await api(`/me/children/${child.studentId}/consent`, { method: 'POST', body: { acceptPolicyVersion: CURRENT_POLICY_VERSION } });
        await qc.invalidateQueries({ queryKey: ['me'] });
      }
      const r = await api(`/me/children/${child.studentId}/session`, { method: 'POST', schema: studentAuthResponseSchema });
      await session.setStudent({ accessToken: r.accessToken, refreshToken: r.refreshToken, student: r.student, viaGuardian: true });
      router.replace('/hoc-sinh');
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  const displayName = child.nickname ?? child.fullName;
  const initial = displayName.trim().charAt(0).toUpperCase() || 'B';

  return (
    <View
      style={{
        backgroundColor: t.color.surface,
        borderRadius: t.radius.card,
        borderWidth: 1,
        borderColor: t.color.border,
        padding: t.spacing(4),
        gap: t.spacing(3),
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          accessibilityElementsHidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: avatarColor(child.studentId),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '800', fontSize: t.font.body + 2 }}>{displayName}</T>
          {child.nickname && <T variant="muted">{child.fullName}</T>}
        </View>
      </View>

      {child.needsConsent && (
        <View style={{ backgroundColor: t.color.warningSoft, borderRadius: 12, padding: 12 }}>
          <T variant="muted" style={{ color: t.color.warning }}>
            {vi.parent.needsConsent}: {vi.parent.consentText}
          </T>
        </View>
      )}

      <PrimaryButton
        icon="🎒"
        label={child.needsConsent ? `${vi.parent.agree} & ${vi.actions.letChildStudy}` : vi.actions.letChildStudy}
        onPress={letStudy}
        loading={loading}
      />
      <SecondaryButton
        icon="👀"
        label={vi.work.seeWork}
        onPress={() => router.push({ pathname: '/phu-huynh/con/[studentId]', params: { studentId: child.studentId, name: displayName } })}
      />
      {error ? <T variant="error">{error}</T> : null}
    </View>
  );
}

function ParentHome() {
  const t = useTheme();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api('/me', { schema: meResponseSchema }) });
  const schools = useQuery({ queryKey: ['me', 'schools'], queryFn: () => api('/me/schools', { schema: z.array(mySchoolSchema) }) });
  const isStaff = schools.data?.some((s) => s.roles.includes('teacher') || s.roles.includes('admin'));
  const ownsFamily = schools.data?.some((s) => s.roles.includes('guardian_owner'));
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api('/me/notifications', { schema: inboxSchema }), refetchInterval: 60_000 });
  useEffect(() => {
    void registerForPush('adult');
  }, []);

  const logout = async () => {
    await unregisterPush('adult');
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await session.setAdult(null);
    router.replace('/dang-nhap');
  };

  return (
    <Screen
      footer={
        <Link href="/phu-huynh/them-con" asChild>
          <PrimaryButton icon="➕" label={vi.parent.addChild} />
        </Link>
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <T variant="title">{me.data ? `Chào ${me.data.fullName.split(' ').pop()}!` : ' '}</T>
          <T variant="muted">Chọn bé để mở chế độ học sinh hoặc xem bài tập</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${vi.notify.inbox}${inbox.data?.unread ? `, ${inbox.data.unread} chưa đọc` : ''}`}
          onPress={() => router.push('/phu-huynh/thong-bao')}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: t.color.surface,
            borderWidth: 1,
            borderColor: t.color.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 20 }}>🔔</Text>
          {Boolean(inbox.data?.unread) && (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>{inbox.data!.unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <T style={{ fontWeight: '800' }}>👨‍👩‍👧‍👦 {vi.parent.myChildren}</T>
      {me.error ? <T variant="error">{(me.error as Error).message}</T> : null}
      {me.data?.children.length === 0 && (
        <View style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(4) }}>
          <T variant="muted">{vi.parent.noChildren}</T>
        </View>
      )}
      {me.data?.children.map((c) => <ChildCard key={c.studentId} child={c} />)}
      <FamilyCard />

      {(isStaff || ownsFamily) && (
        <View
          style={{
            gap: t.spacing(2.5),
            marginTop: t.spacing(1),
            backgroundColor: t.color.surface,
            borderRadius: t.radius.card,
            borderWidth: 1,
            borderColor: t.color.border,
            padding: t.spacing(4),
          }}
        >
          <T style={{ fontWeight: '800' }}>👩‍🏫 Thầy cô & quản lý</T>
          {schools.data?.map((s) => (
            <T key={s.id} variant="muted">
              {s.name} · {s.roles.map((r) => (r === 'admin' ? 'Quản trị' : r === 'teacher' ? 'Giáo viên' : 'Gia đình')).join(', ')}
            </T>
          ))}
          <PrimaryButton icon="📋" label={vi.teacher.today} onPress={() => router.push('/giao-vien')} />
          <Link href="/phu-huynh/dang-nhap-web" asChild>
            <SecondaryButton icon="💻" label={vi.parent.webLogin} />
          </Link>
        </View>
      )}

      <Pressable onPress={logout} accessibilityRole="button" style={{ paddingVertical: 12, alignSelf: 'center' }}>
        <T variant="muted" style={{ fontWeight: '600' }}>{vi.auth.logout}</T>
      </Pressable>
    </Screen>
  );
}

export default function ParentHomeScreen() {
  return (
    <ThemeProvider mode="adult">
      <ParentHome />
    </ThemeProvider>
  );
}
