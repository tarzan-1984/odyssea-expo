type OfferIdVisibilityUser = {
  role?: string | null;
  externalId?: string | null;
} | null | undefined;

/** Offer numeric id is visible only to administrator with externalId 83. */
export function canShowOfferId(user: OfferIdVisibilityUser): boolean {
  const role = user?.role?.trim().toUpperCase() ?? '';
  const externalId = String(user?.externalId ?? '').trim();
  return role === 'ADMINISTRATOR' && externalId === '83';
}
