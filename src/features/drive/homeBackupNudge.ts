import { daysSinceLastBackup, DRIVE_BACKUP_STALE_DAYS } from '@/services/drive/driveBackupProgress';

export const BACKUP_NUDGE_SNOOZE_SETTING = 'backup_nudge_snoozed_until';
export const BACKUP_NUDGE_SNOOZE_DAYS = 7;

export type BackupNudgeKind = 'connect' | 'first' | 'stale';

export interface BackupNudge {
  kind: BackupNudgeKind;
  message: string;
  actionLabel: string;
}

export interface BackupNudgeInput {
  premium: boolean;
  driveConfigured: boolean;
  connected: boolean;
  artworkCount: number;
  /** Null when Drive has no backup yet. */
  lastBackupAt: string | null;
  /** False when the Drive check failed (offline) — never nudge on unknown state. */
  backupStateKnown: boolean;
  snoozedUntil: string | null;
  now?: number;
}

const artworksLabel = (count: number): string => (count === 1 ? '1 artwork' : `${count} artworks`);

/** Home reminder for Premium users whose catalog is unprotected or has a stale Drive backup. */
export function homeBackupNudge(input: BackupNudgeInput): BackupNudge | null {
  const now = input.now ?? Date.now();
  if (!input.premium || !input.driveConfigured || input.artworkCount <= 0) return null;
  if (input.snoozedUntil) {
    const until = Date.parse(input.snoozedUntil);
    if (Number.isFinite(until) && until > now) return null;
  }
  const works = artworksLabel(input.artworkCount);
  if (!input.connected) {
    return {
      kind: 'connect',
      message: `Your ${works} aren’t backed up. Connect Google Drive to protect them.`,
      actionLabel: 'Set up',
    };
  }
  if (!input.backupStateKnown) return null;
  if (!input.lastBackupAt) {
    return {
      kind: 'first',
      message: `No Drive backup yet for your ${works}. Back up now?`,
      actionLabel: 'Back up',
    };
  }
  const days = daysSinceLastBackup(input.lastBackupAt, now);
  if (days === null || days < DRIVE_BACKUP_STALE_DAYS) return null;
  return {
    kind: 'stale',
    message: `Last backup ${days} days ago. Back up now?`,
    actionLabel: 'Back up',
  };
}

export function snoozeUntilIso(now = Date.now()): string {
  return new Date(now + BACKUP_NUDGE_SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
