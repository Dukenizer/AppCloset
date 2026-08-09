export const APP_THEMES = ['gallery', 'light', 'dark'] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const DEFAULT_APP_THEME: AppTheme = 'gallery';

export const CATCH_ALL_COLLECTION_NAME = 'Unsorted';

export function parseAppTheme(value: string | null | undefined): AppTheme {
  if (value === 'light' || value === 'dark' || value === 'gallery') return value;
  return DEFAULT_APP_THEME;
}
