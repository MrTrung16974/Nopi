import { familySpaceSchema, type FamilySpaceDto } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { api, ApiError } from '@/platform/api';
import { useTheme } from '@/platform/theme';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';
import { T } from './Text';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export function entitlementLine(space: FamilySpaceDto) {
  const e = space.entitlement;
  if (!e.active) return vi.family.expired;
  if (e.status === 'trial') return vi.family.trialUntil(fmt(e.currentPeriodEnd));
  if (e.status === 'canceled') return vi.family.canceledUntil(fmt(e.currentPeriodEnd));
  return vi.family.activeUntil(e.planName ?? '', fmt(e.currentPeriodEnd));
}

/**
 * Không gian gia đình trên trang phụ huynh. Trong app KHÔNG có nút mua hay link ra web để mua
 * (quy định App Store 3.1.1 / Google Play): mua trong app sẽ dùng in-app purchase; mua trên web vẫn mở quyền ở đây.
 */
export function FamilyCard() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['family'], queryFn: () => api('/family-spaces/mine', { schema: z.object({ space: familySpaceSchema.nullable() }) }) });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const space = q.data?.space;

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      await api('/family-spaces', { method: 'POST', schema: familySpaceSchema });
      await Promise.all(['family', 'teacher', 'me'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (q.isLoading) return null;
  return (
    <View style={{ backgroundColor: '#FFF7ED', borderRadius: t.radius.card, borderWidth: 1, borderColor: '#FED7AA', padding: t.spacing(4), gap: t.spacing(2) }}>
      <T style={{ fontWeight: '800' }}>🏠 {vi.family.title}</T>
      {!space ? (
        <>
          <T variant="muted">{vi.family.pitch}</T>
          <PrimaryButton label={vi.family.startTrial} onPress={start} loading={loading} />
        </>
      ) : (
        <>
          <T variant={space.entitlement.active ? 'muted' : 'error'}>{entitlementLine(space)}</T>
          {space.entitlement.active && space.children.length > 0 && <PrimaryButton label={vi.family.assignForChild} onPress={() => router.push('/giao-vien')} />}
          <SecondaryButton label={vi.family.addChild} onPress={() => router.push({ pathname: '/phu-huynh/them-con-gia-dinh', params: { spaceId: space.id } })} />
        </>
      )}
      {error && <T variant="error">{error}</T>}
    </View>
  );
}
