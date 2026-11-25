import { vi } from '@nopi/copy';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { T } from '@/components/Text';
import { draftStore } from '@/platform/draft';
import { fileSize } from '@/platform/files';
import { useStudentMode } from '@/platform/student-mode';
import { ThemeProvider } from '@/platform/theme';

/** Quay video 720p (nhẹ cho 3G/4G), tự dừng ở thời lượng tối đa cô đặt. Chỉ có trên điện thoại. */
function Record() {
  const { id, max } = useLocalSearchParams<{ id: string; max: string }>();
  const maxSeconds = Number(max) || 120;
  const cam = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <T>{vi.work.videoOnPhone}</T>
      </SafeAreaView>
    );
  }
  if (!camPerm || !micPerm) return null;
  if (!camPerm.granted || !micPerm.granted) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <T>Nopi cần dùng camera và micro để quay bài của con</T>
        <PrimaryButton label={vi.scanner.allow} onPress={async () => { await requestCam(); await requestMic(); }} />
      </SafeAreaView>
    );
  }

  const start = async () => {
    if (!cam.current) return;
    setRecording(true);
    setSeconds(0);
    started.current = Date.now();
    const result = await cam.current.recordAsync({ maxDuration: maxSeconds });
    setRecording(false);
    if (result?.uri) {
      const durationS = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      draftStore.add(id, { localUri: result.uri, kind: 'video', mimeType: 'video/mp4', sizeBytes: await fileSize(result.uri), durationS: Math.min(durationS, maxSeconds) });
      router.back();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['bottom']}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="back" mode="video" videoQuality="720p" />
      <View style={{ padding: 16, gap: 8 }}>
        <T style={{ color: '#fff', textAlign: 'center' }}>
          {recording ? `${seconds}s / ${maxSeconds}s` : vi.work.maxLength(maxSeconds)}
        </T>
        <PrimaryButton label={recording ? 'Dừng quay' : vi.actions.recordVideo} onPress={recording ? () => cam.current?.stopRecording() : start} />
      </View>
    </SafeAreaView>
  );
}

export default function RecordScreen() {
  return (
    <ThemeProvider mode={useStudentMode()}>
      <Record />
    </ThemeProvider>
  );
}
