import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

import { VIP0_HASHES, VIP1_HASHES, VIP2_HASHES } from './vipHashes.generated';

const vip0Set = new Set(VIP0_HASHES);
const vip1Set = new Set(VIP1_HASHES);
const vip2Set = new Set(VIP2_HASHES);

/** Promo / VIP codes: 6–24 alphanumeric after normalize. */
export const VIP_CODE_MIN_LENGTH = 6;
export const VIP_CODE_MAX_LENGTH = 24;

export function getVipSalt(): string {
  const extra = Constants.expoConfig?.extra as { vipSalt?: string } | undefined;
  return (extra?.vipSalt ?? '').trim();
}

export function normalizeVipCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, VIP_CODE_MAX_LENGTH);
}

export async function hashVipCode(code: string, salt = getVipSalt()): Promise<string> {
  const normalized = normalizeVipCode(code);
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + normalized);
}

export type VipLookup =
  | { tier: 'VIP0'; durationMonths: 1 }
  | { tier: 'VIP1'; durationMonths: 3 }
  | { tier: 'VIP2'; durationMonths: 6 }
  | null;

export function lookupVipHash(hash: string): VipLookup {
  if (vip0Set.has(hash)) return { tier: 'VIP0', durationMonths: 1 };
  if (vip1Set.has(hash)) return { tier: 'VIP1', durationMonths: 3 };
  if (vip2Set.has(hash)) return { tier: 'VIP2', durationMonths: 6 };
  return null;
}
