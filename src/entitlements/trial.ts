import * as SecureStore from 'expo-secure-store';

import { addCalendarMonths, daysUntil, isExpiryActive } from './types';

/** Every install (and every existing user, once, on updating) gets full Premium for this long. */
export const TRIAL_MONTHS = 3;

const TRIAL_KEY = 'artcloset_premium_trial_v1';
const TRIAL_NOTICES_KEY = 'artcloset_premium_trial_notices_v1';

export interface TrialRecord {
  started_at: string;
  ends_at: string;
}

export type TrialStatus = 'none' | 'active' | 'expired';

export type TrialNotice = 'welcome' | 'ending-28' | 'ending-14' | 'ending-7' | 'ending-1' | 'ended';

/** Reminders before the trial ends: every two weeks through the last month, then the final week and day. */
const ENDING_REMINDERS: ReadonlyArray<{ days: number; notice: TrialNotice }> = [
  { days: 1, notice: 'ending-1' },
  { days: 7, notice: 'ending-7' },
  { days: 14, notice: 'ending-14' },
  { days: 28, notice: 'ending-28' },
];

export function createTrialRecord(now = new Date()): TrialRecord {
  const started_at = now.toISOString();
  return { started_at, ends_at: addCalendarMonths(started_at, TRIAL_MONTHS) };
}

export function trialStatus(record: TrialRecord | null, now = new Date()): TrialStatus {
  if (!record) return 'none';
  return isExpiryActive(record.ends_at, now) ? 'active' : 'expired';
}

function parseTrialRecord(raw: string | null): TrialRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrialRecord>;
    if (
      typeof parsed.started_at === 'string' &&
      typeof parsed.ends_at === 'string' &&
      !Number.isNaN(Date.parse(parsed.started_at)) &&
      !Number.isNaN(Date.parse(parsed.ends_at))
    ) {
      return { started_at: parsed.started_at, ends_at: parsed.ends_at };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Returns this device's trial, starting it on the first launch that has none. If secure storage is
 * unavailable the trial is simply absent this session and is retried on the next launch.
 */
export async function loadOrStartTrial(now = new Date()): Promise<TrialRecord | null> {
  try {
    const existing = parseTrialRecord(await SecureStore.getItemAsync(TRIAL_KEY));
    if (existing) return existing;
    const record = createTrialRecord(now);
    await SecureStore.setItemAsync(TRIAL_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export async function loadShownTrialNotices(): Promise<TrialNotice[]> {
  try {
    const raw = await SecureStore.getItemAsync(TRIAL_NOTICES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is TrialNotice => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function markTrialNoticesShown(notices: TrialNotice[]): Promise<void> {
  const shown = await loadShownTrialNotices();
  const next = Array.from(new Set([...shown, ...notices]));
  await SecureStore.setItemAsync(TRIAL_NOTICES_KEY, JSON.stringify(next));
}

/**
 * The single trial message to show now (the most urgent one), plus the notices it makes redundant.
 * Nothing is shown while a VIP code is active; "ended" only shows when the trial was the last Premium.
 */
export function dueTrialNotice(input: {
  trial: TrialRecord | null;
  shown: readonly TrialNotice[];
  vipExpiry: string | null;
  now?: Date;
}): { notice: TrialNotice; covers: TrialNotice[] } | null {
  const { trial, shown, vipExpiry } = input;
  const now = input.now ?? new Date();
  if (!trial) return null;
  if (vipExpiry && isExpiryActive(vipExpiry, now)) return null;

  if (!isExpiryActive(trial.ends_at, now)) {
    const vipEndedLater = vipExpiry !== null && Date.parse(vipExpiry) > Date.parse(trial.ends_at);
    if (vipEndedLater || shown.includes('ended')) return null;
    return { notice: 'ended', covers: ['welcome', ...ENDING_REMINDERS.map((r) => r.notice), 'ended'] };
  }

  const days = daysUntil(trial.ends_at, now);
  for (const [index, reminder] of ENDING_REMINDERS.entries()) {
    if (days <= reminder.days && !shown.includes(reminder.notice)) {
      const lessUrgent = ENDING_REMINDERS.slice(index).map((r) => r.notice);
      return { notice: reminder.notice, covers: ['welcome', ...lessUrgent] };
    }
  }
  if (!shown.includes('welcome')) {
    return { notice: 'welcome', covers: ['welcome'] };
  }
  return null;
}
