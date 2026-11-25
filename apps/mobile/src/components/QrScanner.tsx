import { vi } from '@nopi/copy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { parseNopiQr, type NopiQr } from '@/platform/qr';
import { PrimaryButton } from './PrimaryButton';
import { T } from './Text';

/** Quét mã QR của Nopi. Chỉ nhận đúng loại mã mong đợi (phiếu mời, thẻ học sinh, đăng nhập web). */
export function QrScanner({ accept, onScanned }: { accept: NopiQr['kind'][]; onScanned: (qr: NopiQr) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hint, setHint] = useState<string>(vi.scanner.hint);
  const done = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={{ gap: 12 }}>
        <T>{vi.scanner.needPermission}</T>
        <PrimaryButton label={vi.scanner.allow} onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            const qr = parseNopiQr(data);
            if (!qr || !accept.includes(qr.kind)) {
              setHint(vi.scanner.unknown);
              return;
            }
            done.current = true;
            onScanned(qr);
          }}
        />
      </View>
      <T variant="muted">{hint}</T>
    </View>
  );
}
