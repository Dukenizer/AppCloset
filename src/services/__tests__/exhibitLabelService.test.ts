import { letterSheetGrid } from '@/domain/exhibitLabel';
import type { Artwork } from '@/domain/artwork';
import {
  artworkToLabelContent,
  buildExhibitLabelsHtml,
  escapeHtml,
} from '@/services/exhibitLabelService';

const sampleArtwork = (): Artwork => ({
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
  width: null,
  height: null,
  depth: null,
  measurementUnit: 'cm',
  orientation: null,
  framed: false,
  status: 'Available',
  priceMinor: null,
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
});

describe('exhibitLabelService', () => {
  it('escapes HTML in label content', () => {
    expect(escapeHtml('Tom & "Jerry" <script>')).toBe('Tom &amp; &quot;Jerry&quot; &lt;script&gt;');
  });

  it('maps artwork fields to label content', () => {
    expect(artworkToLabelContent(sampleArtwork())).toEqual({
      title: 'Blue Study',
      artist: 'Jane Doe',
      date: 'June 2024',
      medium: 'Oil on canvas',
    });
  });

  it('packs multiple 3x4 labels onto one Letter sheet by default', () => {
    const grid = letterSheetGrid('3x4');
    expect(grid.perPage).toBeGreaterThanOrEqual(3);
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(2);

    const html = buildExhibitLabelsHtml(
      [
        { title: 'Autumn Tiger', artist: 'EDWIN ESTINGOR', date: '2019', medium: 'Oil' },
        { title: 'Hidden', artist: 'EDWIN ESTINGOR', date: '2026', medium: 'Oil' },
        { title: 'Mixed Veggies', artist: 'EDWIN ESTINGOR', date: '2022', medium: 'Oil' },
      ],
      '3x4',
      'letter-sheet',
    );
    expect(html).toContain('size: 8.5in 11in');
    expect(html).toContain('Autumn Tiger');
    expect(html).toContain('Hidden');
    expect(html).toContain('Mixed Veggies');
    expect(html.match(/class="sheet"/g)?.length).toBe(1);
    expect(html.match(/class="label"/g)?.length).toBe(3);
  });

  it('keeps one page per label for label-stock mode', () => {
    const html = buildExhibitLabelsHtml(
      [
        { title: 'First Work', artist: 'One', date: '2024', medium: 'Ink' },
        { title: 'Second Work', artist: 'Two', date: '2025', medium: 'Acrylic' },
      ],
      '3x4',
      'label-stock',
    );
    expect(html).toContain('size: 3in 4in');
    expect(html.match(/class="label"/g)?.length).toBe(2);
    expect(html).not.toContain('class="sheet"');
  });
});
