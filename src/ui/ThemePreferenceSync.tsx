import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getSetting, setSetting } from '@/data/artworkRepository';
import { parseAppTheme, type AppTheme } from '@/domain/theme';
import { useTheme } from './ThemeProvider';

/** Loads persisted theme preference once SQLite is ready. */
export function ThemePreferenceSync(): null {
  const database = useSQLiteContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    let active = true;
    void getSetting(database, 'app_theme').then((value) => {
      if (!active) return;
      setTheme(parseAppTheme(value));
    });
    return () => {
      active = false;
    };
  }, [database, setTheme]);

  return null;
}

export async function saveAppTheme(
  database: Parameters<typeof getSetting>[0],
  theme: AppTheme,
): Promise<void> {
  await setSetting(database, 'app_theme', theme);
}
