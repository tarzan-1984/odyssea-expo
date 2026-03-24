/**
 * Roles allowed to access Drivers list and My offers pages (Next.js).
 * Staff-only for web.
 */
export const DRIVERS_AND_OFFERS_ALLOWED_ROLES = [
  'DISPATCHER',
  'DISPATCHER_TL',
  'EXPEDITE_MANAGER',
  'ADMINISTRATOR',
  'MORNING_TRACKING',
  'NIGHTSHIFT_TRACKING',
] as const;

export type DriversAndOffersRole = (typeof DRIVERS_AND_OFFERS_ALLOWED_ROLES)[number];

export function canAccessDriversAndOffers(role: string | undefined | null): boolean {
  if (!role) return false;
  return DRIVERS_AND_OFFERS_ALLOWED_ROLES.includes(role.trim().toUpperCase() as DriversAndOffersRole);
}

/** Staff + DRIVER - who can access Work tab (Offers) in mobile app */
export function canAccessWorkTab(role: string | undefined | null): boolean {
  if (!role) return false;
  const r = role.trim().toUpperCase();
  return r === 'DRIVER' || canAccessDriversAndOffers(r);
}
