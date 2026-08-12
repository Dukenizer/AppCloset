import { addCalendarMonths, getPermissions, isExpiryActive } from '@/entitlements/types';

describe('entitlements types', () => {
  it('grants all permissions for PREMIUM and none for FREE', () => {
    expect(getPermissions('PREMIUM').CAN_USE_GOOGLE_DRIVE_BACKUP).toBe(true);
    expect(getPermissions('FREE').CAN_USE_GOOGLE_DRIVE_BACKUP).toBe(false);
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
