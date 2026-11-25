import { userProfileSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { router } from 'expo-router';
import { useState } from 'react';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { session } from '@/platform/session';
import { ThemeProvider } from '@/platform/theme';

/** Đăng ký lần đầu bằng OTP: hỏi tên (để cô giáo biết ai là phụ huynh). */
function NameStep() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const user = await api('/me', { method: 'PATCH', body: { fullName: name }, schema: userProfileSchema });
      const adult = session.get().adult!;
      await session.setAdult({ ...adult, user });
      router.replace('/phu-huynh');
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen footer={<PrimaryButton label={vi.auth.save} onPress={save} loading={loading} disabled={name.trim().length < 2} />}>
      <T variant="title">{vi.auth.askName}</T>
      <TextField
        label="Họ và tên"
        placeholder={vi.auth.namePlaceholder}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        error={error}
        autoFocus
      />
    </Screen>
  );
}

export default function NameScreen() {
  return (
    <ThemeProvider mode="adult">
      <NameStep />
    </ThemeProvider>
  );
}
