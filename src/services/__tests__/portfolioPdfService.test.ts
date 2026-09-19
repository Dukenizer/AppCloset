import type { Artwork } from '@/domain/artwork';
import {
  buildPortfolioArtworkPageHtml,
  buildPortfolioHtml,
  escapeHtml,
  exportPortfolioPdf,
} from '@/services/portfolioPdfService';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///tmp/',
  readAsStringAsync: jest.fn(),
  copyAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/portfolio.pdf' })),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

jest.mock('@/services/imageStorage', () => ({
  imageExists: jest.fn(() => false),
}));

const sampleArtwork = (overrides: Partial<Artwork> = {}): Artwork => ({
  id: 1,
  humanId: 'AC-1',
  title: 'Hidden',
  artist: 'Edwin Estingor',
  completionDate: '2026-01-01',
  completionYear: 2026,
  completionMonth: 1,
  shortDescription: 'A textured study',
  fullDescription: 'Full notes stay private',
  medium: 'Mixed media',
  material: '',
  width: 60,
  height: 80,
  depth: null,
  measurementUnit: 'cm',
  orientation: null,
  framed: false,
  status: 'Available',
  priceMinor: 500000,
  currency: 'PHP',
  hidePrice: false,
  location: '',
  notes: 'Internal note',
  createdAt: '',
  updatedAt: '',
  primaryImageUri: null,
  tags: [],
  genres: [],
  collections: ['Spring Show'],
  ...overrides,
});

describe('portfolioPdfService', () => {
  it('escapes HTML in portfolio content', () => {
    expect(escapeHtml('Tom & "Jerry" <script>')).toBe('Tom &amp; &quot;Jerry&quot; &lt;script&gt;');
  });

  it('builds an artwork page with details and omits status/notes', () => {
    const html = buildPortfolioArtworkPageHtml(sampleArtwork(), 'cm', 'data:image/jpeg;base64,abc');
    expect(html).toContain('Hidden');
    expect(html).toContain('Edwin Estingor');
    expect(html).toContain('Mixed media');
    expect(html).toContain('A textured study');
    expect(html).toContain('Price: PHP 5000.00');
    expect(html).toContain('data:image/jpeg;base64,abc');
    expect(html).not.toContain('Available');
    expect(html).not.toContain('Internal note');
    expect(html).not.toContain('Full notes stay private');
  });

  it('omits price when hidePrice is enabled', () => {
    const html = buildPortfolioArtworkPageHtml(
      sampleArtwork({ hidePrice: true }),
      'cm',
      null,
    );
    expect(html).not.toContain('Price:');
    expect(html).toContain('No image');
  });

  it('builds cover + pages for a named collection', () => {
    const works = [
      sampleArtwork({ id: 1, title: 'Hidden' }),
      sampleArtwork({ id: 2, title: 'Blue Study', artist: 'Edwin Estingor' }),
    ];
    const html = buildPortfolioHtml(
      works,
      { collectionName: 'Spring Show', displayUnit: 'cm' },
      [null, null],
    );
    expect(html).toContain('Spring Show');
    expect(html).toContain('2 artworks');
    expect(html).toContain('Edwin Estingor');
    expect(html).toContain('Hidden');
    expect(html).toContain('Blue Study');
    expect(html).toContain('object-fit: contain');
    expect(html).toContain('ArtCloset portfolio');
  });

  it('escapes collection name on the cover', () => {
    const html = buildPortfolioHtml(
      [sampleArtwork()],
      { collectionName: 'A & B <Show>', displayUnit: 'cm' },
      [null],
    );
    expect(html).toContain('A &amp; B &lt;Show&gt;');
    expect(html).not.toContain('A & B <Show>');
  });

  it('uses coverArtist when artists differ', () => {
    const html = buildPortfolioHtml(
      [
        sampleArtwork({ id: 1, artist: 'Alice' }),
        sampleArtwork({ id: 2, artist: 'Bob', title: 'Other' }),
      ],
      { collectionName: 'Group Show', displayUnit: 'cm', coverArtist: 'Studio Lead' },
      [null, null],
    );
    expect(html).toContain('Studio Lead');
  });

  it('rejects empty collections when exporting', async () => {
    await expect(
      exportPortfolioPdf([], { collectionName: 'Empty', displayUnit: 'cm' }),
    ).rejects.toThrow(/no artworks/i);
  });

  it('rejects blank collection names when exporting', async () => {
    await expect(
      exportPortfolioPdf([sampleArtwork()], { collectionName: '   ', displayUnit: 'cm' }),
    ).rejects.toThrow(/collection name/i);
  });

  it('copies the printed PDF into cache before sharing', async () => {
    const FileSystem = require('expo-file-system/legacy') as {
      copyAsync: jest.Mock;
    };
    const Sharing = require('expo-sharing') as {
      isAvailableAsync: jest.Mock;
      shareAsync: jest.Mock;
    };
    Sharing.isAvailableAsync.mockResolvedValueOnce(true);
    Sharing.shareAsync.mockResolvedValueOnce(undefined);

    const uri = await exportPortfolioPdf([sampleArtwork()], {
      collectionName: 'Nature Series',
      displayUnit: 'cm',
    });

    expect(FileSystem.copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'file:///tmp/portfolio.pdf',
        to: expect.stringMatching(/artcloset-portfolio-Nature-Series-\d+\.pdf$/),
      }),
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    expect(uri).toMatch(/artcloset-portfolio-Nature-Series-\d+\.pdf$/);
  });
});
