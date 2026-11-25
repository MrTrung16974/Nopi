import { vi } from '@nopi/copy';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/platform/theme';
import { T } from './Text';

export interface Recording {
  uri: string;
  durationS: number;
  mimeType: string;
}

/** Ghi âm mono, bitrate thấp (tiết kiệm 3G/4G); tự dừng khi đủ thời lượng tối đa. */
export function AudioRecorderPanel({ maxSeconds, onDone }: { maxSeconds: number; onDone: (r: Recording) => void }) {
  const t = useTheme();
  const isNhi = t.mode === 'nhi';
  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, numberOfChannels: 1, bitRate: 48000 });
  const state = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);
  const stopping = useRef(false);
  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);
  const progress = Math.min(1, seconds / Math.max(1, maxSeconds));

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const duration = (state.durationMillis ?? 0) / 1000;
    await recorder.stop();
    stopping.current = false;
    if (recorder.uri) onDone({ uri: recorder.uri, durationS: Math.max(1, Math.round(duration)), mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4' });
  };

  useEffect(() => {
    if (state.isRecording && seconds >= maxSeconds) void stop();
  }, [seconds, state.isRecording]);

  const start = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Nopi cần dùng micro để ghi âm bài của con');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const btnSize = isNhi ? 136 : 120;

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 20,
        paddingVertical: 32,
        paddingHorizontal: 20,
        backgroundColor: t.color.surface,
        borderRadius: t.radius.card,
        borderWidth: 1,
        borderColor: state.isRecording ? '#FCA5A5' : t.color.border,
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: state.isRecording ? '#FEE2E2' : t.color.surfaceSoft,
        }}
      >
        <Text style={{ fontSize: t.font.caption + 1, fontWeight: '700', color: state.isRecording ? '#991B1B' : t.color.textMuted }}>
          {state.isRecording ? '● Đang ghi âm' : '🎙️ Sẵn sàng ghi âm'}
        </Text>
      </View>

      <Text style={{ fontSize: 48, fontWeight: '800', color: t.color.text, fontVariant: ['tabular-nums'] }}>
        {mm}:{ss}
      </Text>

      <View style={{ width: '100%', maxWidth: 260, height: 8, borderRadius: 999, backgroundColor: t.color.surfaceSoft, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: '#DC2626', borderRadius: 999 }} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.isRecording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
        onPress={state.isRecording ? stop : start}
        style={({ pressed }) => ({
          width: btnSize,
          height: btnSize,
          borderRadius: btnSize / 2,
          backgroundColor: '#DC2626',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: state.isRecording ? 12 : 6,
          borderColor: state.isRecording ? '#FECACA' : '#FEE2E2',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 6,
        })}
      >
        <View
          style={{
            width: state.isRecording ? 38 : 48,
            height: state.isRecording ? 38 : 48,
            borderRadius: state.isRecording ? 10 : 24,
            backgroundColor: '#FFFFFF',
          }}
        />
      </Pressable>

      <View style={{ alignItems: 'center', gap: 4 }}>
        <T style={{ fontWeight: '700', textAlign: 'center' }}>{state.isRecording ? vi.work.recording : vi.work.tapToRecord}</T>
        <T variant="muted">{vi.work.maxLength(maxSeconds)}</T>
      </View>
      {error && <T variant="error">{error}</T>}
    </View>
  );
}
