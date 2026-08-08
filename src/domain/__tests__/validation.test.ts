import { EMPTY_ARTWORK_DRAFT, type ArtworkDraft } from '../artwork';
import { priceToMinorUnits, validateArtwork } from '../validation';

const validDraft = (): ArtworkDraft => ({
  ...EMPTY_ARTWORK_DRAFT,
  humanId: 'AC-0001',
  title: 'Study in Blue',
  completionYear: '2026',
});

describe('validateArtwork', () => {
  it('accepts a valid minimal artwork', () => {
    expect(validateArtwork(validDraft())).toEqual({});
  });

  it('requires a title and human-readable ID', () => {
    const errors = validateArtwork({ ...validDraft(), title: ' ', humanId: '' });
    expect(errors.title).toBe('Title is required.');
    expect(errors.humanId).toBe('Artwork ID is required.');
  });

  it('rejects impossible dimensions, dates, and currency codes', () => {
    const errors = validateArtwork({
      ...validDraft(),
      width: '-2',
      completionDate: 'not-a-date',
      completionYear: '9999',
      currency: 'usd',
    });
    expect(errors.width).toBeDefined();
    expect(errors.completionDate).toBeDefined();
    expect(errors.completionYear).toBeDefined();
    expect(errors.currency).toBeDefined();
  });
});

describe('priceToMinorUnits', () => {
  it('uses integer minor units to avoid floating-point storage errors', () => {
    expect(priceToMinorUnits('19.99')).toBe(1999);
    expect(priceToMinorUnits('')).toBeNull();
  });
});
