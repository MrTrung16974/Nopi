import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { session, useSession } from '@/platform/session';
import { startUploadLoop } from '@/platform/upload/queue';
import { useTappedNotificationData } from '@/platform/notification-response';
import { routeForNotification } from '@/platform/push';

/**
 * Theo dõi phiên đăng nhập:
 * - Đổi/thoát tài khoản (người lớn hoặc học sinh) → xoá cache dữ liệu, để người sau trên cùng máy
 *   không thấy dữ liệu của người trước (khoá cache như ['me'], ['inbox'] không gắn với người dùng).
 * - Mất phiên (đăng xuất, refresh token hết hạn) → về màn gốc, màn gốc tự chọn đăng nhập / trang chủ.
 */
function SessionWatcher() {
  const qc = useQueryClient();
  const { adult, student } = useSession();
  const key = `${adult?.user.id ?? '-'}|${student?.student.id ?? '-'}`;
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current === key) return;
    const [oldAdult, oldStudent] = prev.current.split('|');
    prev.current = key;
    qc.clear();
    const lostAdult = oldAdult !== '-' && !adult;
    const lostStudent = oldStudent !== '-' && !student;
    if (lostAdult || lostStudent) router.replace('/');
  }, [key]);
  return null;
}

export default function RootLayout() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }),
  );
  const { ready, student } = useSession();
  // Bấm vào thông báo → mở đúng bài
  const tapped = useTappedNotificationData();
  useEffect(() => {
    if (!ready || !tapped) return;
    const target = routeForNotification(tapped, student && !student.viaGuardian ? 'student' : 'adult');
    if (target) router.push(target as never);
  }, [ready, tapped]);
  useEffect(() => {
    void session.load();
    startUploadLoop(); // gửi tiếp các bài đang chờ (mất mạng, tắt app…)
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#EA580C" />
      </View>
    );
  }
  return (
    <QueryClientProvider client={client}>
      <SessionWatcher />
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' }, headerBackTitle: 'Quay lại' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="dang-nhap/index" options={{ title: 'Đăng nhập' }} />
        <Stack.Screen name="dang-nhap/otp" options={{ title: 'Nhập mã' }} />
        <Stack.Screen name="dang-nhap/ten" options={{ title: 'Tên của bạn', headerBackVisible: false }} />
        <Stack.Screen name="dang-nhap/hoc-sinh" options={{ title: 'Con tự đăng nhập' }} />
        <Stack.Screen name="phu-huynh/index" options={{ title: 'Nopi', headerBackVisible: false }} />
        <Stack.Screen name="phu-huynh/them-con" options={{ title: 'Thêm con' }} />
        <Stack.Screen name="phu-huynh/thong-bao" options={{ title: 'Thông báo' }} />
        <Stack.Screen name="phu-huynh/them-con-gia-dinh" options={{ title: 'Thêm con' }} />
        <Stack.Screen name="phu-huynh/dang-nhap-web" options={{ title: 'Đăng nhập trên máy tính' }} />
        <Stack.Screen name="hoc-sinh/index" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="hoc-sinh/mon/[subjectId]" options={{ title: '' }} />
        <Stack.Screen name="bai/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="bai/[id]/chup" options={{ title: 'Chụp ảnh' }} />
        <Stack.Screen name="bai/[id]/quay" options={{ title: 'Quay video' }} />
        <Stack.Screen name="bai/[id]/ghi-am" options={{ title: 'Ghi âm' }} />
        <Stack.Screen name="phu-huynh/con/[studentId]" options={{ title: '' }} />
        <Stack.Screen name="giao-vien/index" options={{ title: 'Hôm nay' }} />
        <Stack.Screen name="giao-vien/lop/[taId]" options={{ title: '' }} />
        <Stack.Screen name="giao-vien/giao-bai" options={{ title: 'Giao bài' }} />
        <Stack.Screen name="quet-de" options={{ title: 'Quét đề' }} />
        <Stack.Screen name="giao-vien/bai/[id]" options={{ title: '' }} />
        <Stack.Screen name="giao-vien/cham/[id]" options={{ title: 'Chấm bài' }} />
      </Stack>
    </QueryClientProvider>
  );
}
