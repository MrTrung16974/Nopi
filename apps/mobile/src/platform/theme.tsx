import type { UiMode } from '@nopi/domain';
import { themeFor, type Theme } from '@nopi/ui';
import { createContext, useContext, type ReactNode } from 'react';

const ThemeContext = createContext<Theme>(themeFor('adult'));

/** Bọc một nhánh màn hình bằng chế độ giao diện. Component con chỉ đọc useTheme(). */
export function ThemeProvider({ mode, children }: { mode: UiMode; children: ReactNode }) {
  return <ThemeContext.Provider value={themeFor(mode)}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
