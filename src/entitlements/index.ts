export { EntitlementsProvider, useEntitlements, type PremiumSource } from './EntitlementsProvider';
export { TRIAL_MONTHS, type TrialRecord, type TrialStatus } from './trial';
export { redeemVipCode } from './redeemVip';
export { normalizeVipCode, getVipSalt } from './vipCrypto';
export type { EntitlementTier, Permission, VipStatus, VipRedemptionRecord } from './types';
export { getPermissions, ALL_PERMISSIONS } from './types';
