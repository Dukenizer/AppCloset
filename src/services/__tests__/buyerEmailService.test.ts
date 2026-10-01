import type { Artwork } from '@/domain/artwork';
import {
  buildBuyerEmailBody,
  buildBuyerEmailSubject,
  formatArtworkEmailEntry,
  formatArtworkPriceLine,
} from '@/services/buyerEmailService';

const sampleArtwork = (overrides: Partial<Artwork> = {}): Artwork => ({
  id: 1,
  humanId: 'AC-1',
  title: 'Blue Study',
  artist: 'Jane Doe',
  completionDate: '2024-06-01',
  completionYear: 2024,
  completionMonth: 6,
  shortDescription: '',
  fullDescription: '',
  medium: 'Oil on canvas',
  material: '',
  width: 40,
  height: 50,
  depth: null,
  measurementUnit: 'cm',
  orientation: null,
  framed: false,
  status: 'Available',
  priceMinor: 125000,
  currency: 'USD',
  hidePrice: false,
  location: '',
  notes: '',
  createdAt: '',
  updatedAt: '',
  primaryImageUri: null,
  tags: [],
  genres: [],
  collections: [],
  ...overrides,
});

describe('buyerEmailService', () => {
  it('includes price when visible', () => {
    expect(formatArtworkPriceLine(sampleArtwork())).toBe('Price: USD 1250.00');
  });

  it('omits price when hidePrice is enabled', () => {
    expect(formatArtworkPriceLine(sampleArtwork({ hidePrice: true }))).toBeNull();
  });

  it('omits price when price is unset', () => {
    expect(formatArtworkPriceLine(sampleArtwork({ priceMinor: null }))).toBeNull();
  });

  it('formats a numbered entry with year, medium, material, size and price', () => {
    const entry = formatArtworkEmailEntry(
      sampleArtwork({ medium: 'Oil', material: 'Canvas', width: 17.78, height: 25.4 }),
      'in',
      2,
    );
    expect(entry.split('\n')).toEqual([
      '2. Blue Study',
      '   Year: June 2024',
      '   Medium: Oil',
      '   Material: Canvas',
      '   Size: 7.0" × 10.0"',
      '   Price: USD 1250.00',
    ]);
    expect(entry).not.toContain('Dimensions');
  });

  it('skips empty year, material and size lines', () => {
    const entry = formatArtworkEmailEntry(
      sampleArtwork({ completionYear: null, completionMonth: null, material: '', width: null, height: null }),
      'cm',
    );
    expect(entry).not.toMatch(/Year:|Material:|Size:/);
    expect(entry.startsWith('1. Blue Study')).toBe(true);
  });

  it('builds a multi-piece body and skips hidden prices', () => {
    const body = buildBuyerEmailBody(
      [
        sampleArtwork({ id: 1, title: 'Shown Price', hidePrice: false }),
        sampleArtwork({ id: 2, title: 'Hidden Price', hidePrice: true, priceMinor: 9900 }),
      ],
      'cm',
    );
    expect(body).toContain('Here are the 2 artworks we discussed:');
    expect(body).toContain('1. Shown Price');
    expect(body).toContain('\n\n2. Hidden Price');
    expect(body).not.toContain('•');
    expect(body).toContain('Price: USD 1250.00');
    expect(body).not.toContain('Price: USD 99.00');
  });

  it('builds a singular subject for one artwork', () => {
    expect(buildBuyerEmailSubject([sampleArtwork()])).toBe('Artwork: Blue Study');
  });

  it('builds a count subject for multiple artworks', () => {
    expect(buildBuyerEmailSubject([sampleArtwork(), sampleArtwork({ id: 2 })])).toBe(
      '2 artworks from ArtCloset',
    );
  });

  it('uses collection name in subject when sharing a collection', () => {
    expect(
      buildBuyerEmailSubject([sampleArtwork(), sampleArtwork({ id: 2 })], {
        collectionName: 'Spring Show',
      }),
    ).toBe('Collection: Spring Show');
  });

  it('uses collection name in body intro for multiple works', () => {
    const body = buildBuyerEmailBody(
      [sampleArtwork({ id: 1 }), sampleArtwork({ id: 2, title: 'Red Study' })],
      'cm',
      { collectionName: 'Spring Show' },
    );
    expect(body).toContain('Here are the 2 artworks from “Spring Show”:');
    expect(body).toContain('Blue Study');
    expect(body).toContain('Red Study');
  });

  it('uses collection name in body intro for a single work', () => {
    const body = buildBuyerEmailBody([sampleArtwork()], 'cm', { collectionName: 'Spring Show' });
    expect(body).toContain('Here is the artwork from “Spring Show”:');
  });

  it('trims blank collection names back to default copy', () => {
    expect(buildBuyerEmailSubject([sampleArtwork()], { collectionName: '  ' })).toBe(
      'Artwork: Blue Study',
    );
  });
});
