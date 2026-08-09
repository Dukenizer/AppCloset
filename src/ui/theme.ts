import { Platform } from 'react-native';

export const lightColors = {
  background: '#F7F4EE',
  surface: '#FFFCF6',
  surfaceMuted: '#EEE9E1',
  ink: '#292521',
  inkMuted: '#756E65',
  accent: '#B08D57',
  accentPressed: '#8D6E42',
  border: '#E2DAD0',
  danger: '#A9463B',
  success: '#647B4F',
  focus: '#B08D57',
} as const;

export const darkColors: ColorTokens = {
  background: '#171614',
  surface: '#24211E',
  surfaceMuted: '#302C28',
  ink: '#F5F0E8',
  inkMuted: '#AAA39A',
  accent: '#C4A36A',
  accentPressed: '#A88752',
  border: '#3A3530',
  danger: '#E27A6D',
  success: '#91A976',
  focus: '#C4A36A',
};

export type ColorTokens = {
  [Key in keyof typeof lightColors]: string;
};

// Kept for non-rendering modules. UI components should use useTheme().
export const colors: ColorTokens = lightColors;

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
