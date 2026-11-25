import { studentAuthResponseSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MascotBanner } from '@/components/ChepCon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QrScanner } from '@/components/QrScanner';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { session } from '@/platform/session';
import { ThemeProvider, useTheme } from '@/platform/theme';

type Mode = 'scan' | 'type' | 'pin';

/**
 * Học sinh tự đăng nhập trên máy riêng/máy tính bảng:
 * quét thẻ QR cô phát, gõ mã trên thẻ, hoặc (lớp 4–9) mã học sinh + PIN.
 */
function StudentLogin() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>('scan');
  const [card, setCard] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async (path: string, body: unknown) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api(path, { method: 'POST', body, as: 'none', schema: studentAuthResponseSchema });
      await session.setStudent({ accessToken: r.accessToken, refreshToken: r.refreshToken, student: r.student, viaGuardian: false });
      router.replace('/hoc-sinh');
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  const tabs: [Mode, string, string][] = [
    ['scan', '📷', vi.student.scanCard],
    ['type', '⌨️', vi.student.typeCard],
    ['pin', '🔑', vi.student.codeAndPin],
  ];

  return (
    <Screen
      footer={
        mode === 'type' ? (
          <PrimaryButton icon="🚀" label={vi.student.enter} loading={loading} disabled={card.replace(/\W/g, '').length < 10} onPress={() => login('/auth/student/card', { code: card })} />
        ) : mode === 'pin' ? (
          <PrimaryButton icon="🚀" label={vi.student.enter} loading={loading} disabled={code.length !== 8 || pin.length !== 6} onPress={() => login('/auth/student/pin', { studentCode: code, pin })} />
        ) : undefined
      }
    >
      <View
        style={{
          backgroundColor: '#FFF7ED',
          borderWidth: 1,
          borderColor: '#FED7AA',
          borderRadius: t.radius.card,
          padding: t.spacing(4),
        }}
      >
        <MascotBanner
          mood="cheer"
          title="Chào con! Chọn cách vào học nhé"
          subtitle="Đưa thẻ QR cô giáo phát vào camera, hoặc nhập mã của con."
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: t.color.surfaceSoft,
          borderRadius: t.radius.button,
          padding: 4,
          gap: 4,
        }}
      >
        {tabs.map(([m, icon, label]) => {
          const active = m === mode;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setMode(m);
                setError(null);
              }}
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: t.radius.button - 2,
                backgroundColor: active ? t.color.surface : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
                paddingVertical: 6,
                gap: 2,
                shadowColor: '#0F172A',
                shadowOpacity: active ? 0.06 : 0,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: active ? 1 : 0,
              }}
            >
              <Text accessibilityElementsHidden style={{ fontSize: 18 }}>{icon}</Text>
              <Text
                numberOfLines={2}
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: '700',
                  color: active ? t.color.primary : t.color.textMuted,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'scan' && (
        <View style={{ borderRadius: t.radius.card, overflow: 'hidden' }}>
          <QrScanner accept={['student-card']} onScanned={(qr) => qr.kind === 'student-card' && login('/auth/student/card', { code: qr.code })} />
        </View>
      )}
      {mode === 'type' && (
        <View style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(4) }}>
          <TextField
            label={vi.student.typeCard}
            placeholder={vi.parent.invitePlaceholder}
            autoCapitalize="characters"
            autoCorrect={false}
            value={card}
            onChangeText={setCard}
          />
        </View>
      )}
      {mode === 'pin' && (
        <View style={{ backgroundColor: t.color.surface, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.border, padding: t.spacing(4), gap: 14 }}>
          <TextField label={vi.student.studentCode} placeholder="12345678" keyboardType="number-pad" maxLength={8} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} />
          <TextField label={vi.student.pin} placeholder="••••••" keyboardType="number-pad" maxLength={6} secureTextEntry value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} />
        </View>
      )}
      {error ? <T variant="error">{error}</T> : null}
    </Screen>
  );
}

export default function StudentLoginScreen() {
  return (
    <ThemeProvider mode="teen">
      <StudentLogin />
    </ThemeProvider>
  );
}
