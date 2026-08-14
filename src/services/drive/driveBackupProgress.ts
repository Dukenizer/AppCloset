/** Shared Drive backup/restore progress labels and size-based duration estimates. */

export type DriveJobKind = 'idle' | 'connect' | 'backup' | 'restore';

export type DriveStep =
  | 'idle'
  | 'checking_connection'
  | 'estimating'
  | 'preparing'
  | 'uploading'
  | 'downloading'
  | 'validating'
  | 'applying'
  | 'finishing'
  | 'done'
  | 'failed';

export interface DriveProgressState {
  kind: DriveJobKind;
  step: DriveStep;
  message: string;
  /** 0–1 when known; null = indeterminate for the current step. */
  progress: number | null;
  estimateLabel: string | null;
  overnightRecommended: boolean;
  error: string | null;
}

export const IDLE_DRIVE_PROGRESS: DriveProgressState = {
  kind: 'idle',
  step: 'idle',
  message: '',
  progress: null,
  estimateLabel: null,
  overnightRecommended: false,
  error: null,
};

/** Advise a fresh backup when the last successful one is older than this. */
export const DRIVE_BACKUP_STALE_DAYS = 14;

/** Soft reminder starts after this many full days without a backup. */
export const DRIVE_BACKUP_REMIND_AFTER_DAYS = 1;

/** Prefer overnight when estimated payload exceeds this size. */
export const DRIVE_OVERNIGHT_BYTES = 100 * 1024 * 1024;

export type BackupReminderTone = 'ok' | 'remind' | 'stale';

export interface BackupReminder {
  days: number;
  tone: BackupReminderTone;
  message: string;
}

const STEP_PROGRESS: Partial<Record<DriveStep, number>> = {
  checking_connection: 0.08,
  estimating: 0.15,
  preparing: 0.35,
  uploading: 0.7,
  downloading: 0.45,
  validating: 0.7,
  applying: 0.88,
  finishing: 0.96,
  done: 1,
};

export function progressForStep(step: DriveStep): number | null {
  if (step === 'idle' || step === 'failed') return null;
  return STEP_PROGRESS[step] ?? null;
}

export function formatBytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function estimateBackupDuration(bytes: number): {
  minSeconds: number;
  maxSeconds: number;
  overnightRecommended: boolean;
  label: string;
} {
  const safeBytes = Math.max(0, bytes);
  // Conservative mobile upload throughput (~250 KB/s) with pack/upload overhead.
  const baseSeconds = Math.max(20, Math.ceil(safeBytes / (250 * 1024)));
  const minSeconds = Math.max(15, Math.round(baseSeconds * 0.7));
  const maxSeconds = Math.max(minSeconds + 30, Math.round(baseSeconds * 2.2));
  const overnightRecommended = safeBytes >= DRIVE_OVERNIGHT_BYTES || maxSeconds >= 45 * 60;

  if (overnightRecommended) {
    return {
      minSeconds,
      maxSeconds,
      overnightRecommended: true,
      label: `Large backup (~${formatBytesLabel(safeBytes)}). Expect ${formatDurationRange(
        minSeconds,
        maxSeconds,
      )} — better overnight on Wi‑Fi.`,
    };
  }

  return {
    minSeconds,
    maxSeconds,
    overnightRecommended: false,
    label: `About ${formatDurationRange(minSeconds, maxSeconds)} for ~${formatBytesLabel(safeBytes)}.`,
  };
}

export function formatDurationRange(minSeconds: number, maxSeconds: number): string {
  const formatOne = (total: number): string => {
    if (total < 60) return `${total} sec`;
    const minutes = Math.round(total / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
  };
  if (maxSeconds - minSeconds < 20) return formatOne(maxSeconds);
  return `${formatOne(minSeconds)}–${formatOne(maxSeconds)}`;
}

export function isBackupStale(modifiedTimeIso: string | null | undefined, now = Date.now()): boolean {
  if (!modifiedTimeIso) return false;
  const then = Date.parse(modifiedTimeIso);
  if (!Number.isFinite(then)) return false;
  return now - then >= DRIVE_BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000;
}

/** Whole days since last backup (floor). Returns null when unknown / invalid. */
export function daysSinceLastBackup(
  modifiedTimeIso: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!modifiedTimeIso) return null;
  const then = Date.parse(modifiedTimeIso);
  if (!Number.isFinite(then) || then > now) return null;
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

/**
 * Regular-backup advice for the Drive status panel.
 * - Never backed up → create first backup
 * - 1+ days → “It’s been N days… Backup now.”
 * - 14+ days → stronger stale wording
 */
export function backupReminderAdvice(
  modifiedTimeIso: string | null | undefined,
  now = Date.now(),
): BackupReminder | null {
  if (!modifiedTimeIso) {
    return {
      days: 0,
      tone: 'remind',
      message: 'No Drive backup yet. Backup now to protect your catalog.',
    };
  }
  const days = daysSinceLastBackup(modifiedTimeIso, now);
  if (days === null) return null;
  if (days < DRIVE_BACKUP_REMIND_AFTER_DAYS) {
    return {
      days,
      tone: 'ok',
      message: days === 0 ? 'Backup is up to date (today).' : 'Backup is up to date.',
    };
  }
  const dayLabel = days === 1 ? '1 day' : `${days} days`;
  if (days >= DRIVE_BACKUP_STALE_DAYS) {
    return {
      days,
      tone: 'stale',
      message: `It’s been ${dayLabel} since your last backup. Backup now to stay protected.`,
    };
  }
  return {
    days,
    tone: 'remind',
    message: `It’s been ${dayLabel} since your last backup. Backup now.`,
  };
}

export function stepMessage(kind: DriveJobKind, step: DriveStep): string {
  if (kind === 'connect') {
    if (step === 'checking_connection') return 'Opening Google account picker…';
    if (step === 'finishing') return 'Saving Google session…';
    if (step === 'done') return 'Google account connected.';
    if (step === 'failed') return 'Could not connect to Google.';
  }
  if (kind === 'backup') {
    switch (step) {
      case 'checking_connection':
        return 'Checking Google Drive connection…';
      case 'estimating':
        return 'Checking backup size…';
      case 'preparing':
        return 'Preparing backup archive…';
      case 'uploading':
        return 'Uploading backup to Google Drive…';
      case 'finishing':
        return 'Confirming backup on Drive…';
      case 'done':
        return 'Backup finished.';
      case 'failed':
        return 'Backup failed.';
      default:
        break;
    }
  }
  if (kind === 'restore') {
    switch (step) {
      case 'checking_connection':
        return 'Checking Google Drive connection…';
      case 'downloading':
        return 'Downloading backup from Drive…';
      case 'validating':
        return 'Validating backup archive…';
      case 'applying':
        return 'Restoring catalog on this device…';
      case 'finishing':
        return 'Repairing image paths…';
      case 'done':
        return 'Restore finished.';
      case 'failed':
        return 'Restore failed.';
      default:
        break;
    }
  }
  return '';
}

export function buildProgress(
  kind: DriveJobKind,
  step: DriveStep,
  extras?: Partial<Pick<DriveProgressState, 'estimateLabel' | 'overnightRecommended' | 'error' | 'message'>>,
): DriveProgressState {
  return {
    kind,
    step,
    message: extras?.message ?? stepMessage(kind, step),
    progress: progressForStep(step),
    estimateLabel: extras?.estimateLabel ?? null,
    overnightRecommended: extras?.overnightRecommended ?? false,
    error: extras?.error ?? null,
  };
}
