import { ARTWORK_STATUSES } from '@/domain/artwork';
import { APP_THEMES, DEFAULT_APP_THEME, parseAppTheme } from '@/domain/theme';
import { statusDotColor } from '@/ui/statusColors';
import { themeColors, themeUsesLightStatusBar } from '@/ui/theme';

const REQUIRED_COLOR_KEYS = [
  'background',
  'surface',
  'surfaceMuted',
  'ink',
  'inkMuted',
  'placeholder',
  'accent',
  'accentPressed',
  'border',
  'danger',
  'success',
  'focus',
  'onAccent',
  'statusAvailable',
  'statusReserved',
  'statusSold',
  'statusExhibiting',
  'statusNotForSale',
] as const;

describe('themes', () => {
  it('exposes dark, light, neon, and metallic', () => {
    expect([...APP_THEMES]).toEqual(['dark', 'light', 'neon', 'metallic']);
    expect(DEFAULT_APP_THEME).toBe('dark');
  });

  it('maps legacy gallery preference to dark', () => {
    expect(parseAppTheme('gallery')).toBe('dark');
    expect(parseAppTheme('dark')).toBe('dark');
    expect(parseAppTheme('light')).toBe('light');
    expect(parseAppTheme('neon')).toBe('neon');
    expect(parseAppTheme('metallic')).toBe('metallic');
    expect(parseAppTheme(null)).toBe('dark');
    expect(parseAppTheme('unknown')).toBe('dark');
  });

  it('resolves a complete token set for every theme', () => {
    for (const theme of APP_THEMES) {
      const colors = themeColors(theme);
      for (const key of REQUIRED_COLOR_KEYS) {
        const value = colors[key];
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
        expect(value.startsWith('#')).toBe(true);
      }
    }
  });

  it('keeps light as the warm cream gallery daytime look', () => {
    const light = themeColors('light');
    expect(light.background).toBe('#F7F3EC');
    expect(light.accent).toBe('#C1975B');
    expect(light.ink).toBe('#16120E');
  });

  it('keeps dark as the warm former-gallery brass look', () => {
    const dark = themeColors('dark');
    expect(dark.background).toBe('#16120E');
    expect(dark.accent).toBe('#C4A05A');
  });

  it('keeps neon and metallic visually distinct from dark', () => {
    const dark = themeColors('dark');
    const neon = themeColors('neon');
    const metallic = themeColors('metallic');
    expect(neon.accent).not.toBe(dark.accent);
    expect(metallic.accent).not.toBe(dark.accent);
    expect(neon.accent).not.toBe(metallic.accent);
  });

  it('uses a light status bar only on light theme', () => {
    expect(themeUsesLightStatusBar('light')).toBe(false);
    expect(themeUsesLightStatusBar('dark')).toBe(true);
    expect(themeUsesLightStatusBar('neon')).toBe(true);
    expect(themeUsesLightStatusBar('metallic')).toBe(true);
  });

  it('resolves status sticker colors for every theme and status', () => {
    for (const theme of APP_THEMES) {
      const colors = themeColors(theme);
      for (const status of ARTWORK_STATUSES) {
        const dot = statusDotColor(status, colors);
        expect(typeof dot).toBe('string');
        expect(dot.length).toBeGreaterThan(0);
      }
      expect(statusDotColor('Available', colors)).toBe(colors.statusAvailable);
      expect(statusDotColor('Reserved', colors)).toBe(colors.statusReserved);
      expect(statusDotColor('Sold', colors)).toBe(colors.statusSold);
      expect(statusDotColor('Not for sale', colors)).toBe(colors.statusNotForSale);
    }
  });
});
