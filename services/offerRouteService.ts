/**
 * Fetches offer route: geocodes addresses and gets road route geometry from OSRM.
 * Used for displaying route on map.
 */
import { geocodeAsync } from '@/utils/geocoding';

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface OfferRouteResult {
  markers: RoutePoint[];
  polyline: RoutePoint[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

const NOMINATIM_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Geocode address to coordinates (add USA if not present)
 */
async function geocodeAddress(address: string): Promise<RoutePoint | null> {
  const trimmed = (address || '').trim();
  if (!trimmed) return null;
  const candidates = buildGeocodeCandidates(trimmed);
  for (const c of candidates) {
    const query = c.includes('USA') ? c : `${c}, USA`;
    const result = await geocodeAsync(query, 'us');
    if (result) {
      return { latitude: result.latitude, longitude: result.longitude };
    }
  }
  return null;
}

function buildGeocodeCandidates(address: string): string[] {
  const a = (address || '').trim();
  if (!a) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const v = (s || '').trim().replace(/\s+/g, ' ');
    if (v && !out.includes(v)) out.push(v);
  };

  // Full address first
  push(a);

  // Remove common "Doors X-Y" / suite-ish fragments that Nominatim sometimes rejects
  push(a.replace(/\bDoors?\s+[0-9A-Za-z-]+\b,?/gi, '').replace(/\s+,/g, ','));

  // City, ST ZIP fallback (very reliable)
  const cityStateZip = a.match(/,\s*([^,]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\s*$/);
  if (cityStateZip?.[1]) push(cityStateZip[1]);

  // ZIP-only fallback
  const zip = a.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (zip?.[1]) push(zip[1]);

  return out;
}

/**
 * Fetch OSRM route geometry between coordinates.
 * Returns array of [lat, lng] points along the road.
 */
async function fetchOsrmRoute(
  points: RoutePoint[]
): Promise<RoutePoint[]> {
  if (points.length < 2) return [];
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'OdysseaApp/1.0' },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
  };
  const coordsArray = data.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordsArray) || coordsArray.length === 0) return [];

  return coordsArray.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

/**
 * Calculate bounds from markers and polyline
 */
function computeBounds(
  markers: RoutePoint[],
  polyline: RoutePoint[]
): OfferRouteResult['bounds'] {
  const all = [...markers, ...polyline];
  if (all.length === 0) {
    return {
      minLat: 38.627,
      maxLat: 39.627,
      minLng: -91.199,
      maxLng: -89.199,
    };
  }
  let minLat = all[0].latitude;
  let maxLat = all[0].latitude;
  let minLng = all[0].longitude;
  let maxLng = all[0].longitude;
  for (const p of all) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const pad = 0.1;
  return {
    minLat: minLat - pad,
    maxLat: maxLat + pad,
    minLng: minLng - pad,
    maxLng: maxLng + pad,
  };
}

/**
 * Fetch full route data: geocode locations, get OSRM road geometry.
 */
export async function fetchOfferRoute(
  locations: string[]
): Promise<OfferRouteResult | null> {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const unique = [...new Set(locations.map((l) => (l || '').trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  const markers: RoutePoint[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) await sleep(NOMINATIM_DELAY_MS);
    const addr = unique[i];
    const point = await geocodeAddress(addr);
    if (!point) {
      // Do not fail the whole route if one address can't be geocoded.
      // We can still show the other markers (and polyline if >= 2 points).
      console.warn('[offerRouteService] Failed to geocode address, skipping:', addr);
      continue;
    }
    markers.push(point);
  }

  if (markers.length === 0) {
    console.warn('[offerRouteService] No geocoded markers for locations:', unique);
    return null;
  }

  const polyline = markers.length >= 2 ? await fetchOsrmRoute(markers) : [];
  const bounds = computeBounds(markers, polyline);

  return { markers, polyline, bounds };
}
