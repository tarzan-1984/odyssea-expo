/**
 * Client-side geocoding + route distance (same behavior as Next.js
 * /api/offers/geocode-to-formatted and /api/offers/calculate-route-distance).
 */

const METERS_TO_MILES = 1 / 1609.344;
const NOMINATIM_DELAY_MS = 1100;

export const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

const CITY_STATE_PATTERN = /^[^,]+\s*,\s*[^,]+$/;

export const CITY_STATE_ABBR_PATTERN = /^([^,]+),\s*([A-Za-z]{2})\s*$/;

export const LOCATION_FORMAT_ERROR =
  'Use format: City, State (e.g. Los Angeles, CA), City State, or ZIP code';

function isValidSpaceSeparatedLocation(value: string): boolean {
  if (value.includes(',')) return false;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  if (ZIP_PATTERN.test(last)) {
    return parts.length >= 3;
  }
  return true;
}

export function isValidLocationFormat(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = trimmed.replace(/\s/g, '');
  if (ZIP_PATTERN.test(normalized)) return true;
  if (CITY_STATE_PATTERN.test(trimmed)) return true;
  return isValidSpaceSeparatedLocation(trimmed);
}

export function normalizeLocationForGeocode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(',')) return trimmed;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;

  let zip: string | undefined;
  let rest = parts;
  const last = parts[parts.length - 1];
  if (ZIP_PATTERN.test(last)) {
    zip = last;
    rest = parts.slice(0, -1);
  }

  if (rest.length < 2) {
    return zip ?? trimmed;
  }

  const stateToken = rest[rest.length - 1];
  const city = rest.slice(0, -1).join(' ');

  if (zip) {
    return zip;
  }

  if (/^[A-Za-z]{2}$/.test(stateToken)) {
    return `${city}, ${stateToken}`;
  }

  return `${city}, ${stateToken}`;
}

export function needsLocationGeocode(value: string): boolean {
  const geocodeAddress = normalizeLocationForGeocode(value);
  return (
    ZIP_PATTERN.test(geocodeAddress.replace(/\s/g, '')) ||
    CITY_STATE_ABBR_PATTERN.test(geocodeAddress)
  );
}

const STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode a ZIP or "City, ST" to "City, State ZIP" (or best effort). Same as Next geocode-to-formatted.
 */
export async function geocodeToFormattedAddress(address: string): Promise<string> {
  const input = address.trim();
  if (!input) return input;

  const isZip = ZIP_PATTERN.test(input.replace(/\s/g, ''));
  const cityStateMatch = CITY_STATE_ABBR_PATTERN.exec(input);

  if (!isZip && !cityStateMatch) {
    return input;
  }

  if (cityStateMatch) {
    const cityRaw = cityStateMatch[1].trim();
    const stateAbbr = cityStateMatch[2].toUpperCase();
    const stateFull = STATE_ABBR_TO_NAME[stateAbbr] ?? stateAbbr;

    try {
      const zippUrl = `https://api.zippopotam.us/us/${encodeURIComponent(stateAbbr)}/${encodeURIComponent(cityRaw)}`;
      const zippRes = await fetch(zippUrl, { headers: { Accept: 'application/json' } });

      if (zippRes.ok) {
        const zippData = (await zippRes.json()) as {
          places?: Array<{ 'post code'?: string; 'place name'?: string }>;
        };
        const firstPlace = zippData.places?.[0];
        const zip = firstPlace?.['post code'];
        const placeName = firstPlace?.['place name'] ?? cityRaw;

        if (zip) {
          return `${placeName}, ${stateFull} ${zip}`;
        }
      }
    } catch {
      // Nominatim fallback below
    }

    try {
      const params = new URLSearchParams({
        q: `${cityRaw}, ${stateAbbr}, USA`,
        format: 'json',
        limit: '5',
        addressdetails: '1',
        countrycodes: 'us',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          'User-Agent': 'OdysseaApp/1.0 (geocode-formatted)',
          'Accept-Language': 'en',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{
          address?: {
            city?: string;
            town?: string;
            village?: string;
            municipality?: string;
            state?: string;
            postcode?: string;
          };
        }>;
        const withZip = data.find((r) => r.address?.postcode);
        if (withZip?.address) {
          const addr = withZip.address;
          const city =
            addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? cityRaw;
          const zip = addr.postcode!;
          return `${city}, ${stateFull} ${zip}`;
        }
      }
    } catch {
      // keep partial
    }

    return `${cityRaw}, ${stateFull}`;
  }

  const query = input.includes('USA') ? input : `${input}, USA`;
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    addressdetails: '1',
    countrycodes: 'us',
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': 'OdysseaApp/1.0 (geocode-formatted)',
      'Accept-Language': 'en',
    },
  });

  if (!res.ok) {
    return input;
  }

  const data = (await res.json()) as Array<{
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      state?: string;
      postcode?: string;
    };
  }>;

  if (!Array.isArray(data) || data.length === 0 || !data[0].address) {
    return input;
  }

  const addr = data[0].address;
  const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '';
  const state = addr.state ?? '';
  const postcode = addr.postcode ?? input;

  if (city && state && postcode) {
    return `${city}, ${state} ${postcode}`;
  }
  if (city && state) {
    return `${city}, ${state}`;
  }
  return input;
}

async function geocodeAddressForCoords(address: string): Promise<{ lat: number; lon: number } | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const query = trimmed.includes('USA') ? trimmed : `${trimmed}, USA`;
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': 'OdysseaApp/1.0 (route-distance)',
      'Accept-Language': 'en',
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(data) || data.length === 0) return null;

  const lat = Number.parseFloat(data[0].lat);
  const lon = Number.parseFloat(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return { lat, lon };
}

async function getOsrmDistanceMeters(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<number | null> {
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as { routes?: Array<{ distance: number }> };
  if (!data.routes?.[0] || typeof data.routes[0].distance !== 'number') return null;

  return data.routes[0].distance;
}

export async function calculateRouteDistanceMiles(locations: string[]): Promise<{ loadedMiles: number }> {
  if (locations.length < 2) {
    throw new Error('At least 2 locations required for distance calculation');
  }

  const coords: { lat: number; lon: number }[] = [];
  for (let i = 0; i < locations.length; i++) {
    if (i > 0) await sleep(NOMINATIM_DELAY_MS);

    const point = await geocodeAddressForCoords(locations[i]);
    if (!point) {
      throw new Error(`Could not geocode address: ${String(locations[i]).slice(0, 80)}`);
    }
    coords.push(point);
  }

  let totalMeters = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const dist = await getOsrmDistanceMeters(coords[i], coords[i + 1]);
    if (dist == null) {
      throw new Error('Could not calculate route between addresses');
    }
    totalMeters += dist;
  }

  return { loadedMiles: totalMeters * METERS_TO_MILES };
}
