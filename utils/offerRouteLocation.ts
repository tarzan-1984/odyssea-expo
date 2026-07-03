/**
 * Client-side geocoding + route distance (same behavior as Next.js offer APIs).
 */

import {
  geocodeOfferAddressCoordinates,
  geocodeOfferToFormattedAddress,
} from './offerLocationGeocode';

export {
  isValidLocationFormat,
  normalizeLocationForGeocode,
  needsLocationGeocode,
  LOCATION_FORMAT_ERROR,
  CITY_STATE_ABBR_PATTERN,
  ZIP_PATTERN,
} from './offerLocationFormat';

const METERS_TO_MILES = 1 / 1609.344;
const NOMINATIM_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocodeToFormattedAddress(address: string): Promise<string> {
  return geocodeOfferToFormattedAddress(address);
}

export async function geocodeAddressCoordinates(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  const point = await geocodeOfferAddressCoordinates(address);
  if (!point) return null;
  return { latitude: point.lat, longitude: point.lon };
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

export async function calculateRouteDistanceMiles(
  locations: string[]
): Promise<{ loadedMiles: number }> {
  if (locations.length < 2) {
    throw new Error('At least 2 locations required for distance calculation');
  }

  const coords: { lat: number; lon: number }[] = [];
  for (let i = 0; i < locations.length; i++) {
    if (i > 0) await sleep(NOMINATIM_DELAY_MS);

    const point = await geocodeOfferAddressCoordinates(locations[i]);
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
