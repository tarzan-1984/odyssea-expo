/**
 * Roles that can create offers (same list as Next.js OffersList UserFilterSelect).
 */
export const OFFERS_CREATOR_ROLES = [
  'ADMINISTRATOR',
  'DISPATCHER',
  'DISPATCHER_TL',
  'EXPEDITE_MANAGER',
  'MORNING_TRACKING',
  'NIGHTSHIFT_TRACKING',
] as const;

export const OFFERS_CREATOR_ROLE_LABELS: Record<string, string> = {
  ADMINISTRATOR: 'Administrator',
  DISPATCHER: 'Dispatcher',
  DISPATCHER_TL: 'Dispatcher TL',
  EXPEDITE_MANAGER: 'Expedite Manager',
  MORNING_TRACKING: 'Morning Tracking',
  NIGHTSHIFT_TRACKING: 'Nightshift Tracking',
};

export function offersCreatorRoleLabel(role: string | undefined): string {
  if (!role) return '';
  return OFFERS_CREATOR_ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}
