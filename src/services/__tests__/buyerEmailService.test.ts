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

  it('formats an entry with dimensions in the display unit', () => {
    const entry = formatArtworkEmailEntry(sampleArtwork(), 'in');
    expect(entry).toContain('Blue Study');
    expect(entry).toContain('Medium: Oil on canvas');
    expect(entry).toContain('Dimensions:');
    expect(entry).toContain('in');
    expect(entry).toContain('Price: USD 1250.00');
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
    expect(body).toContain('Shown Price');
    expect(body).toContain('Hidden Price');
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
});
