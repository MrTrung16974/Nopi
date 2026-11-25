import { vi } from '@nopi/copy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { T } from '@/components/Text';
import { draftStore } from '@/platform/draft';
import { fileSize } from '@/platform/files';
import { useStudentMode } from '@/platform/student-mode';
import { ThemeProvider } from '@/platform/theme';

/** Chụp ảnh bài làm: camera ngay trong app, nén cạnh dài ~1.600px trước khi gửi (tiết kiệm 3G/4G). */
function Capture() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cam = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shoot = async () => {
    if (!cam.current) return;
    setBusy(true);
    setError(null);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.9 });
      const ctx = ImageManipulator.manipulate(pic.uri);
      if (pic.width >= pic.height) ctx.resize({ width: Math.min(1600, pic.width) });
      else ctx.resize({ height: Math.min(1600, pic.height) });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
      draftStore.add(id, { localUri: out.uri, kind: 'photo', mimeType: 'image/jpeg', sizeBytes: await fileSize(out.uri) });
      router.back();
    } catch {
      setError('Chưa chụp được, con thử lại nhé');
    } finally {
      setBusy(false);
    }
  };

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <T>{vi.scanner.needPermission.replace('quét mã QR', 'chụp bài')}</T>
        <PrimaryButton label={vi.scanner.allow} onPress={requestPermission} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['bottom']}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
      <View style={{ padding: 16, gap: 8 }}>
        {error && <T variant="error">{error}</T>}
        {busy ? <ActivityIndicator color="#fff" size="large" /> : <PrimaryButton label={vi.actions.takePhoto} onPress={shoot} disabled={!ready} />}
      </View>
    </SafeAreaView>
  );
}

export default function CaptureScreen() {
  return (
    <ThemeProvider mode={useStudentMode()}>
      <Capture />
    </ThemeProvider>
  );
}
