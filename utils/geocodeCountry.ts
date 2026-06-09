/** Nominatim `countrycodes` values for North America geocoding in driver ZIP popup. */
export type GeocodeCountryCode = 'us' | 'ca' | 'mx';

export const ZIP_COUNTRY_STORAGE_KEY = '@user_zip_country';

export const DEFAULT_GEOCODE_COUNTRY: GeocodeCountryCode = 'us';

export const GEOCODE_COUNTRY_OPTIONS: ReadonlyArray<{
  value: GeocodeCountryCode;
  label: string;
}> = [
  { value: 'us', label: 'USA' },
  { value: 'ca', label: 'Canada' },
  { value: 'mx', label: 'Mexico' },
];

export function labelForGeocodeCountry(code: GeocodeCountryCode): string {
  return GEOCODE_COUNTRY_OPTIONS.find((o) => o.value === code)?.label ?? 'USA';
}

export function parseGeocodeCountryCode(value: string | null | undefined): GeocodeCountryCode {
  if (value === 'ca' || value === 'mx') return value;
  return 'us';
}
