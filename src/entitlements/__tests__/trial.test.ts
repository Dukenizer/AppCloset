import { deriveStatus } from '@/entitlements/EntitlementsProvider';
import {
  createTrialRecord,
  dueTrialNotice,
  loadOrStartTrial,
  trialStatus,
  type TrialNotice,
  type TrialRecord,
} from '@/entitlements/trial';
import type { VipRedemptionRecord } from '@/entitlements/types';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

jest.mock('@/entitlements/redeemVip', () => ({ redeemVipCode: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const start = new Date('2026-10-12T12:00:00.000Z');
const trial: TrialRecord = createTrialRecord(start);

const vip = (expiry: Date): VipRedemptionRecord => ({
  code_hash: 'h',
  tier: 'VIP1',
  redeemed_date: start.toISOString(),
  expiry_date: expiry.toISOString(),
});

describe('free Premium trial', () => {
  beforeEach(() => mockStore.clear());

  it('lasts three calendar months from the first launch', () => {
    expect(trial.started_at).toBe('2026-10-12T12:00:00.000Z');
    expect(trial.ends_at).toBe('2027-01-12T12:00:00.000Z');
    expect(trialStatus(trial, new Date('2027-01-12T11:59:00.000Z'))).toBe('active');
    expect(trialStatus(trial, new Date('2027-01-12T12:00:01.000Z'))).toBe('expired');
    expect(trialStatus(null)).toBe('none');
  });

  it('starts once and never restarts on later launches', async () => {
    const first = await loadOrStartTrial(start);
    const later = await loadOrStartTrial(new Date('2027-06-01T00:00:00.000Z'));
    expect(first).toEqual(trial);
    expect(later).toEqual(trial);
  });

  it('replaces an unreadable stored record instead of failing', async () => {
    mockStore.set('artcloset_premium_trial_v1', '{not json');
    expect(await loadOrStartTrial(start)).toEqual(trial);
  });

  describe('premium status', () => {
    it('grants Premium during the trial and keeps Restore after it ends', () => {
      const during = deriveStatus(null, trial, new Date(start.getTime() + 10 * DAY));
      expect(during).toMatchObject({ tier: 'PREMIUM', premiumSource: 'trial', canRestoreFromDrive: true });
      expect(during.trialDaysLeft).toBeGreaterThan(80);

      const after = deriveStatus(null, trial, new Date('2027-02-01T00:00:00.000Z'));
      expect(after).toMatchObject({
        tier: 'FREE',
        premiumSource: null,
        trialStatus: 'expired',
        canRestoreFromDrive: true,
      });
    });

    it('reports whichever entitlement lasts longer as the source', () => {
      const now = new Date(start.getTime() + DAY);
      expect(deriveStatus(vip(new Date('2027-06-01T00:00:00.000Z')), trial, now).premiumSource).toBe('vip');
      expect(deriveStatus(vip(new Date('2026-11-01T00:00:00.000Z')), trial, now).premiumSource).toBe('trial');
    });

    it('is Free with no Restore when there was never any Premium', () => {
      expect(deriveStatus(null, null)).toMatchObject({ tier: 'FREE', canRestoreFromDrive: false });
    });
  });

  describe('notices', () => {
    const at = (daysAfterStart: number): Date => new Date(start.getTime() + daysAfterStart * DAY);

    it('welcomes once, then warns 7 days and 1 day before the end, then says it ended', () => {
      expect(dueTrialNotice({ trial, shown: [], vipExpiry: null, now: at(0) })?.notice).toBe('welcome');
      expect(dueTrialNotice({ trial, shown: ['welcome'], vipExpiry: null, now: at(30) })).toBeNull();
      const reminders: TrialNotice[] = ['welcome', 'ending-28', 'ending-14'];
      expect(dueTrialNotice({ trial, shown: reminders, vipExpiry: null, now: at(86) })?.notice).toBe('ending-7');
      expect(
        dueTrialNotice({ trial, shown: [...reminders, 'ending-7'], vipExpiry: null, now: at(91.6) })?.notice,
      ).toBe('ending-1');
      expect(
        dueTrialNotice({ trial, shown: [...reminders, 'ending-7', 'ending-1'], vipExpiry: null, now: at(95) })?.notice,
      ).toBe('ended');
      expect(
        dueTrialNotice({
          trial,
          shown: [...reminders, 'ending-7', 'ending-1', 'ended'],
          vipExpiry: null,
          now: at(95),
        }),
      ).toBeNull();
    });

    it('warns every two weeks through the last month before the final-week reminders', () => {
      // The trial is 92 days long (Oct 12 → Jan 12).
      const shown: TrialNotice[] = ['welcome'];
      expect(dueTrialNotice({ trial, shown, vipExpiry: null, now: at(60) })).toBeNull();
      expect(dueTrialNotice({ trial, shown, vipExpiry: null, now: at(64.5) })?.notice).toBe('ending-28');
      shown.push('ending-28');
      expect(dueTrialNotice({ trial, shown, vipExpiry: null, now: at(70) })).toBeNull();
      expect(dueTrialNotice({ trial, shown, vipExpiry: null, now: at(78.5) })?.notice).toBe('ending-14');
      shown.push('ending-14');
      expect(dueTrialNotice({ trial, shown, vipExpiry: null, now: at(80) })).toBeNull();
      expect(dueTrialNotice({ trial, shown, vipExpiry: null, now: at(85.5) })?.notice).toBe('ending-7');
    });

    it('shows only the most urgent notice when the app was not opened for a while', () => {
      expect(dueTrialNotice({ trial, shown: [], vipExpiry: null, now: at(91.6) })).toEqual({
        notice: 'ending-1',
        covers: ['welcome', 'ending-1', 'ending-7', 'ending-14', 'ending-28'],
      });
      expect(dueTrialNotice({ trial, shown: ['welcome'], vipExpiry: null, now: at(80) })).toEqual({
        notice: 'ending-14',
        covers: ['welcome', 'ending-14', 'ending-28'],
      });
    });

    it('stays quiet while a VIP code is active, and skips "ended" when VIP outlasted the trial', () => {
      const vipLater = '2027-03-01T00:00:00.000Z';
      expect(dueTrialNotice({ trial, shown: [], vipExpiry: vipLater, now: at(0) })).toBeNull();
      expect(
        dueTrialNotice({ trial, shown: ['welcome'], vipExpiry: vipLater, now: new Date('2027-04-01T00:00:00.000Z') }),
      ).toBeNull();
    });
  });
});
