import { Platform } from 'react-native';

import type { AppTheme } from '@/domain/theme';

const sharedStatus = {
  statusSold: '#5C7A6B',
  statusExhibiting: '#A85C42',
} as const;

/** Standard neutral light palette — not restyled to Gallery brass. */
export const lightColors = {
  background: '#F7F4EE',
  surface: '#FFFCF6',
  surfaceMuted: '#EEE9E1',
  ink: '#292521',
  inkMuted: '#756E65',
  placeholder: '#9A9288',
  accent: '#8D6E42',
  accentPressed: '#6B542F',
  border: '#E2DAD0',
  danger: '#A9463B',
  success: '#647B4F',
  focus: '#8D6E42',
  ...sharedStatus,
  onAccent: '#FFFFFF',
} as const;

/** Standard neutral dark palette — separate from Gallery signature theme. */
export const darkColors: ColorTokens = {
  background: '#121110',
  surface: '#1C1A18',
  surfaceMuted: '#262320',
  ink: '#F2EDE6',
  inkMuted: '#A39E96',
  placeholder: '#6E6860',
  accent: '#C4A36A',
  accentPressed: '#A88752',
  border: '#3A3530',
  danger: '#E27A6D',
  success: '#91A976',
  focus: '#C4A36A',
  ...sharedStatus,
  onAccent: '#121110',
};

/** Gallery — fixed signature theme (default on first install). */
export const galleryColors: ColorTokens = {
  background: '#141210',
  surface: '#1E1B18',
  surfaceMuted: '#252220',
  ink: '#F0EBE3',
  inkMuted: '#A39A8C',
  placeholder: '#6B6459',
  accent: '#B8935A',
  accentPressed: '#9A7A48',
  border: '#332E28',
  danger: '#C96B4B',
  success: '#5C7A6B',
  focus: '#B8935A',
  ...sharedStatus,
  onAccent: '#141210',
};

export type ColorTokens = {
  [Key in keyof typeof lightColors]: string;
};

export const themeColors = (theme: AppTheme): ColorTokens => {
  if (theme === 'gallery') return galleryColors;
  if (theme === 'dark') return darkColors;
  return lightColors;
};

export const themeUsesLightStatusBar = (theme: AppTheme): boolean =>
  theme === 'gallery' || theme === 'dark';

// Kept for non-rendering modules. UI components should use useTheme().
export const colors: ColorTokens = galleryColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
} as const;

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
} as const;
