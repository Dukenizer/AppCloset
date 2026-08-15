import { Platform } from 'react-native';

import type { AppTheme } from '@/domain/theme';

const sharedStatus = {
  statusAvailable: '#48D597',
  statusReserved: '#FFB84D',
  statusSold: '#FF647C',
  statusExhibiting: '#36B6FF',
  statusNotForSale: '#7F91A8',
} as const;

/** Dark — former Gallery look: warm espresso + antique brass. */
export const darkColors = {
  background: '#16120E',
  surface: '#211C17',
  surfaceMuted: '#2A241E',
  ink: '#F3EDE4',
  inkMuted: '#B0A495',
  placeholder: '#74695C',
  accent: '#C4A05A',
  accentPressed: '#A48448',
  border: '#3A322A',
  danger: '#C96B4B',
  success: '#5C7A6B',
  focus: '#C4A05A',
  // Status stickers stay semantic (readable on warm dark).
  statusAvailable: '#4F9D6A',
  statusReserved: '#D4A017',
  statusSold: '#C94C3F',
  statusExhibiting: '#A85C42',
  statusNotForSale: '#7A8FA3',
  onAccent: '#16120E',
} as const;

/** Light — warm gallery cream + antique gold (daytime counterpart to dark). */
export const lightColors: ColorTokens = {
  background: '#F7F3EC',
  surface: '#FFFBF5',
  surfaceMuted: '#EFE8DC',
  /** Near-black espresso — stays readable on cream (and if a screen bg lags behind theme). */
  ink: '#16120E',
  inkMuted: '#5C4A38',
  placeholder: '#9A8772',
  accent: '#C1975B',
  accentPressed: '#A37D45',
  border: '#E2D6C5',
  danger: '#C96B4B',
  success: '#5C7A6B',
  focus: '#C1975B',
  statusAvailable: '#3D9B6A',
  statusReserved: '#D4A017',
  statusSold: '#D4564A',
  statusExhibiting: '#5B8FB8',
  statusNotForSale: '#8A7B6A',
  onAccent: '#FFFFFF',
};

/**
 * Neon — Design A: contemporary art / vibrant neon.
 * Deep navy + magenta → purple → electric blue energy (use accents sparingly).
 */
export const neonColors: ColorTokens = {
  background: '#050A12',
  surface: '#0C1220',
  surfaceMuted: '#141B2E',
  ink: '#F4F7FB',
  inkMuted: '#A9B6C8',
  placeholder: '#6F8096',
  accent: '#A855F7',
  accentPressed: '#7C3AED',
  border: '#2A2640',
  danger: '#FF647C',
  success: '#48D597',
  focus: '#36B6FF',
  ...sharedStatus,
  onAccent: '#F4F7FB',
};

/**
 * Metallic — Design B: bluish metallic / futuristic premium.
 * Deep navy surfaces + electric blue + chrome borders.
 */
export const metallicColors: ColorTokens = {
  background: '#050A12',
  surface: '#0D1726',
  surfaceMuted: '#111D2E',
  ink: '#F4F7FB',
  inkMuted: '#A9B6C8',
  placeholder: '#6F8096',
  accent: '#168BFF',
  accentPressed: '#0757C9',
  border: '#26364A',
  danger: '#FF647C',
  success: '#48D597',
  focus: '#36B6FF',
  ...sharedStatus,
  onAccent: '#F4F7FB',
};

export type ColorTokens = {
  [Key in keyof typeof darkColors]: string;
};

export const themeColors = (theme: AppTheme): ColorTokens => {
  if (theme === 'light') return lightColors;
  if (theme === 'neon') return neonColors;
  if (theme === 'metallic') return metallicColors;
  return darkColors;
};

export const themeUsesLightStatusBar = (theme: AppTheme): boolean => theme !== 'light';

/** Kept for non-rendering modules. UI components should use useTheme(). */
export const colors: ColorTokens = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 12,
  md: 18,
  lg: 22,
} as const;

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
} as const;
