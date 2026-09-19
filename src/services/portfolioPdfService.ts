import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Artwork } from '@/domain/artwork';
import { formatCompletionLabel } from '@/domain/catalog';
import { formatDimensions } from '@/domain/dimensions';
import type { DisplayUnit } from '@/domain/profile';
import { formatArtworkPriceLine } from '@/services/buyerEmailService';
import { imageExists } from '@/services/imageStorage';

/** US Letter points (same as exhibit labels). */
const LETTER = { width: 612, height: 792 } as const;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const readImageDataUri = async (uri: string | null): Promise<string | null> => {
  if (!uri || !imageExists(uri)) return null;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
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
): string => {
  const title = escapeHtml(artwork.title.trim() || 'Untitled');
  const artist = escapeHtml(artwork.artist.trim() || 'Artist not specified');
  const year = formatCompletionLabel(artwork.completionYear, artwork.completionMonth) ?? '';
  const medium = artwork.medium.trim();
  const dimensions = formatDimensions(artwork.width, artwork.height, artwork.depth, displayUnit);
  const description = artwork.shortDescription.trim();
  const price = formatArtworkPriceLine(artwork);

  const metaLines = [
    medium ? `<p class="meta">${escapeHtml(medium)}</p>` : '',
    dimensions ? `<p class="meta">${escapeHtml(dimensions)}</p>` : '',
    year ? `<p class="meta">${escapeHtml(year)}</p>` : '',
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
        <h2 class="title">${title}</h2>
        <p class="artist">${artist}</p>
        ${metaLines}
        ${description ? `<p class="description">${escapeHtml(description)}</p>` : ''}
      </div>
    </section>
  `;
};

export const buildPortfolioHtml = (
  artworks: Artwork[],
  options: PortfolioPdfOptions,
  imageDataUris: (string | null)[],
): string => {
  const collection = escapeHtml(options.collectionName.trim() || 'Collection');
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
      <p class="eyebrow">ArtCloset portfolio</p>
      <h1 class="cover-title">${collection}</h1>
      ${artist ? `<p class="cover-artist">${artist}</p>` : ''}
      <p class="cover-meta">${escapeHtml(countLabel)} · ${escapeHtml(exportedAt)}</p>
    </section>
  `;

  const pages = artworks
    .map((artwork, index) =>
      buildPortfolioArtworkPageHtml(artwork, options.displayUnit, imageDataUris[index] ?? null),
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 0; size: letter; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: #211E1B;
      background: #fff;
    }
    .page {
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
      justify-content: center;
      align-items: flex-start;
      background: #F4EFE7;
    }
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
      font-size: 36pt;
      font-weight: 700;
      line-height: 1.15;
    }
    .cover-artist {
      margin: 16pt 0 0;
      font-size: 16pt;
      color: #514A43;
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
      min-height: 420pt;
      max-height: 520pt;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F7F3EC;
      overflow: hidden;
    }
    .image-wrap img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .image-wrap.missing {
      color: #6D655C;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 12pt;
    }
    .details { flex-shrink: 0; }
    .title {
      margin: 0;
      font-size: 22pt;
      font-weight: 700;
      line-height: 1.2;
    }
    .artist {
      margin: 6pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 12pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #514A43;
    }
    .meta {
      margin: 4pt 0 0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      color: #6D655C;
    }
    .description {
      margin: 12pt 0 0;
      font-size: 11pt;
      line-height: 1.45;
      color: #3A342E;
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

  const imageDataUris = await Promise.all(
    artworks.map((artwork) => readImageDataUri(artwork.primaryImageUri)),
  );
  const html = buildPortfolioHtml(artworks, options, imageDataUris);
  const { uri } = await Print.printToFileAsync({
    html,
    width: LETTER.width,
    height: LETTER.height,
  });

  if (!(await Sharing.isAvailableAsync())) {
    return uri;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Portfolio: ${options.collectionName.trim()}`,
    UTI: 'com.adobe.pdf',
  });
  return uri;
}
