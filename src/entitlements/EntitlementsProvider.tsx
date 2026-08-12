import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { redeemVipCode } from './redeemVip';
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

interface EntitlementsContextValue {
  ready: boolean;
  tier: EntitlementTier;
  isPremiumActive: boolean;
  vipStatus: VipStatus;
  redemption: VipRedemptionRecord | null;
  permissions: PermissionSet;
  daysUntilExpiry: number | null;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
  redeem: (code: string) => Promise<{ ok: boolean; message: string }>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

function deriveStatus(record: VipRedemptionRecord | null): {
  tier: EntitlementTier;
  vipStatus: VipStatus;
  isPremiumActive: boolean;
  daysUntilExpiry: number | null;
} {
  if (!record) {
    return { tier: 'FREE', vipStatus: 'none', isPremiumActive: false, daysUntilExpiry: null };
  }
  if (isExpiryActive(record.expiry_date)) {
    return {
      tier: 'PREMIUM',
      vipStatus: 'active',
      isPremiumActive: true,
      daysUntilExpiry: daysUntil(record.expiry_date),
    };
  }
  return {
    tier: 'FREE',
    vipStatus: 'expired',
    isPremiumActive: false,
    daysUntilExpiry: daysUntil(record.expiry_date),
  };
}

export function EntitlementsProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [redemption, setRedemption] = useState<VipRedemptionRecord | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const record = await loadVipRedemption();
    setRedemption(record);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const derived = useMemo(() => deriveStatus(redemption), [redemption]);
  const permissions = useMemo(() => getPermissions(derived.tier), [derived.tier]);

  const redeem = useCallback(
    async (code: string) => {
      const result = await redeemVipCode(code);
      if (result.ok) {
        setRedemption(result.record);
      }
      return { ok: result.ok, message: result.message };
    },
    [],
  );

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      ready,
      tier: derived.tier,
      isPremiumActive: derived.isPremiumActive,
      vipStatus: derived.vipStatus,
      redemption,
      permissions,
      daysUntilExpiry: derived.daysUntilExpiry,
      can: (permission) => permissions[permission],
      refresh,
      redeem,
    }),
    [ready, derived, redemption, permissions, refresh, redeem],
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
