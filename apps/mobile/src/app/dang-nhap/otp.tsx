import { otpRequestResponseSchema, userAuthResponseSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { session } from '@/platform/session';
import { ThemeProvider } from '@/platform/theme';

const RESEND_AFTER = 60;

function OtpStep() {
  const { phone, masked } = useLocalSearchParams<{ phone: string; masked: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const verify = async (value = code) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api('/auth/otp/verify', { method: 'POST', body: { phone, code: value }, as: 'none', schema: userAuthResponseSchema });
      await session.setAdult({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user });
      router.replace(r.user.needsProfile ? '/dang-nhap/ten' : '/phu-huynh');
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone }, as: 'none', schema: otpRequestResponseSchema });
      setWait(RESEND_AFTER);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    }
  };

  return (
    <Screen
      footer={
        <>
          <PrimaryButton label={vi.auth.confirm} onPress={() => verify()} loading={loading} disabled={code.length !== 6} />
          <SecondaryButton label={wait > 0 ? vi.auth.resendIn(wait) : vi.auth.resend} onPress={resend} disabled={wait > 0} />
        </>
      }
    >
      <T variant="muted">{vi.auth.codeSentTo(masked ?? '')}</T>
      <TextField
        label={vi.auth.codeLabel}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        autoFocus
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '');
          setCode(digits);
          if (digits.length === 6) void verify(digits); // đủ 6 số thì tự xác nhận
        }}
        error={error}
      />
    </Screen>
  );
}

export default function OtpScreen() {
  return (
    <ThemeProvider mode="adult">
      <OtpStep />
    </ThemeProvider>
  );
}
