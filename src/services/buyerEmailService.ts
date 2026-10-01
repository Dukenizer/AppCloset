import * as MailComposer from 'expo-mail-composer';
import { Platform } from 'react-native';

import type { Artwork } from '@/domain/artwork';
import { formatCompletionLabel } from '@/domain/catalog';
import { formatLabelDimensions } from '@/domain/dimensions';
import type { DisplayUnit } from '@/domain/profile';
import { imageExists } from '@/services/imageStorage';

export type BuyerEmailOptions = {
  collectionName?: string;
};

export const formatArtworkPriceLine = (artwork: Artwork): string | null => {
  if (artwork.hidePrice || artwork.priceMinor === null) return null;
  return `Price: ${artwork.currency} ${(artwork.priceMinor / 100).toFixed(2)}`;
};

export const formatArtworkEmailEntry = (
  artwork: Artwork,
  displayUnit: DisplayUnit,
  position = 1,
): string => {
  const indent = ' '.repeat(`${position}. `.length);
  const lines = [`${position}. ${artwork.title.trim() || 'Untitled'}`];
  const year = formatCompletionLabel(artwork.completionYear, artwork.completionMonth);
  if (year) lines.push(`${indent}Year: ${year}`);
  if (artwork.medium.trim()) lines.push(`${indent}Medium: ${artwork.medium.trim()}`);
  if (artwork.material.trim()) lines.push(`${indent}Material: ${artwork.material.trim()}`);
  const size = formatLabelDimensions(artwork.width, artwork.height, artwork.depth, displayUnit);
  if (size) lines.push(`${indent}Size: ${size}`);
  const priceLine = formatArtworkPriceLine(artwork);
  if (priceLine) lines.push(`${indent}${priceLine}`);
  return lines.join('\n');
};

export const buildBuyerEmailBody = (
  artworks: Artwork[],
  displayUnit: DisplayUnit,
  options: BuyerEmailOptions = {},
): string => {
  const collection = options.collectionName?.trim();
  let intro: string;
  if (collection) {
    intro =
      artworks.length === 1
        ? `Here is the artwork from “${collection}”:`
        : `Here are the ${artworks.length} artworks from “${collection}”:`;
  } else if (artworks.length === 1) {
    intro = 'Here is the artwork we discussed:';
  } else {
    intro = `Here are the ${artworks.length} artworks we discussed:`;
  }
  const entries = artworks.map((artwork, index) => formatArtworkEmailEntry(artwork, displayUnit, index + 1));
  return [intro, '', entries.join('\n\n')].join('\n');
};

export const buildBuyerEmailSubject = (
  artworks: Artwork[],
  options: BuyerEmailOptions = {},
): string => {
  const collection = options.collectionName?.trim();
  if (collection) return `Collection: ${collection}`;
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
  options: BuyerEmailOptions = {},
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
    subject: buildBuyerEmailSubject(artworks, options),
    body: buildBuyerEmailBody(artworks, displayUnit, options),
    attachments: attachmentUrisForArtworks(artworks),
  });
}
