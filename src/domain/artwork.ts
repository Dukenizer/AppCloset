export const ARTWORK_STATUSES = [
  'Available',
  'Sold',
  'Reserved',
  'On Exhibition',
  'With Gallery',
  'Loaned',
  'Not for Sale',
  'Archived',
] as const;

export const ORIENTATIONS = ['Portrait', 'Landscape', 'Square', 'Other'] as const;
export const MEASUREMENT_UNITS = ['cm', 'in'] as const;

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];
export type ArtworkOrientation = (typeof ORIENTATIONS)[number];
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

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
  description: string;
  medium: string;
  material: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  measurementUnit: MeasurementUnit;
  orientation: ArtworkOrientation | null;
  status: ArtworkStatus;
  priceMinor: number | null;
  currency: string;
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
  description: string;
  medium: string;
  material: string;
  width: string;
  height: string;
  depth: string;
  measurementUnit: MeasurementUnit;
  orientation: ArtworkOrientation | '';
  status: ArtworkStatus;
  price: string;
  currency: string;
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
  orientation: ArtworkOrientation | null;
  minDimension: string;
  maxDimension: string;
  location: string;
}

export const EMPTY_ARTWORK_DRAFT: ArtworkDraft = {
  humanId: '',
  title: '',
  artist: '',
  completionDate: '',
  completionYear: '',
  description: '',
  medium: '',
  material: '',
  width: '',
  height: '',
  depth: '',
  measurementUnit: 'cm',
  orientation: '',
  status: 'Available',
  price: '',
  currency: 'USD',
  location: '',
  notes: '',
  tags: [],
  genres: [],
  collections: [],
  pendingImageUri: null,
};

export function draftFromArtwork(artwork: Artwork): ArtworkDraft {
  return {
    humanId: artwork.humanId,
    title: artwork.title,
    artist: artwork.artist,
    completionDate: artwork.completionDate ?? '',
    completionYear: artwork.completionYear?.toString() ?? '',
    description: artwork.description,
    medium: artwork.medium,
    material: artwork.material,
    width: artwork.width?.toString() ?? '',
    height: artwork.height?.toString() ?? '',
    depth: artwork.depth?.toString() ?? '',
    measurementUnit: artwork.measurementUnit,
    orientation: artwork.orientation ?? '',
    status: artwork.status,
    price: artwork.priceMinor === null ? '' : (artwork.priceMinor / 100).toFixed(2),
    currency: artwork.currency,
    location: artwork.location,
    notes: artwork.notes,
    tags: artwork.tags,
    genres: artwork.genres,
    collections: artwork.collections,
    pendingImageUri: artwork.primaryImageUri,
  };
}
