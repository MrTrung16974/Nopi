import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, Text } from 'react-native';
import { useTheme } from '@/platform/theme';

/** Nút phát một file ghi âm (giọng cô đọc đề, nhận xét, bài đọc của con). */
export function AudioPlayButton({ url, label }: { url: string; label: string }) {
  const t = useTheme();
  const isNhi = t.mode === 'nhi';
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
      player.play();
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={toggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: t.touch.min,
        paddingHorizontal: isNhi ? 22 : 16,
        borderRadius: 999,
        backgroundColor: status.playing ? '#BAE6FD' : t.color.accentSoft,
        borderWidth: 2,
        borderColor: status.playing ? t.color.accent : '#7DD3FC',
        alignSelf: 'flex-start',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text accessibilityElementsHidden style={{ fontSize: isNhi ? 24 : 18 }}>{status.playing ? '⏸️' : '🔊'}</Text>
      <Text style={{ fontSize: t.font.body, fontWeight: '800', color: '#075985' }}>{label}</Text>
    </Pressable>
  );
}
