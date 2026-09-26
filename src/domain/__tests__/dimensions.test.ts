import {
  cmFromEntry,
  entryFromCm,
  formatLabelDimensions,
  longestEdgeCm,
  sizeBucketFromLongestEdgeCm,
  sizeBucketLabel,
} from '@/domain/dimensions';

describe('dimensions', () => {
  it('converts entry values to canonical cm', () => {
    expect(cmFromEntry(10, 'in')).toBeCloseTo(25.4);
    expect(cmFromEntry(40, 'cm')).toBe(40);
  });

  it('converts cm back to entry units', () => {
    expect(entryFromCm(25.4, 'in')).toBeCloseTo(10);
  });

  it('derives size buckets from longest edge', () => {
    expect(sizeBucketFromLongestEdgeCm(longestEdgeCm(30, 20))).toBe('small');
    expect(sizeBucketFromLongestEdgeCm(longestEdgeCm(60, 40))).toBe('medium');
    expect(sizeBucketFromLongestEdgeCm(longestEdgeCm(120, 80))).toBe('large');
    expect(sizeBucketFromLongestEdgeCm(longestEdgeCm(200, 100))).toBe('xl');
    expect(sizeBucketFromLongestEdgeCm(null)).toBe('unspecified');
  });

  it('labels buckets using the display unit preference', () => {
    expect(sizeBucketLabel('small', 'cm')).toContain('40cm');
    expect(sizeBucketLabel('small', 'in')).toContain('in');
  });

  it('formats share-card sizes with inch marks or a cm suffix', () => {
    expect(formatLabelDimensions(17.78, 25.4, null, 'in')).toBe('7.0" × 10.0"');
    expect(formatLabelDimensions(81.28, 60.96, 1.27, 'in')).toBe('32.0" × 24.0" × 0.5"');
    expect(formatLabelDimensions(60, 90, null, 'cm')).toBe('60 × 90 cm');
    expect(formatLabelDimensions(null, null, null, 'in')).toBeNull();
  });
});
