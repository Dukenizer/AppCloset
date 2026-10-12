import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Artwork } from '@/domain/artwork';
import {
  callingCardContacts,
  hasPrintableCallingCard,
  layoutContactRows,
  type CallingCardContact,
} from '@/domain/callingCard';
import { formatCompletionLabel, formatMediumLine } from '@/domain/catalog';
import { formatLabelDimensions } from '@/domain/dimensions';
import { profileArtistName, type DisplayUnit, type UserProfile } from '@/domain/profile';
import { formatArtworkPriceLine } from '@/services/buyerEmailService';
import { imageExists, resolveStoredImageUri } from '@/services/imageStorage';
import { getPdfDisplayFontCss, PDF_DISPLAY_FAMILY } from '@/services/pdfFonts';
import { preparePrintImage } from '@/services/printImages';
import { printHtmlToCachePdf } from '@/services/printPdf';

/** US Letter points (same as exhibit labels). */
const LETTER = { width: 612, height: 792 } as const;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const readImageDataUri = async (uri: string | null, printSized = false): Promise<string | null> => {
  if (!uri || !imageExists(uri)) return null;
  try {
    const source = printSized ? await preparePrintImage(uri) : uri;
    const base64 = await FileSystem.readAsStringAsync(source, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
};

export type PortfolioPdfOptions = {
  collectionName: string;
  displayUnit: DisplayUnit;
  /** Cover subtitle — e.g. profile artist name when works share no single artist. */
  coverArtist?: string;
  /** Printed as a calling card at the foot of the cover when it has a name and a contact. */
  profile?: UserProfile;
  /** Short status for the export button, e.g. "Preparing image 3 of 12…". */
  onProgress?: (message: string) => void;
};

/** Who the portfolio belongs to, for the page footer. */
export const portfolioOwnerName = (artworks: Artwork[], options: PortfolioPdfOptions): string => {
  const fromProfile = options.profile ? profileArtistName(options.profile) : '';
  if (fromProfile) return fromProfile;
  if (options.coverArtist?.trim()) return options.coverArtist.trim();
  const names = [...new Set(artworks.map((a) => a.artist.trim()).filter(Boolean))];
  return names.length === 1 ? names[0]! : '';
};

export type PortfolioPageExtras = {
  /** Catalogue number; matches the numbering in collection emails (same title order). */
  number?: number;
  footerCollection?: string;
  footerOwner?: string;
};

const contactHref = (contact: CallingCardContact): string | null => {
  switch (contact.kind) {
    case 'email':
      return `mailto:${contact.value}`;
    case 'phone':
      return `tel:${contact.value.replace(/[^\d+]/g, '')}`;
    case 'website':
      return `https://${contact.value}`;
    default:
      return null;
  }
};

export const buildCallingCardHtml = (profile: UserProfile, logoDataUri: string | null): string => {
  if (!hasPrintableCallingCard(profile)) return '';
  const name = escapeHtml(profileArtistName(profile));
  const studio = profile.studioName.trim();
  const medium = profile.specialtyMedium.trim();
  const location = profile.location.trim();
  const monogram = escapeHtml((profileArtistName(profile).charAt(0) || 'A').toUpperCase());

  const rows = layoutContactRows(callingCardContacts(profile))
    .map((row) => {
      const cells = row
        .map((contact) => {
          const value = escapeHtml(contact.value);
          const href = contactHref(contact);
          return `<div class="cc-cell">
            <span class="cc-label">${escapeHtml(contact.label)}</span>
            ${href ? `<a class="cc-value" href="${escapeHtml(href)}">${value}</a>` : `<span class="cc-value">${value}</span>`}
          </div>`;
        })
        .join('');
      return `<div class="cc-row">${cells}</div>`;
    })
    .join('');

  return `
    <div class="cc-frame">
      <div class="cc-card">
        <div class="cc-top">
          <div class="cc-logo">
            ${logoDataUri ? `<img src="${logoDataUri}" alt="" />` : `<span class="cc-monogram">${monogram}</span>`}
          </div>
          <div class="cc-identity">
            <p class="cc-name">${name}</p>
            <div class="cc-rule"><span></span><i></i><span></span></div>
            ${studio && studio !== profileArtistName(profile) ? `<p class="cc-studio">${escapeHtml(studio)}</p>` : ''}
            ${medium ? `<p class="cc-medium">${escapeHtml(medium)}</p>` : ''}
            ${location ? `<p class="cc-location">${escapeHtml(location)}</p>` : ''}
          </div>
        </div>
        ${rows}
        <div class="cc-footer"><span></span><em>ArtCloset</em><span></span></div>
      </div>
    </div>
  `;
};

const coverArtistLine = (artworks: Artwork[], fallback?: string): string => {
  const names = [...new Set(artworks.map((a) => a.artist.trim()).filter(Boolean))];
  if (names.length === 1) return names[0]!;
  if (fallback?.trim()) return fallback.trim();
  if (names.length > 1) return 'Various artists';
  return '';
};

export const buildPortfolioArtworkPageHtml = (
  artwork: Artwork,
  displayUnit: DisplayUnit,
  imageDataUri: string | null,
  extras: PortfolioPageExtras = {},
): string => {
  const title = escapeHtml(artwork.title.trim() || 'Untitled');
  const artist = escapeHtml(artwork.artist.trim() || 'Artist not specified');
  const year = formatCompletionLabel(artwork.completionYear, artwork.completionMonth) ?? '';
  const medium = formatMediumLine(artwork.medium, artwork.material);
  const size = formatLabelDimensions(artwork.width, artwork.height, artwork.depth, displayUnit);
  const description = artwork.shortDescription.trim();
  const price = formatArtworkPriceLine(artwork);
  const footerCollection = extras.footerCollection?.trim() ?? '';
  const footerOwner = extras.footerOwner?.trim() ?? '';

  const metaLines = [
    year ? `<p class="meta">${escapeHtml(year)}</p>` : '',
    medium ? `<p class="meta">${escapeHtml(medium)}</p>` : '',
    size ? `<p class="meta">${escapeHtml(size)}</p>` : '',
    price ? `<p class="meta">${escapeHtml(price)}</p>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const imageBlock = imageDataUri
    ? `<div class="image-wrap"><img src="${imageDataUri}" alt="${title}" /></div>`
    : `<div class="image-wrap missing"><p>No image</p></div>`;

  return `
    <section class="page artwork-page">
      ${imageBlock}
      <div class="details">
        ${extras.number ? `<p class="plate">No. ${extras.number}</p>` : ''}
        <h2 class="title">${title}</h2>
        <p class="artist">${artist}</p>
        <div class="details-rule"></div>
        ${metaLines}
        ${description ? `<p class="description">${escapeHtml(description)}</p>` : ''}
      </div>
      ${
        footerCollection || footerOwner
          ? `<footer class="page-footer"><span>${escapeHtml(footerCollection)}</span><span>${escapeHtml(footerOwner)}</span></footer>`
          : ''
      }
    </section>
  `;
};

export const buildPortfolioHtml = (
  artworks: Artwork[],
  options: PortfolioPdfOptions,
  imageDataUris: (string | null)[],
  { fontFaceCss = '', logoDataUri = null }: { fontFaceCss?: string; logoDataUri?: string | null } = {},
): string => {
  const collection = escapeHtml(options.collectionName.trim() || 'Collection');
  const callingCard = options.profile ? buildCallingCardHtml(options.profile, logoDataUri) : '';
  const artist = escapeHtml(coverArtistLine(artworks, options.coverArtist));
  const exportedAt = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const countLabel =
    artworks.length === 1 ? '1 artwork' : `${artworks.length} artworks`;

  const cover = `
    <section class="page cover">
      <div class="cover-main">
        <p class="eyebrow">ArtCloset portfolio</p>
        <h1 class="cover-title">${collection}</h1>
        <div class="cover-rule"><span></span><i></i><span></span></div>
        ${artist ? `<p class="cover-artist">${artist}</p>` : ''}
        <p class="cover-meta">${escapeHtml(countLabel)} · ${escapeHtml(exportedAt)}</p>
      </div>
      ${callingCard ? `<div class="cover-contact">${callingCard}</div>` : ''}
    </section>
  `;

  const footerCollection = options.collectionName.trim() || 'Collection';
  const footerOwner = portfolioOwnerName(artworks, options);
  const pages = artworks
    .map((artwork, index) =>
      buildPortfolioArtworkPageHtml(artwork, options.displayUnit, imageDataUris[index] ?? null, {
        number: index + 1,
        footerCollection,
        footerOwner,
      }),
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    ${fontFaceCss}
    @page { margin: 0; size: letter; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: #211E1B;
      background: #fff;
    }
    .page {
      position: relative;
      width: ${LETTER.width}pt;
      height: ${LETTER.height}pt;
      padding: 48pt 54pt;
      page-break-after: always;
      break-after: page;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .cover {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: #F4EFE7;
    }
    .cover-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 100%;
    }
    .cover-rule {
      display: flex;
      align-items: center;
      gap: 8pt;
      width: 150pt;
      margin: 18pt auto 0;
    }
    .cover-rule span { flex: 1; height: 0.75pt; background: #C88E3F; }
    .cover-rule i { width: 6pt; height: 6pt; background: #C88E3F; transform: rotate(45deg); }
    .cover-contact { width: 100%; display: flex; justify-content: center; }
    .eyebrow {
      margin: 0 0 18pt;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #6D655C;
    }
    .cover-title {
      margin: 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 48pt;
      font-weight: 600;
      line-height: 1.1;
    }
    .cover-artist {
      margin: 16pt 0 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 20pt;
      font-style: italic;
      font-weight: 500;
      color: #8A6A3B;
    }
    .cover-meta {
      margin: 28pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      color: #6D655C;
    }
    .artwork-page {
      display: flex;
      flex-direction: column;
      gap: 20pt;
    }
    .image-wrap {
      flex: 1;
      /* Low enough that long details shrink the image instead of running into the footer. */
      min-height: 320pt;
      max-height: 520pt;
      padding: 22pt;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #EFE8DD;
      overflow: hidden;
    }
    /* White mat + thin dark frame line + soft shadow so the work lifts off the page. */
    .image-wrap img {
      max-width: 100%;
      max-height: 476pt;
      width: auto;
      height: auto;
      object-fit: contain;
      background: #FFFFFF;
      border: 9pt solid #FFFFFF;
      outline: 1.25pt solid #2B2622;
      box-shadow: 0 4pt 12pt rgba(0, 0, 0, 0.22);
    }
    .image-wrap.missing {
      color: #6D655C;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 12pt;
    }
    .details {
      flex-shrink: 0;
      text-align: center;
      padding-top: 4pt;
    }
    .plate {
      margin: 0 0 4pt;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 9pt;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #8C8378;
    }
    /* Sits inside the bottom page margin so it never takes space from the artwork. */
    .page-footer {
      position: absolute;
      left: 54pt;
      right: 54pt;
      bottom: 20pt;
      display: flex;
      justify-content: space-between;
      gap: 12pt;
      padding-top: 5pt;
      border-top: 0.5pt solid #D9C3A0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 7.5pt;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #8C8378;
    }
    .page-footer span {
      max-width: 48%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .details-rule {
      width: 36pt;
      height: 0.75pt;
      margin: 0 auto 8pt;
      background: #C88E3F;
    }
    .title {
      margin: 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 32pt;
      font-weight: 600;
      line-height: 1.1;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .artist {
      margin: 2pt 0 8pt;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 16pt;
      font-style: italic;
      font-weight: 500;
      color: #8A6A3B;
    }
    .meta {
      margin: 2pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11.5pt;
      color: #3F3934;
    }
    .description {
      max-width: 72%;
      margin: 10pt auto 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-size: 13pt;
      font-style: italic;
      line-height: 1.4;
      color: #6D655C;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 6;
      overflow: hidden;
    }
    /* Calling card — mirrors the in-app card (cream, gold double frame). */
    .cc-frame {
      width: 440pt;
      padding: 2pt;
      border: 1.25pt solid #C88E3F;
      border-radius: 9pt;
      background: #E6BE8A;
      text-align: left;
    }
    .cc-card {
      padding: 12pt 14pt 8pt;
      border: 0.75pt solid #C88E3F;
      border-radius: 7pt;
      background: #FFF5E1;
    }
    .cc-top { display: flex; align-items: center; gap: 12pt; }
    .cc-logo {
      width: 60pt;
      height: 70pt;
      flex-shrink: 0;
      border: 1.25pt solid #C88E3F;
      border-radius: 4pt;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #2A241E;
    }
    .cc-logo img { width: 100%; height: 100%; object-fit: cover; }
    .cc-monogram {
      font-family: ${PDF_DISPLAY_FAMILY};
      font-weight: 600;
      font-size: 30pt;
      color: #FFF5E1;
    }
    .cc-identity { flex: 1; min-width: 0; }
    .cc-name {
      margin: 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-weight: 600;
      font-size: 20pt;
      line-height: 1.1;
      color: #2A2118;
    }
    .cc-rule { display: flex; align-items: center; gap: 5pt; width: 110pt; margin: 3pt 0; }
    .cc-rule span { flex: 1; height: 0.5pt; background: #C88E3F; }
    .cc-rule i { width: 4.5pt; height: 4.5pt; background: #C88E3F; transform: rotate(45deg); }
    .cc-studio {
      margin: 0;
      font-family: ${PDF_DISPLAY_FAMILY};
      font-style: italic;
      font-size: 11pt;
      color: #7A5C3E;
    }
    .cc-medium, .cc-location {
      margin: 1pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      color: #2A2118;
    }
    .cc-location { color: #6E5C48; }
    .cc-row {
      display: flex;
      margin-top: 8pt;
      padding-top: 6pt;
      border-top: 0.5pt solid #E6BE8A;
    }
    .cc-cell {
      flex: 1;
      min-width: 0;
      padding: 0 3pt;
      text-align: center;
      border-right: 0.5pt solid #E6BE8A;
    }
    .cc-cell:last-child { border-right: none; }
    .cc-label {
      display: block;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-weight: 600;
      font-size: 6.5pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #C88E3F;
    }
    .cc-value {
      display: block;
      margin-top: 1.5pt;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 7.5pt;
      color: #2A2118;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cc-footer { display: flex; align-items: center; gap: 8pt; margin-top: 6pt; }
    .cc-footer span { flex: 1; height: 0.5pt; background: #E6BE8A; }
    .cc-footer em {
      font-family: ${PDF_DISPLAY_FAMILY};
      font-style: italic;
      font-size: 11pt;
      color: #C88E3F;
    }
  </style>
</head>
<body>
${cover}
${pages}
</body>
</html>`;
};

export async function exportPortfolioPdf(
  artworks: Artwork[],
  options: PortfolioPdfOptions,
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Portfolio PDF is available in the Android and iOS apps.');
  }
  if (artworks.length === 0) {
    throw new Error('This collection has no artworks to include.');
  }
  if (!options.collectionName.trim()) {
    throw new Error('Collection name is required for a portfolio PDF.');
  }

  // One image at a time, print-sized: full-resolution photos read in parallel exhaust memory.
  const imageDataUris: (string | null)[] = [];
  for (const [index, artwork] of artworks.entries()) {
    options.onProgress?.(`Preparing image ${index + 1} of ${artworks.length}…`);
    imageDataUris.push(await readImageDataUri(artwork.primaryImageUri, true));
  }
  options.onProgress?.('Creating PDF…');
  const [fontFaceCss, logoDataUri] = await Promise.all([
    getPdfDisplayFontCss(),
    options.profile
      ? readImageDataUri(resolveStoredImageUri(options.profile.studioLogoUri))
      : Promise.resolve(null),
  ]);
  const html = buildPortfolioHtml(artworks, options, imageDataUris, { fontFaceCss, logoDataUri });
  const safeName = options.collectionName
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40) || 'collection';
  const shareUri = await printHtmlToCachePdf(
    html,
    LETTER,
    `artcloset-portfolio-${safeName}-${Date.now()}.pdf`,
  );

  if (!(await Sharing.isAvailableAsync())) {
    return shareUri;
  }
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Portfolio: ${options.collectionName.trim()}`,
    UTI: 'com.adobe.pdf',
  });
  return shareUri;
}
