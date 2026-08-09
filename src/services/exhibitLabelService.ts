import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { formatCompletionLabel } from '@/domain/catalog';
import {
  EXHIBIT_LABEL_SIZE_SPECS,
  labelPagePoints,
  type ExhibitLabelContent,
  type ExhibitLabelSize,
} from '@/domain/exhibitLabel';
import type { Artwork } from '@/domain/artwork';

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

export const buildExhibitLabelsHtml = (labels: ExhibitLabelContent[], size: ExhibitLabelSize): string => {
  const spec = EXHIBIT_LABEL_SIZE_SPECS[size];
  const type = typographyForSize(size);
  const pages = labels
    .map(
      (entry) => `
    <section class="label">
      <p class="title">${escapeHtml(entry.title)}</p>
      <p class="artist">${escapeHtml(entry.artist)}</p>
      ${entry.date ? `<p class="meta">${escapeHtml(entry.date)}</p>` : ''}
      ${entry.medium ? `<p class="meta">${escapeHtml(entry.medium)}</p>` : ''}
    </section>`,
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
      body {
        margin: 0;
        font-family: "Times New Roman", Times, serif;
        color: #111111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .label {
        width: 100%;
        min-height: 100%;
        page-break-after: always;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
      }
      .label:last-child { page-break-after: auto; }
      .title {
        margin: 0;
        font-size: ${type.title}pt;
        font-weight: 700;
        line-height: 1.25;
      }
      .artist {
        margin: ${type.gap}pt 0 0;
        font-size: ${type.body}pt;
        line-height: 1.25;
      }
      .meta {
        margin: ${type.gap - 1}pt 0 0;
        font-size: ${type.body}pt;
        line-height: 1.25;
      }
    </style>
  </head>
  <body>${pages}</body>
</html>`;
};

export async function exportExhibitLabelsPdf(artworks: Artwork[], size: ExhibitLabelSize): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Exhibit label PDF export is available in the Android and iOS apps.');
  }
  if (artworks.length === 0) {
    throw new Error('Select at least one artwork.');
  }

  const labels = artworks.map(artworkToLabelContent);
  const html = buildExhibitLabelsHtml(labels, size);
  const { width, height } = labelPagePoints(size);
  const { uri } = await Print.printToFileAsync({ html, width, height });

  if (!(await Sharing.isAvailableAsync())) {
    return uri;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Exhibit labels',
    UTI: 'com.adobe.pdf',
  });
  return uri;
}
