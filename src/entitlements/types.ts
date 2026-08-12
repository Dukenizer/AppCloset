export type EntitlementTier = 'FREE' | 'PREMIUM';

export type VipStatus = 'none' | 'active' | 'expired';

export type Permission =
  | 'CAN_USE_GOOGLE_DRIVE_BACKUP'
  | 'CAN_GENERATE_CERTIFICATE'
  | 'CAN_GENERATE_PORTFOLIO'
  | 'CAN_USE_ORG_LOGO'
  | 'CAN_USE_EXHIBITION_LABELS'
  | 'CAN_USE_BATCH_LABELS'
  | 'CAN_USE_ADVANCED_ANALYTICS'
  | 'CAN_USE_EXHIBITION_MANAGER'
  | 'CAN_USE_SALES_MANAGEMENT'
  | 'CAN_USE_PUBLIC_PORTFOLIO';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'CAN_USE_GOOGLE_DRIVE_BACKUP',
  'CAN_GENERATE_CERTIFICATE',
  'CAN_GENERATE_PORTFOLIO',
  'CAN_USE_ORG_LOGO',
  'CAN_USE_EXHIBITION_LABELS',
  'CAN_USE_BATCH_LABELS',
  'CAN_USE_ADVANCED_ANALYTICS',
  'CAN_USE_EXHIBITION_MANAGER',
  'CAN_USE_SALES_MANAGEMENT',
  'CAN_USE_PUBLIC_PORTFOLIO',
] as const;

export type PermissionSet = Record<Permission, boolean>;

export function getPermissions(tier: EntitlementTier): PermissionSet {
  const premium = tier === 'PREMIUM';
  return Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, premium])) as PermissionSet;
}

export interface VipRedemptionRecord {
  code_hash: string;
  tier: 'VIP1' | 'VIP2';
  redeemed_date: string;
  expiry_date: string;
}

export function addCalendarMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}

export function daysUntil(isoExpiry: string, now = new Date()): number {
  const end = new Date(isoExpiry).getTime();
  return Math.ceil((end - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isExpiryActive(isoExpiry: string, now = new Date()): boolean {
  return new Date(isoExpiry).getTime() > now.getTime();
}
