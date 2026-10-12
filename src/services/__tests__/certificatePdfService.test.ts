import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { CERTIFICATE_SNAPSHOT_VERSION, type CertificateSnapshot } from '@/domain/certificate';
import { buildCertificateHtml, printCertificate, shareCertificatePdf } from '@/services/certificatePdfService';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///tmp/',
  readAsStringAsync: jest.fn(async () => 'AAAA'),
  writeAsStringAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('@/services/printImages', () => ({
  preparePrintImage: jest.fn(async (uri: string) => `${uri}#print`),
}));

jest.mock('@/services/pdfFonts', () => ({
  PDF_DISPLAY_FAMILY: '"ArtCloset Display", Georgia, serif',
  getPdfDisplayFontCss: jest.fn(async () => ''),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/Print/cert.pdf' })),
  printAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('@/services/imageStorage', () => ({
  imageExists: jest.fn((uri: string | null) => Boolean(uri)),
  resolveStoredImageUri: jest.fn((uri: string | null) => uri || null),
}));

const snapshot = (overrides: Partial<CertificateSnapshot> = {}): CertificateSnapshot => ({
  version: CERTIFICATE_SNAPSHOT_VERSION,
  title: 'River <at> Dusk',
  artist: 'Edwin Estingor',
  year: 'March 2025',
  medium: 'Oil on Canvas',
  size: '60 × 80 cm',
  sizeUnit: 'cm',
  artworkId: 'AC-1',
  price: '',
  issuer: 'Edwin Estingor',
  contacts: ['edwin@example.com', 'edwin.example.com'],
  ...overrides,
});

const issued = { number: 'COA-2026-0004', issuedAt: '2026-10-12T10:00:00.000Z' };
const assets = { imageDataUri: 'data:image/jpeg;base64,AAAA' };

describe('buildCertificateHtml', () => {
  it('prints the number, escaped details, signature and contacts', () => {
    const html = buildCertificateHtml({ snapshot: snapshot(), ...issued }, assets);

    expect(html).not.toContain('class="logo"');
    expect(html).toContain('Certificate No. COA-2026-0004');
    expect(html).toContain('River &lt;at&gt; Dusk');
    expect(html).not.toContain('River <at> Dusk');
    expect(html).toContain('<dt>Artwork ID</dt><dd>AC-1</dd>');
    expect(html).toContain('Artist signature');
    expect(html).toContain('edwin@example.com  ·  edwin.example.com');
    expect(html).not.toContain('class="watermark"');
  });

  it('leaves out empty fields such as an omitted price', () => {
    const html = buildCertificateHtml({ snapshot: snapshot({ year: '' }), ...issued }, assets);
    expect(html).not.toContain('<dt>Price</dt>');
    expect(html).not.toContain('<dt>Year</dt>');
    expect(buildCertificateHtml({ snapshot: snapshot({ price: 'PHP 12500.00' }), ...issued }, assets)).toContain(
      '<dt>Price</dt><dd>PHP 12500.00</dd>',
    );
  });

  it('marks a preview as a draft without a number', () => {
    const html = buildCertificateHtml({ snapshot: snapshot(), number: null, issuedAt: issued.issuedAt }, assets);
    expect(html).toContain('Draft · number assigned when issued');
    expect(html).toContain('class="watermark"');
    expect(html).not.toContain('Certificate No.');
  });

  it('labels the signature for someone other than the artist', () => {
    const html = buildCertificateHtml({ snapshot: snapshot({ issuer: 'Pasig Art Club' }), ...issued }, assets);
    expect(html).toContain('Signature of issuer');
    expect(html).toContain('the issuer’s knowledge');
  });

  it('shows a placeholder when the artwork has no image', () => {
    const html = buildCertificateHtml({ snapshot: snapshot(), ...issued }, { imageDataUri: null });
    expect(html).toContain('class="art missing"');
  });
});

describe('certificate export', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shares a PDF named after the certificate number using a print-sized photo', async () => {
    const uri = await shareCertificatePdf({ snapshot: snapshot(), ...issued }, 'images/river.jpg');

    expect(uri).toBe('file:///tmp/artcloset-certificate-COA-2026-0004.pdf');
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    expect(html).toContain('data:image/jpeg;base64,AAAA');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/pdf' }));
  });

  it('opens the system print preview', async () => {
    await printCertificate({ snapshot: snapshot(), number: null, issuedAt: issued.issuedAt }, null);
    expect(Print.printAsync).toHaveBeenCalledWith(expect.objectContaining({ width: 612, height: 792 }));
  });
});
