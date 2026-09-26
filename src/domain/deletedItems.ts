const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker ("YYYY-MM-DD HH:MM:SS"). */
export function parseSqliteTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  const normalized = SQLITE_TIMESTAMP.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDeletedAgo(value: string, now: Date = new Date()): string {
  const date = parseSqliteTimestamp(value);
  if (!date) return 'Deleted';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Deleted just now';
  if (minutes < 60) return `Deleted ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Deleted ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Deleted yesterday';
  if (days < 30) return `Deleted ${days} days ago`;
  return `Deleted ${date.toLocaleDateString()}`;
}

export function deletedCountLabel(count: number): string {
  return count > 0 ? `Deleted items (${count})` : 'Deleted items';
}
