export const PROFILE_ROLES = ['artist', 'collector', 'both'] as const;

export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const DISPLAY_UNITS = ['cm', 'in'] as const;
export type DisplayUnit = (typeof DISPLAY_UNITS)[number];
export type MeasurementUnit = DisplayUnit;

export const PROFILE_SETTING_KEYS = {
  studioName: 'studio_name',
  artistName: 'artist_name',
  artistBio: 'artist_bio',
  profileLocation: 'profile_location',
  displayUnit: 'display_unit',
  defaultCurrency: 'default_currency',
} as const;

export interface UserProfile {
  studioName: string;
  artistName: string;
  artistBio: string;
  location: string;
  displayUnit: DisplayUnit;
  defaultCurrency: string;
}

export const EMPTY_USER_PROFILE: UserProfile = {
  studioName: '',
  artistName: '',
  artistBio: '',
  location: '',
  displayUnit: 'cm',
  defaultCurrency: 'USD',
};

/** Name used when the artist is set to "As me" on an artwork entry. */
export const profileArtistName = (profile: UserProfile): string =>
  profile.artistName.trim() || profile.studioName.trim();

export function parseProfileRole(value: string | null): ProfileRole | null {
  return value === 'artist' || value === 'collector' || value === 'both' ? value : null;
}

export function parseDisplayUnit(value: string | null): DisplayUnit {
  return value === 'in' ? 'in' : 'cm';
}

export function isValidCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}
