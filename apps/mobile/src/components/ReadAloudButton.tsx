import { vi } from '@nopi/copy';
import type { MediaView } from '@nopi/contracts';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useTheme } from '@/platform/theme';
import { AudioPlayButton } from './AudioPlayButton';

/** Nút loa đọc đề: giọng cô ghi âm nếu có, không thì máy đọc tiếng Việt. */
export function ReadAloudButton({ text, teacherAudio, label }: { text: string; teacherAudio?: MediaView | null; label?: string }) {
  const t = useTheme();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void Speech.stop(), []);
  if (teacherAudio?.url) return <AudioPlayButton url={teacherAudio.url} label={label ?? vi.work.listen} />;
  if (!text.trim()) return null;
  const isNhi = t.mode === 'nhi';
  const toggle = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language: 'vi-VN',
      rate: isNhi ? 0.85 : 0.95,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? vi.work.stopListening : (label ?? vi.work.listen)}
      onPress={toggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: t.touch.min,
        paddingHorizontal: isNhi ? 22 : 16,
        borderRadius: 999,
        backgroundColor: speaking ? '#BAE6FD' : t.color.accentSoft,
        borderWidth: 2,
        borderColor: speaking ? t.color.accent : '#7DD3FC',
        alignSelf: 'flex-start',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text accessibilityElementsHidden style={{ fontSize: isNhi ? 24 : 18 }}>{speaking ? '⏹️' : '🔊'}</Text>
      <Text style={{ fontSize: t.font.body, fontWeight: '800', color: '#075985' }}>
        {speaking ? vi.work.stopListening : (label ?? vi.work.listen)}
      </Text>
    </Pressable>
  );
}
