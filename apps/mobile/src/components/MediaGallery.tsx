import type { MediaView } from '@nopi/contracts';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image, Linking, Pressable, View } from 'react-native';
import { AudioPlayButton } from './AudioPlayButton';
import { T } from './Text';

function VideoItem({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 }} />;
}

/** Hiển thị bài nộp: ảnh (bấm để mở to), video, ghi âm. File đang xử lý vẫn xem được bản gốc. */
export function MediaGallery({ media, size = 140 }: { media: MediaView[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {media.map((m) => {
        if (m.status === 'deleted') return <T key={m.id} variant="muted">File đã hết thời hạn lưu</T>;
        if (m.status === 'failed') {
          return (
            <View key={m.id} style={{ width: '100%', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, gap: 6 }}>
              <T style={{ color: '#B91C1C', fontWeight: '700' }}>⚠️ File này bị lỗi khi xử lý, cần nộp lại</T>
              {m.url ? (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(m.url!)}>
                  <T variant="muted">Thử mở bản gốc</T>
                </Pressable>
              ) : null}
            </View>
          );
        }
        if (!m.url) return <T key={m.id} variant="muted">Đang xử lý…</T>;
        if (m.kind === 'photo') {
          return (
            <Pressable key={m.id} accessibilityRole="imagebutton" accessibilityLabel="Ảnh bài làm" onPress={() => Linking.openURL(m.url!)}>
              <Image source={{ uri: m.thumbnailUrl ?? m.url }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#E2E8F0' }} />
            </Pressable>
          );
        }
        if (m.kind === 'audio') return <AudioPlayButton key={m.id} url={m.url} label={`Nghe${m.durationS ? ` (${Math.round(m.durationS)} giây)` : ''}`} />;
        if (m.kind === 'video') return <View key={m.id} style={{ width: '100%' }}><VideoItem url={m.url} /></View>;
        return <T key={m.id}>📄 Tài liệu</T>;
      })}
    </View>
  );
}
