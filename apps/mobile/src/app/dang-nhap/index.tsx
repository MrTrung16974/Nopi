import { otpRequestResponseSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ChepCon } from '@/components/ChepCon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

function PhoneStep() {
  const t = useTheme();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api('/auth/otp/request', { method: 'POST', body: { phone }, as: 'none', schema: otpRequestResponseSchema });
      router.push({ pathname: '/dang-nhap/otp', params: { phone, masked: r.maskedPhone } });
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <PrimaryButton icon="📲" label={vi.auth.getCode} onPress={submit} loading={loading} disabled={phone.replace(/\D/g, '').length < 10} />
          <Link href="/dang-nhap/hoc-sinh" asChild>
            <SecondaryButton icon="🎒" tone="accent" label={vi.auth.childLogin} />
          </Link>
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 8 }}>
        <ChepCon mood="happy" size={84} />
        <T variant="title" style={{ textAlign: 'center' }}>{vi.auth.welcome}</T>
        <T variant="muted" style={{ textAlign: 'center' }}>{vi.auth.tagline}</T>
      </View>

      <View
        style={{
          backgroundColor: t.color.surface,
          borderRadius: t.radius.card,
          borderWidth: 1,
          borderColor: t.color.border,
          padding: t.spacing(4),
          gap: 12,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 1,
        }}
      >
        <TextField
          label={vi.auth.phoneLabel}
          placeholder={vi.auth.phonePlaceholder}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          value={phone}
          onChangeText={setPhone}
          onSubmitEditing={submit}
          error={error}
        />
        <T variant="muted">Chúng tôi sẽ gửi mã 6 số qua Zalo hoặc tin nhắn để đăng nhập không cần mật khẩu.</T>
      </View>
    </Screen>
  );
}

export default function LoginScreen() {
  return (
    <ThemeProvider mode="adult">
      <PhoneStep />
    </ThemeProvider>
  );
}
