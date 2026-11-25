import type { UserProfileDto } from '@nopi/contracts';
import { useSyncExternalStore } from 'react';
import { tokenStore } from './token-store';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
export interface AdultSession extends Tokens {
  user: UserProfileDto;
}
export interface StudentSession extends Tokens {
  student: { id: string; fullName: string; nickname: string | null; avatarKey: string | null };
  /** Mở bằng "Cho con học" trên máy bố mẹ → thoát thì quay về tài khoản bố mẹ */
  viaGuardian: boolean;
}

interface State {
  ready: boolean;
  adult: AdultSession | null;
  student: StudentSession | null;
}

const KEYS = { adult: 'nopi.adult', student: 'nopi.student' } as const;
let state: State = { ready: false, adult: null, student: null };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/**
 * Kho phiên đăng nhập, dùng được cả trong React (useSession) lẫn ngoài React (client API).
 * Một máy có thể giữ đồng thời phiên bố mẹ và phiên con (khi "Cho con học").
 */
export const session = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  async load() {
    const parse = <T>(raw: string | null): T | null => {
      try {
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    };
    const [a, s] = await Promise.all([tokenStore.get(KEYS.adult), tokenStore.get(KEYS.student)]);
    set({ ready: true, adult: parse<AdultSession>(a), student: parse<StudentSession>(s) });
  },
  async setAdult(adult: AdultSession | null) {
    set({ adult });
    await tokenStore.set(KEYS.adult, adult ? JSON.stringify(adult) : null);
  },
  async setStudent(student: StudentSession | null) {
    set({ student });
    await tokenStore.set(KEYS.student, student ? JSON.stringify(student) : null);
  },
  async updateTokens(role: 'adult' | 'student', tokens: Tokens) {
    if (role === 'adult' && state.adult) await this.setAdult({ ...state.adult, ...tokens });
    if (role === 'student' && state.student) await this.setStudent({ ...state.student, ...tokens });
  },
};

export function useSession(): State {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
