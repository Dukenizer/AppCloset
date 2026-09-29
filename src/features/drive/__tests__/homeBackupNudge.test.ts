import { homeBackupNudge, snoozeUntilIso, type BackupNudgeInput } from '@/features/drive/homeBackupNudge';

const now = Date.parse('2026-09-26T12:00:00.000Z');

const base: BackupNudgeInput = {
  premium: true,
  driveConfigured: true,
  connected: true,
  artworkCount: 12,
  lastBackupAt: '2026-09-25T12:00:00.000Z',
  backupStateKnown: true,
  snoozedUntil: null,
  now,
};

describe('homeBackupNudge', () => {
  it('stays quiet for Free users, empty catalogs, or Drive-less builds', () => {
    expect(homeBackupNudge({ ...base, premium: false, lastBackupAt: null })).toBeNull();
    expect(homeBackupNudge({ ...base, artworkCount: 0, lastBackupAt: null })).toBeNull();
    expect(homeBackupNudge({ ...base, driveConfigured: false, lastBackupAt: null })).toBeNull();
  });

  it('asks Premium users who have not connected Google to set up backup', () => {
    expect(homeBackupNudge({ ...base, connected: false })).toMatchObject({
      kind: 'connect',
      message: 'Your 12 artworks aren’t backed up. Connect Google Drive to protect them.',
    });
  });

  it('nudges for a first backup and for stale backups only', () => {
    expect(homeBackupNudge({ ...base, lastBackupAt: null })?.kind).toBe('first');
    expect(homeBackupNudge({ ...base, lastBackupAt: '2026-08-27T12:00:00.000Z' })?.message).toBe(
      'Last backup 30 days ago. Back up now?',
    );
    expect(homeBackupNudge({ ...base, lastBackupAt: '2026-09-20T12:00:00.000Z' })).toBeNull();
  });

  it('never nudges when the Drive check failed', () => {
    expect(homeBackupNudge({ ...base, lastBackupAt: null, backupStateKnown: false })).toBeNull();
  });

  it('respects Later for 7 days', () => {
    const snoozedUntil = snoozeUntilIso(now);
    expect(homeBackupNudge({ ...base, lastBackupAt: null, snoozedUntil })).toBeNull();
    expect(
      homeBackupNudge({ ...base, lastBackupAt: null, snoozedUntil, now: now + 8 * 24 * 60 * 60 * 1000 })?.kind,
    ).toBe('first');
  });
});
