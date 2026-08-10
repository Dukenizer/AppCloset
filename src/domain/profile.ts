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
  studioLogoUri: 'studio_logo_uri',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  socialInstagram: 'social_instagram',
  socialThreads: 'social_threads',
  socialFacebook: 'social_facebook',
  websiteUrl: 'website_url',
  socialTiktok: 'social_tiktok',
  socialYoutube: 'social_youtube',
  specialtyMedium: 'specialty_medium',
  callingCardSaved: 'calling_card_saved',
  profileSaved: 'profile_saved',
} as const;

export interface UserProfile {
  studioName: string;
  artistName: string;
  artistBio: string;
  location: string;
  displayUnit: DisplayUnit;
  defaultCurrency: string;
  /** Local file URI for the artist's studio mark on the digital calling card. */
  studioLogoUri: string;
  contactEmail: string;
  contactPhone: string;
  /** Instagram handle or URL (calling card). */
  socialInstagram: string;
  /** Threads handle or URL (calling card). */
  socialThreads: string;
  /** Facebook page/profile (calling card; optional). */
  socialFacebook: string;
  /** Optional personal/studio website. */
  websiteUrl: string;
  /** Optional TikTok handle or URL. */
  socialTiktok: string;
  /** Optional YouTube channel or URL. */
  socialYoutube: string;
  /** Optional one-line medium/specialty for the calling card. */
  specialtyMedium: string;
}

export const EMPTY_USER_PROFILE: UserProfile = {
  studioName: '',
  artistName: '',
  artistBio: '',
  location: '',
  displayUnit: 'cm',
  defaultCurrency: 'USD',
  studioLogoUri: '',
  contactEmail: '',
  contactPhone: '',
  socialInstagram: '',
  socialThreads: '',
  socialFacebook: '',
  websiteUrl: '',
  socialTiktok: '',
  socialYoutube: '',
  specialtyMedium: '',
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
