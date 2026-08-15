import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { formatCompletionLabel } from '@/domain/catalog';
import {
  EXHIBIT_LABEL_SIZE_SPECS,
  LETTER_PAGE_POINTS,
  labelPagePoints,
  letterSheetGrid,
  type ExhibitLabelContent,
  type ExhibitLabelLayout,
  type ExhibitLabelSize,
} from '@/domain/exhibitLabel';
import type { Artwork } from '@/domain/artwork';
import { buildExhibitLabelsDocxBytes, uint8ToBase64 } from '@/services/exhibitLabelDocx';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const artworkToLabelContent = (artwork: Artwork): ExhibitLabelContent => ({
  title: artwork.title.trim() || 'Untitled',
  artist: artwork.artist.trim() || 'Artist not specified',
  date: formatCompletionLabel(artwork.completionYear, artwork.completionMonth) ?? '',
  medium: artwork.medium.trim(),
});

const typographyForSize = (size: ExhibitLabelSize): { title: number; body: number; gap: number } => {
  if (size === '2x3') return { title: 8.5, body: 7, gap: 3 };
  return { title: 10, body: 8.5, gap: 4 };
};

const renderLabelInner = (entry: ExhibitLabelContent): string => `
  <div class="label-inner">
    <p class="title">${escapeHtml(entry.title)}</p>
    <p class="artist">${escapeHtml(entry.artist)}</p>
    ${entry.date ? `<p class="meta">${escapeHtml(entry.date)}</p>` : ''}
    ${entry.medium ? `<p class="meta">${escapeHtml(entry.medium)}</p>` : ''}
  </div>
`;

const sharedTypeCss = (size: ExhibitLabelSize): string => {
  const type = typographyForSize(size);
  return `
    .label-inner {
      width: 100%;
      text-align: center;
    }
    .title {
      margin: 0;
      font-size: ${type.title}pt;
      font-weight: 700;
      line-height: 1.25;
      text-align: center;
    }
    .artist {
      margin: ${type.gap}pt 0 0;
      font-size: ${type.body}pt;
      line-height: 1.25;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      text-align: center;
    }
    .meta {
      margin: ${type.gap - 1}pt 0 0;
      font-size: ${type.body}pt;
      line-height: 1.25;
      text-align: center;
    }
  `;
};

/** One PDF page = one physical label (pre-cut stock). */
export const buildLabelStockHtml = (labels: ExhibitLabelContent[], size: ExhibitLabelSize): string => {
  const spec = EXHIBIT_LABEL_SIZE_SPECS[size];
  const contentHeightIn = Math.max(0.5, spec.heightIn - 0.28);
  const pages = labels
    .map(
      (entry) => `
    <section class="label">${renderLabelInner(entry)}</section>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @page {
        size: ${spec.widthIn}in ${spec.heightIn}in;
        margin: 0.14in;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        height: 100%;
      }
      body {
        font-family: "Times New Roman", Times, serif;
        color: #111111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .label {
        width: 100%;
        height: ${contentHeightIn}in;
        min-height: ${contentHeightIn}in;
        page-break-after: always;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
      }
      .label:last-child { page-break-after: auto; }
      ${sharedTypeCss(size)}
    </style>
  </head>
  <body>${pages}</body>
</html>`;
};

/** Pack labels onto US Letter pages with dashed cut guides. */
export const buildLetterSheetHtml = (labels: ExhibitLabelContent[], size: ExhibitLabelSize): string => {
  const grid = letterSheetGrid(size);
  const chunks: ExhibitLabelContent[][] = [];
  for (let i = 0; i < labels.length; i += grid.perPage) {
    chunks.push(labels.slice(i, i + grid.perPage));
  }

  const sheets = chunks
    .map((chunk) => {
      const cells = Array.from({ length: grid.perPage }, (_, index) => {
        const entry = chunk[index];
        if (!entry) {
          return `<div class="cell cell-empty" aria-hidden="true"></div>`;
        }
        return `<div class="cell"><div class="label">${renderLabelInner(entry)}</div></div>`;
      }).join('\n');
      return `<section class="sheet">${cells}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @page {
        size: ${grid.pageWidthIn}in ${grid.pageHeightIn}in;
        margin: 0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Times New Roman", Times, serif;
        color: #111111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        width: ${grid.pageWidthIn}in;
        height: ${grid.pageHeightIn}in;
        padding: ${grid.marginIn}in;
        display: grid;
        grid-template-columns: repeat(${grid.columns}, ${grid.labelWidthIn}in);
        grid-template-rows: repeat(${grid.rows}, ${grid.labelHeightIn}in);
        gap: ${grid.gapIn}in;
        justify-content: start;
        align-content: start;
        page-break-after: always;
      }
      .sheet:last-child { page-break-after: auto; }
      .cell {
        width: ${grid.labelWidthIn}in;
        height: ${grid.labelHeightIn}in;
        border: 0.5pt dashed #999999;
        padding: 0.12in;
        overflow: hidden;
      }
      .cell-empty {
        border-style: dotted;
        border-color: #cccccc;
      }
      .label {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
      }
      ${sharedTypeCss(size)}
    </style>
  </head>
  <body>${sheets}</body>
</html>`;
};

export const buildExhibitLabelsHtml = (
  labels: ExhibitLabelContent[],
  size: ExhibitLabelSize,
  layout: ExhibitLabelLayout = 'letter-sheet',
): string => {
  if (layout === 'label-stock') return buildLabelStockHtml(labels, size);
  return buildLetterSheetHtml(labels, size);
};

const assertCanExport = (artworks: Artwork[]): ExhibitLabelContent[] => {
  if (Platform.OS === 'web') {
    throw new Error('Exhibit label export is available in the Android and iOS apps.');
  }
  if (artworks.length === 0) {
    throw new Error('Select at least one artwork.');
  }
  return artworks.map(artworkToLabelContent);
};

export async function exportExhibitLabelsPdf(
  artworks: Artwork[],
  size: ExhibitLabelSize,
  layout: ExhibitLabelLayout = 'letter-sheet',
): Promise<string> {
  const labels = assertCanExport(artworks);
  const html = buildExhibitLabelsHtml(labels, size, layout);
  const page =
    layout === 'label-stock'
      ? labelPagePoints(size)
      : { width: LETTER_PAGE_POINTS.width, height: LETTER_PAGE_POINTS.height };
  const { uri } = await Print.printToFileAsync({ html, width: page.width, height: page.height });

  if (!(await Sharing.isAvailableAsync())) {
    return uri;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Exhibit labels (PDF)',
    UTI: 'com.adobe.pdf',
  });
  return uri;
}

export async function exportExhibitLabelsDocx(
  artworks: Artwork[],
  size: ExhibitLabelSize,
  layout: ExhibitLabelLayout = 'letter-sheet',
): Promise<string> {
  const labels = assertCanExport(artworks);
  const bytes = buildExhibitLabelsDocxBytes(labels, size, layout);
  const cache = FileSystem.cacheDirectory;
  if (!cache) {
    throw new Error('Could not write the Word document on this device.');
  }
  const uri = `${cache}artcloset-exhibit-labels-${Date.now()}.docx`;
  await FileSystem.writeAsStringAsync(uri, uint8ToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    return uri;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dialogTitle: 'Exhibit labels (Word)',
    UTI: 'org.openxmlformats.wordprocessingml.document',
  });
  return uri;
}
