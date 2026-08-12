import type { VipRedemptionRecord } from '@/entitlements/types';
import { redeemVipCode } from '@/entitlements/redeemVip';

const mockLoadVip = jest.fn();
const mockSaveVip = jest.fn();
const mockLoadUsed = jest.fn();
const mockMarkUsed = jest.fn();
const mockClearNotice = jest.fn();
const mockHash = jest.fn();
const mockLookup = jest.fn();
const mockSalt = jest.fn();

jest.mock('@/entitlements/vipStorage', () => ({
  loadVipRedemption: (...args: unknown[]) => mockLoadVip(...args),
  saveVipRedemption: (...args: unknown[]) => mockSaveVip(...args),
  loadUsedVipHashes: (...args: unknown[]) => mockLoadUsed(...args),
  markVipHashUsed: (...args: unknown[]) => mockMarkUsed(...args),
  clearExpiryNoticeFlag: (...args: unknown[]) => mockClearNotice(...args),
}));

jest.mock('@/entitlements/vipCrypto', () => ({
  getVipSalt: () => mockSalt(),
  hashVipCode: (...args: unknown[]) => mockHash(...args),
  lookupVipHash: (...args: unknown[]) => mockLookup(...args),
  normalizeVipCode: (raw: string) =>
    raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6),
}));

describe('redeemVipCode error and success paths', () => {
  beforeEach(() => {
    mockLoadVip.mockReset();
    mockSaveVip.mockReset();
    mockLoadUsed.mockReset();
    mockMarkUsed.mockReset();
    mockClearNotice.mockReset();
    mockHash.mockReset();
    mockLookup.mockReset();
    mockSalt.mockReset();
    mockSalt.mockReturnValue('salt');
    mockLoadVip.mockResolvedValue(null);
    mockLoadUsed.mockResolvedValue([]);
  });

  it('rejects when salt missing', async () => {
    mockSalt.mockReturnValue('');
    const r = await redeemVipCode('ABCDEF');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not configured/i);
  });

  it('rejects short codes', async () => {
    const r = await redeemVipCode('AB');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/6-character/i);
  });

  it('rejects when active VIP already present', async () => {
    const active: VipRedemptionRecord = {
      code_hash: 'x',
      tier: 'VIP1',
      redeemed_date: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 86400000 * 30).toISOString(),
    };
    mockLoadVip.mockResolvedValue(active);
    const r = await redeemVipCode('ABCDEF');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/already has an active VIP/i);
  });

  it('rejects already-used hash', async () => {
    mockHash.mockResolvedValue('usedhash');
    mockLoadUsed.mockResolvedValue(['usedhash']);
    const r = await redeemVipCode('ABCDEF');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/already been used/i);
  });

  it('rejects invalid code', async () => {
    mockHash.mockResolvedValue('unknown');
    mockLookup.mockReturnValue(null);
    const r = await redeemVipCode('ABCDEF');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Invalid code');
  });

  it('saves redemption on valid VIP2', async () => {
    mockHash.mockResolvedValue('goodhash');
    mockLookup.mockReturnValue({ tier: 'VIP2', durationMonths: 6 });
    const r = await redeemVipCode('ABCDEF');
    expect(r.ok).toBe(true);
    expect(mockMarkUsed).toHaveBeenCalledWith('goodhash');
    expect(mockSaveVip).toHaveBeenCalled();
    if (r.ok) {
      expect(r.record.tier).toBe('VIP2');
      expect(r.message).toMatch(/activated until/i);
    }
  });
});
