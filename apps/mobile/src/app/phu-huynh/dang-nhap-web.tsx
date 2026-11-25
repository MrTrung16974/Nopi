import { vi } from '@nopi/copy';
import { router } from 'expo-router';
import { useState } from 'react';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QrScanner } from '@/components/QrScanner';
import { Screen } from '@/components/Screen';
import { T } from '@/components/Text';
import { api, ApiError } from '@/platform/api';
import { ThemeProvider } from '@/platform/theme';

/** Thầy cô quét QR trên trang web Nopi để đăng nhập máy tính (giống Zalo Web). */
function WebLogin() {
  const [status, setStatus] = useState<'scan' | 'done' | 'error'>('scan');
  const [message, setMessage] = useState('');

  return (
    <Screen footer={status !== 'scan' ? <PrimaryButton label="Xong" onPress={() => router.back()} /> : undefined}>
      {status === 'scan' && (
        <>
          <T>{vi.parent.webLogin}: mở trang web Nopi trên máy tính rồi quét mã QR hiện trên màn hình.</T>
          <QrScanner
            accept={['qr-login']}
            onScanned={async (qr) => {
              if (qr.kind !== 'qr-login') return;
              try {
                await api(`/auth/qr-login/${qr.loginId}/approve`, { method: 'POST' });
                setStatus('done');
                setMessage('Đã đăng nhập trên máy tính.');
              } catch (e) {
                setStatus('error');
                setMessage(e instanceof ApiError ? e.friendly : String(e));
              }
            }}
          />
        </>
      )}
      {status !== 'scan' && <T variant={status === 'error' ? 'error' : 'body'}>{message}</T>}
    </Screen>
  );
}

export default function WebLoginScreen() {
  return (
    <ThemeProvider mode="adult">
      <WebLogin />
    </ThemeProvider>
  );
}
