import * as Crypto from 'expo-crypto';

import { lookupVipHash, normalizeVipCode, hashVipCode } from '@/entitlements/vipCrypto';
import { VIP0_HASHES, VIP1_HASHES, VIP2_HASHES } from '@/entitlements/vipHashes.generated';
import { addCalendarMonths } from '@/entitlements/types';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algo: string, data: string) => {
    let h = 0;
    for (let i = 0; i < data.length; i++) h = (h * 31 + data.charCodeAt(i)) >>> 0;
    return `mock_${h.toString(16).padStart(8, '0')}_${data.length}`;
  }),
}));

describe('VIP runtime logic', () => {
  it('normalizes codes to uppercase alphanumeric up to 24 chars', () => {
    expect(normalizeVipCode('ab12cd')).toBe('AB12CD');
    expect(normalizeVipCode('ab-12 cd!extra')).toBe('AB12CDEXTRA');
    expect(normalizeVipCode('a')).toBe('A');
    expect(normalizeVipCode('20artcloset26')).toBe('20ARTCLOSET26');
  });

  it('ships hash lists for every VIP tier', () => {
    expect(VIP0_HASHES.length).toBeGreaterThan(0);
    expect(VIP0_HASHES[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(VIP1_HASHES.length).toBeGreaterThan(0);
    expect(VIP2_HASHES.length).toBeGreaterThan(0);
    expect(VIP1_HASHES[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(VIP2_HASHES[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('looks up known generated hashes by tier', () => {
    expect(lookupVipHash(VIP0_HASHES[0]!)).toEqual({ tier: 'VIP0', durationMonths: 1 });
    expect(lookupVipHash(VIP1_HASHES[0]!)).toEqual({ tier: 'VIP1', durationMonths: 3 });
    expect(lookupVipHash(VIP2_HASHES[0]!)).toEqual({ tier: 'VIP2', durationMonths: 6 });
    expect(lookupVipHash('0'.repeat(64))).toBeNull();
  });

  it('hashes with salt + uppercase code', async () => {
    const digest = jest.mocked(Crypto.digestStringAsync);
    digest.mockClear();
    const out = await hashVipCode('NF2LQI', 'test-salt');
    expect(out).toContain('mock_');
    expect(digest).toHaveBeenCalledWith('SHA-256', 'test-saltNF2LQI');
  });

  it('VIP0/VIP1/VIP2 durations map to 1, 3, and 6 months', () => {
    const start = '2026-01-15T12:00:00.000Z';
    expect(addCalendarMonths(start, 1)).toMatch(/^2026-02-15/);
    expect(addCalendarMonths(start, 3)).toMatch(/^2026-04-15/);
    expect(addCalendarMonths(start, 6)).toMatch(/^2026-07-15/);
  });
});
