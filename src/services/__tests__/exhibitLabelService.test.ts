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

  it('builds one PDF page per label at the chosen size', () => {
    const html = buildExhibitLabelsHtml(
      [
        { title: 'First Work', artist: 'One', date: '2024', medium: 'Ink' },
        { title: 'Second Work', artist: 'Two', date: '2025', medium: 'Acrylic' },
      ],
      '3x4',
    );
    expect(html).toContain('size: 3in 4in');
    expect(html).toContain('First Work');
    expect(html).toContain('Second Work');
    expect(html.match(/class="label"/g)?.length).toBe(2);
  });
});
