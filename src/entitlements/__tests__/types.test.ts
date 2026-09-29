import { ALL_PERMISSIONS, addCalendarMonths, getPermissions, isExpiryActive } from '@/entitlements/types';

describe('entitlements types', () => {
  it('grants every permission for PREMIUM and none for FREE', () => {
    const premium = getPermissions('PREMIUM');
    const free = getPermissions('FREE');
    for (const permission of ALL_PERMISSIONS) {
      expect(premium[permission]).toBe(true);
      expect(free[permission]).toBe(false);
    }
  });

  it('adds calendar months for VIP duration', () => {
    const start = '2026-08-12T00:00:00.000Z';
    expect(addCalendarMonths(start, 3).startsWith('2026-11-12')).toBe(true);
    expect(addCalendarMonths(start, 6).startsWith('2027-02-12')).toBe(true);
  });

  it('detects active vs expired', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isExpiryActive(future)).toBe(true);
    expect(isExpiryActive(past)).toBe(false);
  });
});
