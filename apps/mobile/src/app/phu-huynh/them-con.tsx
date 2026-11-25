import { childSchema, RELATIONSHIP_LABELS, RELATIONSHIPS } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { CURRENT_POLICY_VERSION } from '@nopi/domain';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QrScanner } from '@/components/QrScanner';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

type Relationship = (typeof RELATIONSHIPS)[number];

/** Thêm con bằng phiếu mời (quét QR hoặc gõ mã) + chọn quan hệ + đồng ý điều khoản. */
function AddChild() {
  const t = useTheme();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(true);
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api('/me/children/claim', {
        method: 'POST',
        body: { code, relationship, acceptPolicyVersion: CURRENT_POLICY_VERSION },
        schema: childSchema,
      });
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      footer={
        <PrimaryButton
          label={vi.parent.addChild}
          onPress={submit}
          loading={loading}
          disabled={code.replace(/\W/g, '').length < 10 || !relationship || !agreed}
        />
      }
    >
      {scanning ? (
        <>
          <T style={{ fontWeight: '700' }}>{vi.parent.scanInvite}</T>
          <QrScanner
            accept={['invite']}
            onScanned={(qr) => {
              if (qr.kind === 'invite') setCode(qr.code);
              setScanning(false);
            }}
          />
          <SecondaryButton label={vi.parent.typeInvite} onPress={() => setScanning(false)} />
        </>
      ) : (
        <TextField
          label={vi.parent.typeInvite}
          placeholder={vi.parent.invitePlaceholder}
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
        />
      )}

      <T style={{ fontWeight: '700' }}>{vi.parent.relationship}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {RELATIONSHIPS.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: relationship === r }}
            onPress={() => setRelationship(r)}
            style={{
              minHeight: t.touch.min,
              paddingHorizontal: 16,
              borderRadius: 999,
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: relationship === r ? t.color.primary : t.color.border,
              backgroundColor: relationship === r ? '#FFEDD5' : t.color.surface,
            }}
          >
            <T>{RELATIONSHIP_LABELS[r]}</T>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => setAgreed((a) => !a)}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.border }}
      >
        <View style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: t.color.primary, backgroundColor: agreed ? t.color.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {agreed && <T style={{ color: '#fff', fontWeight: '700' }}>✓</T>}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T style={{ fontWeight: '700' }}>{vi.parent.consentTitle}</T>
          <T variant="muted">{vi.parent.consentText}</T>
        </View>
      </Pressable>
      {error ? <T variant="error">{error}</T> : null}
    </Screen>
  );
}

export default function AddChildScreen() {
  return (
    <ThemeProvider mode="adult">
      <AddChild />
    </ThemeProvider>
  );
}
