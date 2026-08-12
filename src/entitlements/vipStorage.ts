import * as SecureStore from 'expo-secure-store';

import type { VipRedemptionRecord } from './types';

const REDEMPTION_KEY = 'artcloset_vip_redemption_v1';
const USED_HASHES_KEY = 'artcloset_vip_used_hashes_v1';
const EXPIRY_NOTICE_KEY = 'artcloset_vip_expiry_notice_v1';

export async function loadVipRedemption(): Promise<VipRedemptionRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(REDEMPTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VipRedemptionRecord;
  } catch {
    return null;
  }
}

export async function saveVipRedemption(record: VipRedemptionRecord): Promise<void> {
  await SecureStore.setItemAsync(REDEMPTION_KEY, JSON.stringify(record));
}

export async function loadUsedVipHashes(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(USED_HASHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function markVipHashUsed(hash: string): Promise<void> {
  const used = await loadUsedVipHashes();
  if (!used.includes(hash)) {
    used.push(hash);
    await SecureStore.setItemAsync(USED_HASHES_KEY, JSON.stringify(used));
  }
}

export async function loadExpiryNoticeShown(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(EXPIRY_NOTICE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markExpiryNoticeShown(): Promise<void> {
  await SecureStore.setItemAsync(EXPIRY_NOTICE_KEY, '1');
}

export async function clearExpiryNoticeFlag(): Promise<void> {
  await SecureStore.deleteItemAsync(EXPIRY_NOTICE_KEY);
}
