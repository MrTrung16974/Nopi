import { vi } from '@nopi/copy';
import { useMemo, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { ThemeProvider } from '@/platform/theme';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';
import { T } from './Text';
import { TextField } from './TextField';

/**
 * Cổng phụ huynh: giải phép nhân để thoát chế độ học sinh / vào cài đặt,
 * để trẻ không vô tình bấm ra ngoài. Luôn hiển thị giao diện người lớn.
 */
export function ParentGate({ visible, onPass, onCancel }: { visible: boolean; onPass: () => void; onCancel: () => void }) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Câu hỏi mới mỗi lần mở cổng
  const [a, b] = useMemo(() => {
    void visible;
    return [6 + Math.floor(Math.random() * 4), 6 + Math.floor(Math.random() * 4)] as const;
  }, [visible]);

  const submit = () => {
    if (Number(answer) === a * b) {
      setAnswer('');
      setError(null);
      onPass();
    } else {
      setError(vi.gate.wrong);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <ThemeProvider mode="adult">
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 24,
              gap: 16,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }}>
                <Text accessibilityElementsHidden style={{ fontSize: 22 }}>🔒</Text>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="title">{vi.gate.title}</T>
                <T variant="muted">Giải phép tính nhanh để tiếp tục</T>
              </View>
            </View>
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: 1 }}>
                {vi.gate.question(a, b)}
              </Text>
            </View>
            <TextField
              label="Nhập kết quả"
              placeholder="Ví dụ: 42"
              value={answer}
              onChangeText={(v) => {
                setAnswer(v.replace(/\D/g, ''));
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              maxLength={3}
              error={error}
              onSubmitEditing={submit}
              autoFocus
            />
            <PrimaryButton label={vi.auth.confirm} onPress={submit} disabled={!answer} />
            <SecondaryButton label={vi.gate.cancel} onPress={onCancel} />
          </View>
        </View>
      </ThemeProvider>
    </Modal>
  );
}
