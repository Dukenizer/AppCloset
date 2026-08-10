import { entryFromCm } from '@/domain/dimensions';
import { completionMonthFromDate } from '@/domain/completion';
import { DEFAULT_GENRE } from '@/domain/catalog';
import type { MeasurementUnit } from '@/domain/profile';

export const ARTWORK_STATUSES = [
  'Available',
  'Loaned',
  'Exhibited',
  'Sold',
  'Not for sale',
  'Other',
] as const;

export const ORIENTATIONS = ['Portrait', 'Landscape', 'Square', 'Other'] as const;
export const MEASUREMENT_UNITS = ['cm', 'in'] as const;

/** Long-form artwork write-up shown on the detail screen. */
export const FULL_DESCRIPTION_MAX_CHARS = 400;

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];
export type ArtworkOrientation = (typeof ORIENTATIONS)[number];
export type { MeasurementUnit };

export interface ArtworkImage {
  id: number;
  artworkId: number;
  uri: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  contentHash: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface Artwork {
  id: number;
  humanId: string;
  title: string;
  artist: string;
  completionDate: string | null;
  completionYear: number | null;
  completionMonth: number | null;
  shortDescription: string;
  fullDescription: string;
  medium: string;
  material: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  measurementUnit: MeasurementUnit;
  orientation: ArtworkOrientation | null;
  framed: boolean;
  status: ArtworkStatus;
  priceMinor: number | null;
  currency: string;
  hidePrice: boolean;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  primaryImageUri: string | null;
  tags: string[];
  genres: string[];
  collections: string[];
}

export interface ArtworkDraft {
  humanId: string;
  title: string;
  artist: string;
  completionDate: string;
  completionYear: string;
  completionMonth: string;
  shortDescription: string;
  fullDescription: string;
  medium: string;
  material: string;
  width: string;
  height: string;
  depth: string;
  measurementUnit: MeasurementUnit;
  orientation: ArtworkOrientation | '';
  framed: boolean;
  status: ArtworkStatus;
  price: string;
  currency: string;
  hidePrice: boolean;
  location: string;
  notes: string;
  tags: string[];
  genres: string[];
  collections: string[];
  pendingImageUri: string | null;
}

export type ArtworkSort =
  | 'newest'
  | 'oldest'
  | 'recently-added'
  | 'recently-updated'
  | 'title-asc'
  | 'title-desc'
  | 'artwork-id'
  | 'status';

export type SizeBucket = import('@/domain/dimensions').SizeBucket;

export interface ArtworkQuery {
  search: string;
  status: ArtworkStatus | null;
  sort: ArtworkSort;
  year: string;
  dateFrom: string;
  dateTo: string;
  artist: string;
  genre: string;
  tag: string;
  medium: string;
  material: string;
  collection: string;
  collectionId: number | null;
  orientation: ArtworkOrientation | null;
  sizeBucket: SizeBucket | null;
}

export const EMPTY_ARTWORK_DRAFT: ArtworkDraft = {
  humanId: '',
  title: '',
  artist: '',
  completionDate: '',
  completionYear: '',
  completionMonth: '',
  shortDescription: '',
  fullDescription: '',
  medium: '',
  material: '',
  width: '',
  height: '',
  depth: '',
  measurementUnit: 'cm',
  orientation: '',
  framed: false,
  status: 'Available',
  price: '',
  currency: 'USD',
  hidePrice: false,
  location: '',
  notes: '',
  tags: [],
  genres: [DEFAULT_GENRE],
  collections: [],
  pendingImageUri: null,
};

export function draftFromArtwork(artwork: Artwork): ArtworkDraft {
  const formatDimension = (valueCm: number | null): string => {
    if (valueCm === null) return '';
    const entry = entryFromCm(valueCm, artwork.measurementUnit);
    return artwork.measurementUnit === 'in' ? entry.toFixed(2) : String(Math.round(entry * 10) / 10);
  };

  return {
    humanId: artwork.humanId,
    title: artwork.title,
    artist: artwork.artist,
    completionDate: artwork.completionDate ?? '',
    completionYear: artwork.completionYear?.toString() ?? '',
    completionMonth:
      artwork.completionMonth?.toString() ??
      completionMonthFromDate(artwork.completionDate),
    shortDescription: artwork.shortDescription,
    fullDescription: artwork.fullDescription,
    medium: artwork.medium,
    material: artwork.material,
    width: formatDimension(artwork.width),
    height: formatDimension(artwork.height),
    depth: formatDimension(artwork.depth),
    measurementUnit: artwork.measurementUnit,
    orientation: artwork.orientation ?? '',
    framed: artwork.framed,
    status: artwork.status,
    price: artwork.priceMinor === null ? '' : (artwork.priceMinor / 100).toFixed(2),
    currency: artwork.currency,
    hidePrice: artwork.hidePrice,
    location: artwork.location,
    notes: artwork.notes,
    tags: artwork.tags,
    genres: artwork.genres,
    collections: artwork.collections,
    pendingImageUri: artwork.primaryImageUri,
  };
}

export interface ArtworkStats {
  total: number;
  available: number;
  sold: number;
  exhibiting: number;
}

export interface BatchArtworkItem {
  pendingImageUri: string;
  title: string;
}

export const createArtworkHumanId = (): string => {
  const compact = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `AC-${compact}-${Math.floor(Math.random() * 900 + 100)}`;
};
