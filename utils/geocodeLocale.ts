/** Cyrillic scripts — device geocoder often returns these when phone locale is RU/UK. */
const NON_LATIN_GEO = /[\u0400-\u04FF\u0500-\u052F]/;

/** True when safe to show in UI or save to DB/TMS (Latin letters, digits, punctuation). */
export function isLatinGeocodeText(value: string | undefined | null): boolean {
  const t = (value ?? '').trim();
  if (!t) return true;
  return !NON_LATIN_GEO.test(t);
}

/** Drop non-Latin locality/state strings (never persist Cyrillic from device geocoder). */
export function sanitizeLatinGeocodeField(value: string | undefined | null): string {
  const t = (value ?? '').trim();
  if (!t) return '';
  return isLatinGeocodeText(t) ? t : '';
}

const ISO_COUNTRY_EN: Record<string, string> = {
  UA: 'Ukraine',
  US: 'USA',
  CA: 'Canada',
  MX: 'Mexico',
};

/** English country label for address banners (independent of device locale). */
export function englishCountryLabel(
  isoCountryCode?: string | null,
  country?: string | null,
): string {
  const iso = (isoCountryCode ?? '').trim().toUpperCase();
  if (iso && ISO_COUNTRY_EN[iso]) return ISO_COUNTRY_EN[iso];
  const c = (country ?? '').trim();
  if (c === 'United States') return 'USA';
  if (c && isLatinGeocodeText(c)) return c;
  return '';
}
