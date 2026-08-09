export const PROFILE_ROLES = ['artist', 'collector', 'both'] as const;

export type ProfileRole = (typeof PROFILE_ROLES)[number];

export function parseProfileRole(value: string | null): ProfileRole | null {
  return value === 'artist' || value === 'collector' || value === 'both' ? value : null;
}
