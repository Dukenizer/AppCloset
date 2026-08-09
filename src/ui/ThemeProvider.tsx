import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { DEFAULT_APP_THEME, type AppTheme } from '@/domain/theme';
import { themeColors, themeUsesLightStatusBar, type ColorTokens } from './theme';

interface ThemeValue {
  colors: ColorTokens;
  theme: AppTheme;
  isDark: boolean;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeValue>({
  colors: themeColors(DEFAULT_APP_THEME),
  theme: DEFAULT_APP_THEME,
  isDark: true,
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [theme, setThemeState] = useState<AppTheme>(DEFAULT_APP_THEME);

  const setTheme = useCallback((next: AppTheme): void => {
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      colors: themeColors(theme),
      isDark: themeUsesLightStatusBar(theme),
      setTheme,
    }),
    [setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
