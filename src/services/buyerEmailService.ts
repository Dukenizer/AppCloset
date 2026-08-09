import * as MailComposer from 'expo-mail-composer';
import { Platform } from 'react-native';

import type { Artwork } from '@/domain/artwork';
import { formatDimensions } from '@/domain/dimensions';
import type { DisplayUnit } from '@/domain/profile';
import { imageExists } from '@/services/imageStorage';

export const formatArtworkPriceLine = (artwork: Artwork): string | null => {
  if (artwork.hidePrice || artwork.priceMinor === null) return null;
  return `Price: ${artwork.currency} ${(artwork.priceMinor / 100).toFixed(2)}`;
};

export const formatArtworkEmailEntry = (artwork: Artwork, displayUnit: DisplayUnit): string => {
  const lines = [`• ${artwork.title || 'Untitled'}`];
  if (artwork.medium.trim()) lines.push(`  Medium: ${artwork.medium.trim()}`);
  const dimensions = formatDimensions(artwork.width, artwork.height, artwork.depth, displayUnit);
  if (dimensions) lines.push(`  Dimensions: ${dimensions}`);
  const priceLine = formatArtworkPriceLine(artwork);
  if (priceLine) lines.push(`  ${priceLine}`);
  return lines.join('\n');
};

export const buildBuyerEmailBody = (artworks: Artwork[], displayUnit: DisplayUnit): string => {
  const intro =
    artworks.length === 1
      ? 'Here is the artwork we discussed:'
      : `Here are the ${artworks.length} artworks we discussed:`;
  const entries = artworks.map((artwork) => formatArtworkEmailEntry(artwork, displayUnit));
  return [intro, '', ...entries].join('\n');
};

export const buildBuyerEmailSubject = (artworks: Artwork[]): string => {
  if (artworks.length === 1) {
    const title = artworks[0]?.title.trim() || 'Artwork';
    return `Artwork: ${title}`;
  }
  return `${artworks.length} artworks from ArtCloset`;
};

export const attachmentUrisForArtworks = (artworks: Artwork[]): string[] =>
  artworks
    .map((artwork) => artwork.primaryImageUri)
    .filter((uri): uri is string => Boolean(uri) && imageExists(uri));

export async function emailSelectedArtworks(
  artworks: Artwork[],
  displayUnit: DisplayUnit,
): Promise<void> {
  if (artworks.length === 0) {
    throw new Error('Select at least one artwork to email.');
  }
  if (Platform.OS === 'web') {
    throw new Error('Emailing artworks is available in the Android and iOS apps.');
  }
  if (!(await MailComposer.isAvailableAsync())) {
    throw new Error('No mail app is available on this device. Add an email account and try again.');
  }

  await MailComposer.composeAsync({
    subject: buildBuyerEmailSubject(artworks),
    body: buildBuyerEmailBody(artworks, displayUnit),
    attachments: attachmentUrisForArtworks(artworks),
  });
}
