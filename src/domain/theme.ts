export const APP_THEMES = ['dark', 'light', 'neon', 'metallic'] as const;

export type AppTheme = (typeof APP_THEMES)[number];

/** Dark replaces the old Gallery option (same warm look). */
export const DEFAULT_APP_THEME: AppTheme = 'dark';

export const CATCH_ALL_COLLECTION_NAME = 'Unsorted';

export function parseAppTheme(value: string | null | undefined): AppTheme {
  // Legacy Gallery → Dark (same palette).
  if (value === 'gallery') return 'dark';
  if (value === 'light' || value === 'dark' || value === 'neon' || value === 'metallic') return value;
  return DEFAULT_APP_THEME;
}
