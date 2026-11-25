import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Kích thước file vừa chụp/ghi (điện thoại: đọc từ hệ thống file; web: đọc blob). */
export async function fileSize(uri: string): Promise<number> {
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  return new File(uri).size ?? 0;
}
