import { familyChildSchema } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import { GRADES } from '@nopi/domain';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/platform/api';
import { ThemeProvider, useTheme } from '@/platform/theme';

/** Thêm con chưa học ở trường dùng Nopi vào không gian gia đình (tạo hồ sơ mới). */
function AddFamilyChild() {
  const t = useTheme();
  const qc = useQueryClient();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      await api(`/family-spaces/${spaceId}/children`, { method: 'POST', body: { fullName, nickname: nickname || undefined, grade }, schema: familyChildSchema });
      await Promise.all(['family', 'me', 'teacher'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen footer={<PrimaryButton label={vi.parent.addChild} onPress={save} loading={loading} disabled={fullName.trim().length < 2 || !grade} />}>
      <TextField label={vi.family.childName} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <TextField label={vi.family.childNickname} value={nickname} onChangeText={setNickname} />
      <T variant="muted">{vi.family.childGrade}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {GRADES.map((g) => (
          <Pressable
            key={g}
            accessibilityRole="radio"
            accessibilityState={{ selected: grade === g }}
            onPress={() => setGrade(g)}
            style={{ width: 56, height: t.touch.min, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: grade === g ? t.color.primary : t.color.border, backgroundColor: grade === g ? '#FFEDD5' : t.color.surface }}
          >
            <T style={{ fontWeight: '700' }}>{g}</T>
          </Pressable>
        ))}
      </View>
      {error && <T variant="error">{error}</T>}
    </Screen>
  );
}

export default function Route() {
  return (
    <ThemeProvider mode="adult">
      <AddFamilyChild />
    </ThemeProvider>
  );
}
