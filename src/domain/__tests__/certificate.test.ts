import type { Artwork } from '@/domain/artwork';
import {
  buildCertificateSnapshot,
  certificateBlocker,
  certificateDetailsChanged,
  certificatePriceAvailable,
  nextCertificateNumber,
  parseCertificateNumber,
  parseCertificateSnapshot,
} from '@/domain/certificate';
import { formatLabelDimensions } from '@/domain/dimensions';
import { EMPTY_USER_PROFILE, type UserProfile } from '@/domain/profile';

const artwork = (overrides: Partial<Artwork> = {}): Artwork => ({
  id: 7,
  humanId: 'AC-20260101-123',
  title: 'River at Dusk',
  artist: 'Edwin Estingor',
  completionDate: null,
  completionYear: 2025,
  completionMonth: 3,
  shortDescription: '',
  fullDescription: '',
  medium: 'Oil',
  material: 'Canvas',
  width: 60,
  height: 80,
  depth: null,
  measurementUnit: 'cm',
  orientation: null,
  framed: false,
  status: 'Sold',
  priceMinor: 1250000,
  currency: 'PHP',
  hidePrice: false,
  location: '',
  notes: 'private',
  createdAt: '',
  updatedAt: '',
  primaryImageUri: null,
  tags: [],
  genres: [],
  collections: [],
  ...overrides,
});

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...EMPTY_USER_PROFILE,
  artistName: 'Edwin Estingor',
  contactEmail: 'edwin@example.com',
  websiteUrl: 'https://edwin.example.com/',
  ...overrides,
});

describe('buildCertificateSnapshot', () => {
  it('captures the printed details in gallery style', () => {
    const snapshot = buildCertificateSnapshot(artwork(), profile(), 'cm', { includePrice: false });

    expect(snapshot).toMatchObject({
      title: 'River at Dusk',
      artist: 'Edwin Estingor',
      year: 'March 2025',
      medium: 'Oil on Canvas',
      size: formatLabelDimensions(60, 80, null, 'cm'),
      sizeUnit: 'cm',
      artworkId: 'AC-20260101-123',
      price: '',
      issuer: 'Edwin Estingor',
      contacts: ['edwin@example.com', 'edwin.example.com'],
    });
  });

  it('prints the price only when asked and not hidden', () => {
    expect(buildCertificateSnapshot(artwork(), profile(), 'cm', { includePrice: true }).price).toBe('PHP 12500.00');
    expect(
      buildCertificateSnapshot(artwork({ hidePrice: true }), profile(), 'cm', { includePrice: true }).price,
    ).toBe('');
    expect(certificatePriceAvailable(artwork({ priceMinor: null }))).toBe(false);
  });

  it('falls back to the artwork artist as issuer when the profile has no name', () => {
    const snapshot = buildCertificateSnapshot(artwork(), { ...EMPTY_USER_PROFILE }, 'cm', { includePrice: false });
    expect(snapshot.issuer).toBe('Edwin Estingor');
    expect(snapshot.contacts).toEqual([]);
  });
});

describe('certificateBlocker', () => {
  it('requires an artist name', () => {
    expect(certificateBlocker(artwork())).toBeNull();
    expect(certificateBlocker(artwork({ artist: '  ' }))).toMatch(/artist/);
  });
});

describe('certificateDetailsChanged', () => {
  const issued = buildCertificateSnapshot(artwork(), profile(), 'in', { includePrice: true });

  it('ignores edits that the certificate does not print', () => {
    expect(certificateDetailsChanged(issued, artwork({ notes: 'new', status: 'Available', priceMinor: 1 }))).toBe(false);
  });

  it('compares size in the unit the certificate was printed in', () => {
    expect(certificateDetailsChanged(issued, artwork())).toBe(false);
    expect(certificateDetailsChanged(issued, artwork({ width: 61 }))).toBe(true);
  });

  it('flags title and year edits', () => {
    expect(certificateDetailsChanged(issued, artwork({ title: 'River' }))).toBe(true);
    expect(certificateDetailsChanged(issued, artwork({ completionMonth: null }))).toBe(true);
  });
});

describe('nextCertificateNumber', () => {
  it('numbers sequentially within the year', () => {
    expect(nextCertificateNumber([], 2026)).toBe('COA-2026-0001');
    expect(nextCertificateNumber(['COA-2026-0001', 'COA-2026-0007', 'COA-2025-0040'], 2026)).toBe('COA-2026-0008');
  });

  it('continues past a floor of numbers already handed out on this device', () => {
    expect(nextCertificateNumber(['COA-2026-0003'], 2026, 5)).toBe('COA-2026-0006');
    expect(nextCertificateNumber(['COA-2026-0009'], 2026, 5)).toBe('COA-2026-0010');
  });

  it('parses numbers', () => {
    expect(parseCertificateNumber('COA-2026-0042')).toEqual({ year: 2026, sequence: 42 });
    expect(parseCertificateNumber('AC-2026-0042')).toBeNull();
  });

  it('keeps counting past 9999 and ignores unrelated values', () => {
    expect(nextCertificateNumber(['COA-2026-9999', 'junk', 'COA-26-0005'], 2026)).toBe('COA-2026-10000');
  });
});

describe('parseCertificateSnapshot', () => {
  it('round-trips a stored snapshot', () => {
    const snapshot = buildCertificateSnapshot(artwork(), profile(), 'cm', { includePrice: true });
    expect(parseCertificateSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('rejects unreadable or unknown versions', () => {
    expect(parseCertificateSnapshot('{')).toBeNull();
    expect(parseCertificateSnapshot(JSON.stringify({ version: 2, title: 'a', artist: 'b' }))).toBeNull();
    expect(parseCertificateSnapshot(JSON.stringify({ version: 1, title: '', artist: 'b' }))).toBeNull();
  });
});
