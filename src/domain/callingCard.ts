import { profileArtistName, type UserProfile } from '@/domain/profile';

export type CallingCardContactKind =
  | 'email'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'phone'
  | 'website'
  | 'tiktok'
  | 'youtube';

export type CallingCardContact = { kind: CallingCardContactKind; label: string; value: string };

export const formatHandle = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('@') || trimmed.includes('/') || trimmed.includes('.')) return trimmed;
  return `@${trimmed}`;
};

export const formatWebsite = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '');
};

/** All contact slots in card order; values may be empty. */
export const callingCardContacts = (profile: UserProfile): CallingCardContact[] => [
  { kind: 'email', label: 'Email', value: profile.contactEmail.trim() },
  { kind: 'facebook', label: 'Facebook', value: formatHandle(profile.socialFacebook) || profile.socialFacebook.trim() },
  { kind: 'instagram', label: 'Instagram', value: formatHandle(profile.socialInstagram) },
  { kind: 'threads', label: 'Threads', value: formatHandle(profile.socialThreads) },
  { kind: 'phone', label: 'Phone', value: profile.contactPhone.trim() },
  { kind: 'website', label: 'Website', value: formatWebsite(profile.websiteUrl) },
  { kind: 'tiktok', label: 'TikTok', value: formatHandle(profile.socialTiktok) },
  { kind: 'youtube', label: 'YouTube', value: formatHandle(profile.socialYoutube) || formatWebsite(profile.socialYoutube) },
];

/** Spread filled contacts evenly — one row up to 4, otherwise two balanced rows. */
export const layoutContactRows = <T extends { value: string }>(entries: T[]): T[][] => {
  const filled = entries.filter((entry) => entry.value.trim().length > 0);
  if (filled.length === 0) return [];
  if (filled.length <= 4) return [filled];
  const split = Math.ceil(filled.length / 2);
  return [filled.slice(0, split), filled.slice(split)];
};

/** A card is worth printing once there's a name and at least one way to reach the artist. */
export const hasPrintableCallingCard = (profile: UserProfile): boolean =>
  profileArtistName(profile).length > 0 &&
  callingCardContacts(profile).some((contact) => contact.value.length > 0);
