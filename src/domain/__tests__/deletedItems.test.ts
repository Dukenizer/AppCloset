import { deletedCountLabel, formatDeletedAgo, parseSqliteTimestamp } from '@/domain/deletedItems';

describe('deleted items helpers', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('parses SQLite CURRENT_TIMESTAMP as UTC', () => {
    expect(parseSqliteTimestamp('2026-09-26 11:00:00')?.toISOString()).toBe('2026-09-26T11:00:00.000Z');
    expect(parseSqliteTimestamp('not a date')).toBeNull();
  });

  it('formats relative deleted times', () => {
    expect(formatDeletedAgo('2026-09-26 11:59:40', now)).toBe('Deleted just now');
    expect(formatDeletedAgo('2026-09-26 11:45:00', now)).toBe('Deleted 15 min ago');
    expect(formatDeletedAgo('2026-09-26 11:00:00', now)).toBe('Deleted 1 hour ago');
    expect(formatDeletedAgo('2026-09-26 07:00:00', now)).toBe('Deleted 5 hours ago');
    expect(formatDeletedAgo('2026-09-25 10:00:00', now)).toBe('Deleted yesterday');
    expect(formatDeletedAgo('2026-09-24 10:00:00', now)).toBe('Deleted 2 days ago');
    expect(formatDeletedAgo('garbage', now)).toBe('Deleted');
  });

  it('shows the count only when there are deleted items', () => {
    expect(deletedCountLabel(0)).toBe('Deleted items');
    expect(deletedCountLabel(3)).toBe('Deleted items (3)');
  });
});
