import type { Artwork } from '@/domain/artwork';
import { formatCompletionLabel, formatMediumLine } from '@/domain/catalog';
import { formatLabelDimensions } from '@/domain/dimensions';
import { formatWebsite } from '@/domain/callingCard';
import { profileArtistName, type DisplayUnit, type UserProfile } from '@/domain/profile';

export const CERTIFICATE_SNAPSHOT_VERSION = 1;
export const CERTIFICATE_PREFIX = 'COA';

/** What a certificate prints, frozen at issue so reprints never drift from the original. */
export interface CertificateSnapshot {
  version: typeof CERTIFICATE_SNAPSHOT_VERSION;
  title: string;
  artist: string;
  year: string;
  medium: string;
  size: string;
  sizeUnit: DisplayUnit;
  artworkId: string;
  /** Empty when the issuer chose not to print a price. */
  price: string;
  /** Name printed under the signature line. */
  issuer: string;
  contacts: string[];
}

export interface CertificateRecord {
  id: number;
  number: string;
  artworkId: number | null;
  issuedAt: string;
  voidedAt: string | null;
  snapshot: CertificateSnapshot;
}

export interface CertificateOptions {
  includePrice: boolean;
}

export const formatCertificatePrice = (artwork: Artwork): string =>
  artwork.priceMinor === null ? '' : `${artwork.currency} ${(artwork.priceMinor / 100).toFixed(2)}`;

/** Price can be printed only when it is set and not hidden. */
export const certificatePriceAvailable = (artwork: Artwork): boolean =>
  artwork.priceMinor !== null && !artwork.hidePrice;

export const certificateIssuerName = (artwork: Artwork, profile: UserProfile): string =>
  profileArtistName(profile) || artwork.artist.trim();

export const certificateContacts = (profile: UserProfile): string[] =>
  [profile.contactEmail.trim(), profile.contactPhone.trim(), formatWebsite(profile.websiteUrl)].filter(Boolean);

/** Why a certificate cannot be issued yet, or null when it can. */
export const certificateBlocker = (artwork: Artwork): string | null => {
  if (!artwork.title.trim()) return 'Add a title to this artwork before issuing a certificate.';
  if (!artwork.artist.trim()) return "Add the artist's name to this artwork before issuing a certificate.";
  return null;
};

type CatalogFields = Pick<CertificateSnapshot, 'title' | 'artist' | 'year' | 'medium' | 'size' | 'artworkId'>;

const catalogFields = (artwork: Artwork, displayUnit: DisplayUnit): CatalogFields => ({
  title: artwork.title.trim(),
  artist: artwork.artist.trim(),
  year: formatCompletionLabel(artwork.completionYear, artwork.completionMonth) ?? '',
  medium: formatMediumLine(artwork.medium, artwork.material),
  size: formatLabelDimensions(artwork.width, artwork.height, artwork.depth, displayUnit) ?? '',
  artworkId: artwork.humanId,
});

export const buildCertificateSnapshot = (
  artwork: Artwork,
  profile: UserProfile,
  displayUnit: DisplayUnit,
  options: CertificateOptions,
): CertificateSnapshot => ({
  version: CERTIFICATE_SNAPSHOT_VERSION,
  ...catalogFields(artwork, displayUnit),
  sizeUnit: displayUnit,
  price: options.includePrice && certificatePriceAvailable(artwork) ? formatCertificatePrice(artwork) : '',
  issuer: certificateIssuerName(artwork, profile),
  contacts: certificateContacts(profile),
});

/**
 * True when the artwork's catalog details no longer match what the certificate printed.
 * Issuer, contacts and price are choices made at issue time, so they don't count as drift.
 */
export const certificateDetailsChanged = (snapshot: CertificateSnapshot, artwork: Artwork): boolean => {
  const current = catalogFields(artwork, snapshot.sizeUnit);
  return (Object.keys(current) as (keyof CatalogFields)[]).some((key) => current[key] !== snapshot[key]);
};

export const parseCertificateSnapshot = (raw: string): CertificateSnapshot | null => {
  try {
    const value = JSON.parse(raw) as Partial<CertificateSnapshot>;
    if (value?.version !== CERTIFICATE_SNAPSHOT_VERSION) return null;
    const text = (field: unknown): string => (typeof field === 'string' ? field : '');
    if (!text(value.title) || !text(value.artist)) return null;
    return {
      version: CERTIFICATE_SNAPSHOT_VERSION,
      title: text(value.title),
      artist: text(value.artist),
      year: text(value.year),
      medium: text(value.medium),
      size: text(value.size),
      sizeUnit: value.sizeUnit === 'in' ? 'in' : 'cm',
      artworkId: text(value.artworkId),
      price: text(value.price),
      issuer: text(value.issuer),
      contacts: Array.isArray(value.contacts) ? value.contacts.filter((c): c is string => typeof c === 'string') : [],
    };
  } catch {
    return null;
  }
};

const NUMBER_PATTERN = new RegExp(`^${CERTIFICATE_PREFIX}-(\\d{4})-(\\d{4,})$`);

export const parseCertificateNumber = (number: string): { year: number; sequence: number } | null => {
  const match = NUMBER_PATTERN.exec(number);
  return match ? { year: Number(match[1]), sequence: Number(match[2]) } : null;
};

/**
 * Next "COA-2026-0001" style number: sequential within the year, never reusing a voided one.
 * `floor` is the highest sequence this device has already handed out for the year, so restoring an
 * older catalog cannot reissue a number a buyer already holds.
 */
export const nextCertificateNumber = (existing: string[], year: number, floor = 0): string => {
  let highest = Math.max(0, floor);
  for (const number of existing) {
    const parsed = parseCertificateNumber(number);
    if (parsed && parsed.year === year) highest = Math.max(highest, parsed.sequence);
  }
  return `${CERTIFICATE_PREFIX}-${year}-${String(highest + 1).padStart(4, '0')}`;
};

export const formatCertificateDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};
