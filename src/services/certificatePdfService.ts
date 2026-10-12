import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { formatCertificateDate, type CertificateSnapshot } from '@/domain/certificate';
import { getPdfDisplayFontCss, PDF_DISPLAY_FAMILY } from '@/services/pdfFonts';
import { escapeHtml, readImageDataUri } from '@/services/portfolioPdfService';
import { printHtmlToCachePdf } from '@/services/printPdf';

const LETTER = { width: 612, height: 792 } as const;

export type CertificateDocument = {
  snapshot: CertificateSnapshot;
  /** Null for a draft preview: the number is assigned only when the certificate is issued. */
  number: string | null;
  issuedAt: string;
};

export type CertificateAssets = {
  imageDataUri: string | null;
  fontFaceCss?: string;
};

/**
 * Thin calligraphic sweep with an interlaced knot at the centre. The right half is drawn once and
 * mirrored; the sweep is a filled shape so it tapers to fine points at both ends.
 */
const ORNAMENT_HALF = `
  <path d="M166 14.4 C200 13.8 236 21.6 260 22.2 C277 22.6 289 17 297 6.5 C291 18.6 278 25.4 260 25.2 C236 24.9 200 16.4 166 15.9 Z" fill="#2E2620" stroke="none" />
  <path d="M164 12.2 C173 8.6 183 8.6 192 11.4" stroke-width="0.7" />
  <path d="M164 17.8 C173 21.4 183 21.4 192 18.6" stroke-width="0.7" />`;

const ORNAMENT_KNOT = `
  <path d="M120 15 C128 9.5 136 10.5 141 15 C136 19.5 128 20.5 120 15 Z" stroke-width="0.8" />
  <path d="M180 15 C172 9.5 164 10.5 159 15 C164 19.5 172 20.5 180 15 Z" stroke-width="0.8" />
  <path d="M134 15 L142 8.5 L150 15 L158 8.5 L166 15" stroke-width="0.85" />
  <path d="M134 15 L142 21.5 L150 15 L158 21.5 L166 15" stroke-width="0.85" />
  <path d="M142 15 L150 10 L158 15 L150 20 Z" stroke-width="0.85" />`;

const ornamentSvg = (position: 'top' | 'bottom'): string =>
  `<svg class="ornament ornament-${position}" viewBox="0 0 300 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="#2E2620" stroke-linecap="round" stroke-linejoin="round"${
    position === 'top' ? ' transform="translate(0 30) scale(1 -1)"' : ''
  }>
    ${ORNAMENT_HALF}
    <g transform="translate(300 0) scale(-1 1)">${ORNAMENT_HALF}</g>
    ${ORNAMENT_KNOT}
  </g>
</svg>`;

/** Titles may be up to 200 characters; step the size down so the whole title always fits. */
const titleSizeClass = (title: string): string => {
  if (title.length > 120) return ' longest';
  if (title.length > 60) return ' long';
  return '';
};

export const buildCertificateHtml = (doc: CertificateDocument, assets: CertificateAssets): string => {
  const s = doc.snapshot;
  const draft = doc.number === null;
  const rows: [string, string][] = [
    ['Title', s.title],
    ['Artist', s.artist],
    ['Year', s.year],
    ['Medium', s.medium],
    ['Size', s.size],
    ['Artwork ID', s.artworkId],
    ['Price', s.price],
  ];
  const fields = rows
    .filter(([, value]) => value.trim())
    .map(
      ([label, value]) =>
        `<div class="field${label === 'Title' ? ` field-title${titleSizeClass(value)}` : ''}"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('\n');
  const image = assets.imageDataUri
    ? `<div class="art"><img src="${assets.imageDataUri}" alt="${escapeHtml(s.title)}" /></div>`
    : `<div class="art missing"><p>No image</p></div>`;
  const issuerIsArtist = s.issuer.trim().toLowerCase() === s.artist.trim().toLowerCase();
  const issuer = escapeHtml(s.issuer || s.artist);
  const numberLine = draft ? 'Draft · number assigned when issued' : `Certificate No. ${escapeHtml(doc.number!)}`;
  const contacts = s.contacts.map(escapeHtml).join('  ·  ');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    ${assets.fontFaceCss ?? ''}
    @page { margin: 0; size: letter; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #211E1B; background: #fff; }
    .page { position: relative; width: ${LETTER.width}pt; height: ${LETTER.height}pt; padding: 26pt; background: #FBF7F0; }
    /* Gold double rule, like the calling card frame. */
    .frame { height: 100%; padding: 4pt; border: 1.5pt solid #C88E3F; }
    .inner {
      position: relative;
      height: 100%;
      padding: 30pt 36pt 24pt;
      border: 0.6pt solid #C88E3F;
      display: flex;
      flex-direction: column;
    }
    .head { text-align: center; }
    .eyebrow {
      margin: 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 13pt;
      letter-spacing: 0.26em;
      text-transform: uppercase;
      color: #8A6A3B;
    }
    .heading {
      margin: 4pt 0 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 36pt;
      font-weight: 600;
      line-height: 1.05;
    }
    .ornament { display: block; width: 240pt; height: 24pt; margin: 0 auto; }
    .ornament-top { margin-bottom: 8pt; }
    .ornament-bottom { margin-top: 8pt; }
    .number {
      margin: 10pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6D655C;
    }
    /* Spare height is shared between the sections instead of pooling above the signatures. */
    .main { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; gap: 11pt; padding-top: 4pt; }
    .body { display: flex; gap: 24pt; align-items: flex-start; }
    .art {
      width: 230pt;
      height: 290pt;
      flex-shrink: 0;
      padding: 14pt;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #EFE8DD;
      overflow: hidden;
    }
    .art img {
      max-width: 100%;
      max-height: 262pt;
      object-fit: contain;
      border: 6pt solid #FFFFFF;
      outline: 1pt solid #2B2622;
      box-shadow: 0 3pt 9pt rgba(0, 0, 0, 0.2);
    }
    .art.missing { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11pt; color: #6D655C; }
    dl { flex: 1; min-width: 0; margin: 0; }
    .field { padding: 5pt 0 6pt; border-bottom: 0.5pt solid #E3D3B8; }
    .field:first-child { padding-top: 0; }
    dt {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 7.5pt;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8C8378;
    }
    dd {
      margin: 2pt 0 0;
      font-size: 11.5pt;
      line-height: 1.25;
      color: #2B2622;
      overflow-wrap: anywhere;
    }
    .field-title dd {
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 18pt;
      font-weight: 600;
      line-height: 1.1;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
    }
    /* Smaller rather than cut off: a certificate should show the full title. */
    .field-title.long dd { font-size: 14pt; -webkit-line-clamp: 5; }
    .field-title.longest dd { font-size: 11.5pt; -webkit-line-clamp: 7; }
    .statement {
      margin: 0 8pt;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 13.5pt;
      font-style: italic;
      font-weight: 500;
      line-height: 1.45;
      text-align: center;
      color: #4A433C;
    }
    .sign { display: flex; justify-content: space-between; gap: 36pt; }
    .sign > div { flex: 1; text-align: center; }
    .sign-space { height: 32pt; display: flex; align-items: flex-end; justify-content: center; font-size: 12pt; }
    .sign-line { height: 0.75pt; background: #2B2622; margin-top: 4pt; }
    .sign-name { margin: 6pt 0 0; font-size: 11pt; color: #2B2622; }
    .caption {
      margin: 2pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 7.5pt;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8C8378;
    }
    .foot {
      margin-top: 14pt;
      padding-top: 6pt;
      border-top: 0.5pt solid #E3D3B8;
      display: flex;
      justify-content: space-between;
      gap: 12pt;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 7.5pt;
      color: #8C8378;
    }
    .foot span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .foot span:last-child { flex-shrink: 0; font-style: italic; }
    .watermark {
      position: absolute;
      top: 46%;
      left: 0;
      right: 0;
      text-align: center;
      transform: rotate(-28deg);
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 110pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: rgba(200, 142, 63, 0.16);
      pointer-events: none;
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="frame">
      <div class="inner">
        <header class="head">
          ${ornamentSvg('top')}
          <p class="eyebrow">Certificate of</p>
          <h1 class="heading">Authenticity</h1>
          ${ornamentSvg('bottom')}
          <p class="number">${numberLine}</p>
        </header>
        <div class="main">
        <div class="body">
          ${image}
          <dl>${fields}</dl>
        </div>
        <p class="statement">This certifies that the artwork described above is an original work by ${escapeHtml(s.artist)}, and that the information given is accurate to the best of ${issuerIsArtist ? 'the artist’s' : 'the issuer’s'} knowledge.</p>
        <div class="sign">
          <div>
            <div class="sign-space"></div>
            <div class="sign-line"></div>
            <p class="sign-name">${issuer}</p>
            <p class="caption">${issuerIsArtist ? 'Artist signature' : 'Signature of issuer'}</p>
          </div>
          <div>
            <div class="sign-space">${escapeHtml(formatCertificateDate(doc.issuedAt))}</div>
            <div class="sign-line"></div>
            <p class="sign-name">&nbsp;</p>
            <p class="caption">Date of issue</p>
          </div>
        </div>
        </div>
        <footer class="foot">
          <span>${contacts}</span>
          <span>Issued with ArtCloset</span>
        </footer>
        ${draft ? '<div class="watermark">DRAFT</div>' : ''}
      </div>
    </div>
  </section>
</body>
</html>`;
};

const loadAssets = async (imageUri: string | null): Promise<CertificateAssets> => {
  const [imageDataUri, fontFaceCss] = await Promise.all([readImageDataUri(imageUri, true), getPdfDisplayFontCss()]);
  return { imageDataUri, fontFaceCss };
};

const assertNativeApp = (): void => {
  if (Platform.OS === 'web') {
    throw new Error('Certificates are available in the Android and iOS apps.');
  }
};

/** Opens the system print preview, where the certificate can be checked, printed or saved. */
export async function printCertificate(
  doc: CertificateDocument,
  imageUri: string | null,
): Promise<void> {
  assertNativeApp();
  const html = buildCertificateHtml(doc, await loadAssets(imageUri));
  await Print.printAsync({ html, width: LETTER.width, height: LETTER.height });
}

export async function shareCertificatePdf(
  doc: CertificateDocument & { number: string },
  imageUri: string | null,
): Promise<string> {
  assertNativeApp();
  const html = buildCertificateHtml(doc, await loadAssets(imageUri));
  const uri = await printHtmlToCachePdf(html, LETTER, `artcloset-certificate-${doc.number}.pdf`);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Certificate ${doc.number}`,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
