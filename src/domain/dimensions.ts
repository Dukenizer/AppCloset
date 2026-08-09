import type { DisplayUnit, MeasurementUnit } from '@/domain/profile';

export type SizeBucket = 'small' | 'medium' | 'large' | 'xl' | 'unspecified';

export const SIZE_BUCKETS: SizeBucket[] = ['small', 'medium', 'large', 'xl', 'unspecified'];

/** Art-market brackets applied to longest edge (height vs width), stored in cm. */
export const SIZE_BUCKET_MAX_CM = {
  small: 40,
  medium: 80,
  large: 150,
} as const;

const INCHES_PER_CM = 1 / 2.54;

export const cmFromEntry = (value: number, unit: MeasurementUnit): number =>
  unit === 'in' ? value * 2.54 : value;

export const entryFromCm = (valueCm: number, unit: MeasurementUnit): number =>
  unit === 'in' ? valueCm * INCHES_PER_CM : valueCm;

export const displayFromCm = (valueCm: number, unit: DisplayUnit): number =>
  unit === 'in' ? valueCm * INCHES_PER_CM : valueCm;

export const longestEdgeCm = (
  widthCm: number | null,
  heightCm: number | null,
): number | null => {
  if (widthCm === null && heightCm === null) return null;
  return Math.max(widthCm ?? 0, heightCm ?? 0);
};

export const sizeBucketFromLongestEdgeCm = (edgeCm: number | null): SizeBucket => {
  if (edgeCm === null || edgeCm <= 0) return 'unspecified';
  if (edgeCm <= SIZE_BUCKET_MAX_CM.small) return 'small';
  if (edgeCm <= SIZE_BUCKET_MAX_CM.medium) return 'medium';
  if (edgeCm <= SIZE_BUCKET_MAX_CM.large) return 'large';
  return 'xl';
};

export const sizeBucketLabel = (bucket: SizeBucket, displayUnit: DisplayUnit): string => {
  if (bucket === 'unspecified') return 'Unspecified size';
  const format = (cm: number): string => {
    const value = displayFromCm(cm, displayUnit);
    const suffix = displayUnit === 'in' ? ' in' : 'cm';
    return displayUnit === 'in' ? `${value.toFixed(1)}${suffix}` : `${Math.round(value)}${suffix}`;
  };
  if (bucket === 'small') return `Small (≤${format(SIZE_BUCKET_MAX_CM.small)})`;
  if (bucket === 'medium') {
    return `Medium (${format(SIZE_BUCKET_MAX_CM.small)}–${format(SIZE_BUCKET_MAX_CM.medium)})`;
  }
  if (bucket === 'large') {
    return `Large (${format(SIZE_BUCKET_MAX_CM.medium)}–${format(SIZE_BUCKET_MAX_CM.large)})`;
  }
  return `XL (>${format(SIZE_BUCKET_MAX_CM.large)})`;
};

export const formatDimensions = (
  widthCm: number | null,
  heightCm: number | null,
  depthCm: number | null,
  displayUnit: DisplayUnit,
): string | null => {
  const parts = [widthCm, heightCm, depthCm].filter((value): value is number => value !== null);
  if (parts.length === 0) return null;
  const unitLabel = displayUnit === 'in' ? 'in' : 'cm';
  const formatted = parts.map((value) => {
    const shown = displayFromCm(value, displayUnit);
    return displayUnit === 'in' ? shown.toFixed(1) : Math.round(shown).toString();
  });
  return `${formatted.join(' × ')} ${unitLabel}`;
};
