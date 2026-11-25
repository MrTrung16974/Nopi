import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

/** Thông báo đến khi đang mở app: vẫn hiện banner, không kêu. (Web không có thông báo đẩy.) */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
}

let registered: { role: 'adult' | 'student'; token: string } | null = null;

/**
 * Đăng ký nhận thông báo đẩy cho máy này.
 * - Người lớn: luôn đăng ký.
 * - Học sinh: chỉ khi dùng máy riêng (thẻ/PIN). Máy bố mẹ ("Cho con học") giữ thông báo cho bố mẹ.
 * Cần chạy trên điện thoại thật và có EAS projectId (app.json → extra.eas.projectId); thiếu thì bỏ qua êm.
 */
export async function registerForPush(role: 'adult' | 'student') {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  if (registered?.role === role) return;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Bài tập & nhận xét', importance: Notifications.AndroidImportance.HIGH });
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await api('/devices', { method: 'POST', as: role, body: { platform: Platform.OS, pushToken: token } });
    registered = { role, token };
  } catch (e) {
    console.warn('Chưa đăng ký được thông báo đẩy:', (e as Error).message);
  }
}

/** Đăng xuất: ngừng nhận thông báo trên máy này. */
export async function unregisterPush(role: 'adult' | 'student') {
  if (!registered || registered.role !== role) return;
  const { token } = registered;
  registered = null;
  await api('/devices', { method: 'DELETE', as: role, body: { pushToken: token } }).catch(() => undefined);
}

/** Dữ liệu kèm thông báo → màn cần mở. */
export function routeForNotification(data: Record<string, unknown> | undefined, role: 'adult' | 'student') {
  if (!data) return null;
  if (data.template === 'teacher_digest') return { pathname: '/giao-vien' as const };
  if (data.template === 'plan_expiring' && role === 'adult') return { pathname: '/phu-huynh' as const };
  if (typeof data.reportId === 'string' && data.reportId) return { pathname: '/bao-cao/[id]' as const, params: { id: data.reportId } };
  if (data.template === 'media_expiring' && typeof data.studentId === 'string' && role === 'adult') {
    return { pathname: '/phu-huynh/con/[studentId]' as const, params: { studentId: data.studentId } };
  }
  if (typeof data.studentAssignmentId === 'string' && data.studentAssignmentId) {
    return { pathname: '/bai/[id]' as const, params: { id: data.studentAssignmentId, as: role } };
  }
  return null;
}
