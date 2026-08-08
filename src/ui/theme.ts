import { Platform } from 'react-native';

export const colors = {
  background: '#F4EFE6',
  surface: '#FFFCF6',
  surfaceMuted: '#E9E0D3',
  ink: '#2B2118',
  inkMuted: '#796D60',
  accent: '#8B6937',
  accentPressed: '#6F5028',
  border: '#DDD1C1',
  danger: '#A9463B',
  success: '#647B4F',
  focus: '#8B6937',
} as const;

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
