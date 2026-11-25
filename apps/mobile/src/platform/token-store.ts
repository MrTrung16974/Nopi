import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Lưu phiên đăng nhập: Keychain/Keystore trên điện thoại (expo-secure-store),
 * localStorage trên web (SecureStore không hỗ trợ web).
 */
const web = Platform.OS === 'web';

export const tokenStore = {
  async get(key: string): Promise<string | null> {
    if (web) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null): Promise<void> {
    if (web) {
      try {
        if (value === null) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, value);
      } catch {
        /* chế độ riêng tư: bỏ qua */
      }
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};
