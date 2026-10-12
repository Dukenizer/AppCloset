import {
  addCalendarMonths,
  isExpiryActive,
  type VipRedemptionRecord,
} from './types';
import {
  getVipSalt,
  hashVipCode,
  lookupVipHash,
  normalizeVipCode,
  VIP_CODE_MAX_LENGTH,
  VIP_CODE_MIN_LENGTH,
} from './vipCrypto';
import {
  clearExpiryNoticeFlag,
  loadUsedVipHashes,
  loadVipRedemption,
  markVipHashUsed,
  saveVipRedemption,
} from './vipStorage';

export type RedeemResult =
  | { ok: true; record: VipRedemptionRecord; message: string }
  | { ok: false; message: string };

/** `startsAfter` (an active trial's end) defers the VIP months so a code is never spent during the trial. */
export async function redeemVipCode(
  rawCode: string,
  options: { startsAfter?: string | null } = {},
): Promise<RedeemResult> {
  if (!getVipSalt()) {
    return { ok: false, message: 'VIP is not configured on this build (missing salt).' };
  }

  const code = normalizeVipCode(rawCode);
  if (code.length < VIP_CODE_MIN_LENGTH || code.length > VIP_CODE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Enter a ${VIP_CODE_MIN_LENGTH}–${VIP_CODE_MAX_LENGTH} character code.`,
    };
  }

  const existing = await loadVipRedemption();
  if (existing && isExpiryActive(existing.expiry_date)) {
    return { ok: false, message: 'This device already has an active VIP code.' };
  }

  const hash = await hashVipCode(code);
  const used = await loadUsedVipHashes();
  if (used.includes(hash)) {
    return { ok: false, message: 'This code has already been used.' };
  }

  const match = lookupVipHash(hash);
  if (!match) {
    return { ok: false, message: 'Invalid code' };
  }

  const redeemed_date = new Date().toISOString();
  const deferred =
    options.startsAfter != null && Date.parse(options.startsAfter) > Date.parse(redeemed_date)
      ? options.startsAfter
      : null;
  const expiry_date = addCalendarMonths(deferred ?? redeemed_date, match.durationMonths);
  const record: VipRedemptionRecord = {
    code_hash: hash,
    tier: match.tier,
    redeemed_date,
    expiry_date,
  };

  await markVipHashUsed(hash);
  await saveVipRedemption(record);
  await clearExpiryNoticeFlag();

  const until = new Date(expiry_date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return {
    ok: true,
    record,
    message: deferred
      ? `VIP access activated until ${until} — it continues after your free Premium trial ends.`
      : `VIP access activated until ${until}`,
  };
}
