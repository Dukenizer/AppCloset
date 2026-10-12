import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { redeemVipCode } from './redeemVip';
import { loadOrStartTrial, trialStatus, type TrialRecord, type TrialStatus } from './trial';
import {
  daysUntil,
  getPermissions,
  isExpiryActive,
  type EntitlementTier,
  type Permission,
  type PermissionSet,
  type VipRedemptionRecord,
  type VipStatus,
} from './types';
import { loadVipRedemption } from './vipStorage';

export type PremiumSource = 'vip' | 'trial' | null;

interface EntitlementsContextValue {
  ready: boolean;
  tier: EntitlementTier;
  isPremiumActive: boolean;
  /** Which entitlement currently grants Premium (the one lasting longest). */
  premiumSource: PremiumSource;
  vipStatus: VipStatus;
  redemption: VipRedemptionRecord | null;
  trial: TrialRecord | null;
  trialStatus: TrialStatus;
  trialDaysLeft: number | null;
  /** Restore stays open after Premium lapses so a catalog backed up on Premium is never trapped. */
  canRestoreFromDrive: boolean;
  permissions: PermissionSet;
  daysUntilExpiry: number | null;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
  redeem: (code: string) => Promise<{ ok: boolean; message: string }>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function deriveStatus(
  record: VipRedemptionRecord | null,
  trial: TrialRecord | null,
  now = new Date(),
): {
  tier: EntitlementTier;
  vipStatus: VipStatus;
  isPremiumActive: boolean;
  premiumSource: PremiumSource;
  trialStatus: TrialStatus;
  trialDaysLeft: number | null;
  canRestoreFromDrive: boolean;
  daysUntilExpiry: number | null;
} {
  const vipStatus: VipStatus = !record ? 'none' : isExpiryActive(record.expiry_date, now) ? 'active' : 'expired';
  const trialState = trialStatus(trial, now);
  const vipActive = vipStatus === 'active';
  const trialActive = trialState === 'active';
  const premiumSource: PremiumSource =
    vipActive && trialActive
      ? Date.parse(record!.expiry_date) >= Date.parse(trial!.ends_at)
        ? 'vip'
        : 'trial'
      : vipActive
        ? 'vip'
        : trialActive
          ? 'trial'
          : null;
  const isPremiumActive = premiumSource !== null;
  return {
    tier: isPremiumActive ? 'PREMIUM' : 'FREE',
    vipStatus,
    isPremiumActive,
    premiumSource,
    trialStatus: trialState,
    trialDaysLeft: trialActive ? daysUntil(trial!.ends_at, now) : null,
    canRestoreFromDrive: isPremiumActive || vipStatus === 'expired' || trialState === 'expired',
    daysUntilExpiry: record ? daysUntil(record.expiry_date, now) : null,
  };
}

export function EntitlementsProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [redemption, setRedemption] = useState<VipRedemptionRecord | null>(null);
  const [trial, setTrial] = useState<TrialRecord | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const refresh = useCallback(async (): Promise<void> => {
    const [record, trialRecord] = await Promise.all([loadVipRedemption(), loadOrStartTrial()]);
    setRedemption(record);
    setTrial(trialRecord);
    setClock(Date.now());
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-evaluate expiry when the app returns to the foreground (a trial can end while backgrounded).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setClock(Date.now());
    });
    return () => subscription.remove();
  }, []);

  const derived = useMemo(() => deriveStatus(redemption, trial, new Date(clock)), [redemption, trial, clock]);
  const permissions = useMemo(() => getPermissions(derived.tier), [derived.tier]);

  const redeem = useCallback(
    async (code: string) => {
      const trialEndsAt = trial && trialStatus(trial) === 'active' ? trial.ends_at : null;
      const result = await redeemVipCode(code, { startsAfter: trialEndsAt });
      if (result.ok) {
        setRedemption(result.record);
        setClock(Date.now());
      }
      return { ok: result.ok, message: result.message };
    },
    [trial],
  );

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      ready,
      tier: derived.tier,
      isPremiumActive: derived.isPremiumActive,
      premiumSource: derived.premiumSource,
      vipStatus: derived.vipStatus,
      redemption,
      trial,
      trialStatus: derived.trialStatus,
      trialDaysLeft: derived.trialDaysLeft,
      canRestoreFromDrive: derived.canRestoreFromDrive,
      permissions,
      daysUntilExpiry: derived.daysUntilExpiry,
      can: (permission) => permissions[permission],
      refresh,
      redeem,
    }),
    [ready, derived, redemption, trial, permissions, refresh, redeem],
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error('useEntitlements must be used within EntitlementsProvider');
  }
  return ctx;
}
