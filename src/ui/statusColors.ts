import type { ArtworkStatus } from '@/domain/artwork';
import type { ColorTokens } from '@/ui/theme';

/**
 * Exhibit sticker convention:
 * green = Available, yellow = Reserved, red = Sold.
 * Other statuses keep distinct accents for the vault list.
 */
export const statusDotColor = (status: ArtworkStatus, colors: ColorTokens): string => {
  switch (status) {
    case 'Available':
      return colors.statusAvailable;
    case 'Reserved':
      return colors.statusReserved;
    case 'Sold':
      return colors.statusSold;
    case 'Not for sale':
      return colors.statusNotForSale;
    case 'Exhibited':
      return colors.statusExhibiting;
    case 'Loaned':
      return colors.accent;
    default:
      return colors.inkMuted;
  }
};
