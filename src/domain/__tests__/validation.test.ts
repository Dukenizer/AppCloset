import { EMPTY_ARTWORK_DRAFT, type ArtworkDraft } from '../artwork';
import { priceToMinorUnits, validateArtwork, isSingleSentence } from '../validation';

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

  it('requires a title and completion year', () => {
    const errors = validateArtwork({ ...validDraft(), title: ' ', completionYear: '' });
    expect(errors.title).toBe('Title is required.');
    expect(errors.completionYear).toBe('Completion year is required.');
  });

  it('rejects impossible dimensions, months, years, multi-sentence short text, and overlong full text', () => {
    const errors = validateArtwork({
      ...validDraft(),
      width: '-2',
      completionMonth: '13',
      completionYear: '9999',
      shortDescription: 'First sentence. Second sentence.',
      fullDescription: 'y'.repeat(401),
    });
    expect(errors.width).toBeDefined();
    expect(errors.completionMonth).toBeDefined();
    expect(errors.completionYear).toBeDefined();
    expect(errors.shortDescription).toBe('Short description must be a single sentence.');
    expect(errors.fullDescription).toBeDefined();
  });
});

describe('isSingleSentence', () => {
  it('accepts empty and one-sentence copy', () => {
    expect(isSingleSentence('')).toBe(true);
    expect(isSingleSentence('A quiet study of light and shadow.')).toBe(true);
    expect(isSingleSentence('Oil on canvas exploring memory')).toBe(true);
  });

  it('rejects line breaks and multiple sentences', () => {
    expect(isSingleSentence('Line one\nLine two')).toBe(false);
    expect(isSingleSentence('First idea. Second idea.')).toBe(false);
  });
});

describe('priceToMinorUnits', () => {
  it('uses integer minor units to avoid floating-point storage errors', () => {
    expect(priceToMinorUnits('19.99')).toBe(1999);
    expect(priceToMinorUnits('')).toBeNull();
  });
});
