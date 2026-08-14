import {
  DRIVE_BACKUP_STALE_DAYS,
  DRIVE_OVERNIGHT_BYTES,
  backupReminderAdvice,
  buildProgress,
  daysSinceLastBackup,
  estimateBackupDuration,
  formatBytesLabel,
  formatDurationRange,
  isBackupStale,
  progressForStep,
  stepMessage,
} from '../drive/driveBackupProgress';

describe('driveBackupProgress', () => {
  it('marks backups older than the stale window', () => {
    const now = Date.parse('2026-08-14T00:00:00.000Z');
    expect(isBackupStale('2026-08-01T00:00:00.000Z', now)).toBe(false);
    expect(isBackupStale('2026-07-01T00:00:00.000Z', now)).toBe(true);
    expect(DRIVE_BACKUP_STALE_DAYS).toBe(14);
  });

  it('advises regular backup with days since last backup', () => {
    const now = Date.parse('2026-08-14T12:00:00.000Z');
    expect(daysSinceLastBackup('2026-08-08T12:00:00.000Z', now)).toBe(6);
    expect(backupReminderAdvice('2026-08-08T12:00:00.000Z', now)?.message).toBe(
      'It’s been 6 days since your last backup. Backup now.',
    );
    expect(backupReminderAdvice('2026-07-20T12:00:00.000Z', now)?.tone).toBe('stale');
    expect(backupReminderAdvice(null)?.message).toMatch(/No Drive backup yet/);
    expect(backupReminderAdvice('2026-08-14T08:00:00.000Z', now)?.tone).toBe('ok');
  });

  it('estimates short backups without overnight advice', () => {
    const estimate = estimateBackupDuration(2 * 1024 * 1024);
    expect(estimate.overnightRecommended).toBe(false);
    expect(estimate.label).toContain(formatBytesLabel(2 * 1024 * 1024));
    expect(estimate.label).toContain(formatDurationRange(estimate.minSeconds, estimate.maxSeconds));
  });

  it('recommends overnight for large payloads', () => {
    const estimate = estimateBackupDuration(DRIVE_OVERNIGHT_BYTES);
    expect(estimate.overnightRecommended).toBe(true);
    expect(estimate.label.toLowerCase()).toContain('overnight');
  });

  it('maps steps to progress and messages', () => {
    expect(progressForStep('uploading')).toBeGreaterThan(0.5);
    expect(stepMessage('backup', 'uploading')).toMatch(/Uploading/);
    const state = buildProgress('backup', 'failed', { error: 'network' });
    expect(state.step).toBe('failed');
    expect(state.error).toBe('network');
  });
});
