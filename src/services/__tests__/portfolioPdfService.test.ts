import type { Artwork } from '@/domain/artwork';
import { formatMediumLine } from '@/domain/catalog';
import { EMPTY_USER_PROFILE, type UserProfile } from '@/domain/profile';
import {
  buildCallingCardHtml,
  buildPortfolioArtworkPageHtml,
  buildPortfolioHtml,
  escapeHtml,
  exportPortfolioPdf,
  portfolioOwnerName,
} from '@/services/portfolioPdfService';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///tmp/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('@/services/printImages', () => ({
  preparePrintImage: jest.fn(async (uri: string) => uri),
}));

jest.mock('@/services/pdfFonts', () => ({
  PDF_DISPLAY_FAMILY: '"ArtCloset Display", Georgia, serif',
  getPdfDisplayFontCss: jest.fn(async () => '@font-face { font-family: "ArtCloset Display"; }'),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/Print/portfolio.pdf', base64: 'JVBERi0x' })),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

jest.mock('@/services/imageStorage', () => ({
  imageExists: jest.fn(() => false),
  resolveStoredImageUri: jest.fn((uri: string | null) => uri || null),
}));

const sampleProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...EMPTY_USER_PROFILE,
  artistName: 'Edwin Estingor',
  studioName: 'Edwin.Estingor.Arts',
  specialtyMedium: 'Watercolor · Acrylic',
  location: 'Pasig City Philippines',
  contactEmail: 'edwin@example.com',
  socialInstagram: 'dukenizer07',
  websiteUrl: 'https://edwin.estingor.arts/',
  ...overrides,
});

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

  it('prints the calling card on the cover with linked email and website', () => {
    const html = buildPortfolioHtml(
      [sampleArtwork()],
      { collectionName: 'Car Series', displayUnit: 'in', profile: sampleProfile() },
      [null],
    );
    expect(html).toContain('class="cover-contact"');
    expect(html).toContain('Edwin.Estingor.Arts');
    expect(html).toContain('Pasig City Philippines');
    expect(html).toContain('href="mailto:edwin@example.com"');
    expect(html).toContain('href="https://edwin.estingor.arts"');
    expect(html).toContain('@dukenizer07');
  });

  it('skips the calling card when the profile has no contact details', () => {
    const card = buildCallingCardHtml(
      { ...EMPTY_USER_PROFILE, artistName: 'Edwin Estingor' },
      null,
    );
    expect(card).toBe('');
    const html = buildPortfolioHtml(
      [sampleArtwork()],
      { collectionName: 'Car Series', displayUnit: 'in', profile: { ...EMPTY_USER_PROFILE } },
      [null],
    );
    expect(html).not.toContain('class="cover-contact"');
  });

  it('uses the studio logo when provided, otherwise a monogram', () => {
    expect(buildCallingCardHtml(sampleProfile(), 'data:image/jpeg;base64,logo')).toContain(
      'src="data:image/jpeg;base64,logo"',
    );
    expect(buildCallingCardHtml(sampleProfile(), null)).toContain('<span class="cc-monogram">E</span>');
  });

  it('escapes calling card text', () => {
    const card = buildCallingCardHtml(sampleProfile({ artistName: 'A <b>&</b>' }), null);
    expect(card).toContain('A &lt;b&gt;&amp;&lt;/b&gt;');
    expect(card).not.toContain('<b>&</b>');
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

  it('copies the printed PDF natively into app cache (no base64 round trip) before sharing', async () => {
    const FileSystem = require('expo-file-system/legacy') as {
      copyAsync: jest.Mock;
      writeAsStringAsync: jest.Mock;
    };
    const Print = require('expo-print') as { printToFileAsync: jest.Mock };
    const Sharing = require('expo-sharing') as {
      isAvailableAsync: jest.Mock;
      shareAsync: jest.Mock;
    };
    jest.clearAllMocks();
    Sharing.isAvailableAsync.mockResolvedValueOnce(true);
    Sharing.shareAsync.mockResolvedValueOnce(undefined);

    const uri = await exportPortfolioPdf([sampleArtwork()], {
      collectionName: 'Nature Series',
      displayUnit: 'cm',
    });

    expect(uri).toMatch(/^file:\/\/\/tmp\/artcloset-portfolio-Nature-Series-\d+\.pdf$/);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///tmp/Print/portfolio.pdf', to: uri });
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(Print.printToFileAsync.mock.calls[0][0].base64).toBeUndefined();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('falls back to writing base64 when the printed file cannot be copied (Expo Go)', async () => {
    const FileSystem = require('expo-file-system/legacy') as {
      copyAsync: jest.Mock;
      writeAsStringAsync: jest.Mock;
    };
    jest.clearAllMocks();
    FileSystem.copyAsync.mockRejectedValueOnce(new Error('not readable'));

    const uri = await exportPortfolioPdf([sampleArtwork()], {
      collectionName: 'Nature Series',
      displayUnit: 'cm',
    });

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(uri, 'JVBERi0x', { encoding: 'base64' });
  });

  it('prepares images one at a time at print size and reports progress', async () => {
    const imageStorage = require('@/services/imageStorage') as { imageExists: jest.Mock };
    const printImages = require('@/services/printImages') as { preparePrintImage: jest.Mock };
    const FileSystem = require('expo-file-system/legacy') as { readAsStringAsync: jest.Mock };
    jest.clearAllMocks();
    imageStorage.imageExists.mockReturnValue(true);
    FileSystem.readAsStringAsync.mockResolvedValue('aW1n');
    let inFlight = 0;
    let maxInFlight = 0;
    printImages.preparePrintImage.mockImplementation(async (uri: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return `${uri}.print.jpg`;
    });
    const progress: string[] = [];

    await exportPortfolioPdf(
      [
        sampleArtwork({ id: 1, primaryImageUri: 'file:///a.jpg' }),
        sampleArtwork({ id: 2, primaryImageUri: 'file:///b.jpg' }),
      ],
      { collectionName: 'Nature Series', displayUnit: 'cm', onProgress: (m) => progress.push(m) },
    );

    expect(maxInFlight).toBe(1);
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///a.jpg.print.jpg', { encoding: 'base64' });
    expect(progress).toEqual(['Preparing image 1 of 2…', 'Preparing image 2 of 2…', 'Creating PDF…']);
    imageStorage.imageExists.mockReturnValue(false);
  });

  it('numbers each artwork page and lists year, medium, size, then price', () => {
    const html = buildPortfolioArtworkPageHtml(
      sampleArtwork({ medium: 'Oil', material: 'Canvas' }),
      'cm',
      null,
      { number: 3 },
    );
    expect(html).toContain('<p class="plate">No. 3</p>');
    const order = ['January 2026', 'Oil on Canvas', '60', 'Price: PHP 5000.00'].map((text) => html.indexOf(text));
    expect(order.every((pos) => pos > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('does not repeat a material the medium already names', () => {
    expect(formatMediumLine('Oil on canvas', 'Canvas')).toBe('Oil on canvas');
    expect(formatMediumLine('Oil', 'Canvas')).toBe('Oil on Canvas');
    expect(formatMediumLine('', 'Paper')).toBe('Paper');
    expect(formatMediumLine('Watercolor', '')).toBe('Watercolor');
  });

  it('adds a footer with collection and owner to artwork pages only, not the cover', () => {
    const html = buildPortfolioHtml(
      [sampleArtwork({ id: 1 }), sampleArtwork({ id: 2, title: 'Second' })],
      { collectionName: 'Car <Series>', displayUnit: 'cm', profile: sampleProfile() },
      [null, null],
    );
    const footers = html.match(/<footer class="page-footer">.*?<\/footer>/g) ?? [];
    expect(footers).toHaveLength(2);
    expect(footers[0]).toBe(
      '<footer class="page-footer"><span>Car &lt;Series&gt;</span><span>Edwin Estingor</span></footer>',
    );
    expect(html.indexOf('class="page-footer"')).toBeGreaterThan(html.indexOf('class="page artwork-page"'));
    expect(html).toContain('<p class="plate">No. 2</p>');
  });

  it('picks the footer owner from the profile, then cover artist, then a single shared artist', () => {
    const works = [sampleArtwork({ artist: 'Alice' }), sampleArtwork({ id: 2, artist: 'Bob' })];
    expect(portfolioOwnerName(works, { collectionName: 'X', displayUnit: 'cm', profile: sampleProfile() })).toBe(
      'Edwin Estingor',
    );
    expect(portfolioOwnerName(works, { collectionName: 'X', displayUnit: 'cm', coverArtist: 'Studio Lead' })).toBe(
      'Studio Lead',
    );
    expect(portfolioOwnerName(works, { collectionName: 'X', displayUnit: 'cm' })).toBe('');
    expect(portfolioOwnerName([works[0]!], { collectionName: 'X', displayUnit: 'cm' })).toBe('Alice');
  });
});
