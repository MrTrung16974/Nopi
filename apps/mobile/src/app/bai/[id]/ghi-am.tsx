import { router, useLocalSearchParams } from 'expo-router';
import { AudioRecorderPanel } from '@/components/AudioRecorderPanel';
import { Screen } from '@/components/Screen';
import { draftStore } from '@/platform/draft';
import { fileSize } from '@/platform/files';
import { useStudentMode } from '@/platform/student-mode';
import { ThemeProvider } from '@/platform/theme';

/** Ghi âm: nút tròn đỏ to có đồng hồ đếm. */
export default function RecordAudioScreen() {
  const { id, max } = useLocalSearchParams<{ id: string; max: string }>();
  return (
    <ThemeProvider mode={useStudentMode()}>
      <Screen>
        <AudioRecorderPanel
          maxSeconds={Number(max) || 180}
          onDone={async (r) => {
            draftStore.add(id, { localUri: r.uri, kind: 'audio', mimeType: r.mimeType, sizeBytes: await fileSize(r.uri), durationS: r.durationS });
            router.back();
          }}
        />
      </Screen>
    </ThemeProvider>
  );
}
