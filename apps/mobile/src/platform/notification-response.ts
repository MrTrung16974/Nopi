import * as Notifications from 'expo-notifications';

/** Thông báo người dùng vừa bấm vào (điện thoại). Bản web ở notification-response.web.ts. */
export function useTappedNotificationData(): Record<string, unknown> | null {
  const response = Notifications.useLastNotificationResponse();
  return (response?.notification.request.content.data as Record<string, unknown> | undefined) ?? null;
}
