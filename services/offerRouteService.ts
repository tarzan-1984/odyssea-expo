/**
 * Fetches offer route: geocodes addresses and gets road route geometry from OSRM.
 * Used for displaying route on map.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { geocodeOfferAddressCoordinates } from '@/utils/offerLocationGeocode';

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
const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROUTE_CACHE_PREFIX = '@offer_route_cache_v1:';
const GEOCODE_CACHE_PREFIX = '@offer_route_geocode_v1:';

type CachedValue<T> = {
  createdAt: number;
  value: T;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCacheKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function routeCacheKey(locations: string[]): string {
  return `${ROUTE_CACHE_PREFIX}${locations.map(normalizeCacheKey).join('|')}`;
}

function geocodeCacheKey(address: string): string {
  return `${GEOCODE_CACHE_PREFIX}${normalizeCacheKey(address)}`;
}

function isRoutePoint(value: unknown): value is RoutePoint {
  const point = value as RoutePoint;
  return (
    typeof point?.latitude === 'number' &&
    typeof point?.longitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

function isOfferRouteResult(value: unknown): value is OfferRouteResult {
  const route = value as OfferRouteResult;
  return (
    Array.isArray(route?.markers) &&
    route.markers.every(isRoutePoint) &&
    Array.isArray(route?.polyline) &&
    route.polyline.every(isRoutePoint) &&
    typeof route?.bounds?.minLat === 'number' &&
    typeof route?.bounds?.maxLat === 'number' &&
    typeof route?.bounds?.minLng === 'number' &&
    typeof route?.bounds?.maxLng === 'number'
  );
}

async function readCache<T>(
  key: string,
  ttlMs: number,
  isValid: (value: unknown) => value is T
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValue<unknown>;
    if (!parsed || typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > ttlMs) return null;
    return isValid(parsed.value) ? parsed.value : null;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        createdAt: Date.now(),
        value,
      } satisfies CachedValue<T>)
    );
  } catch {
    // Cache failures should never block map rendering.
  }
}

/**
 * Geocode address to coordinates (US / Canada / Mexico — same as Create Offer).
 */
async function geocodeAddress(address: string): Promise<RoutePoint | null> {
  const trimmed = (address || '').trim();
  if (!trimmed) return null;

  const cached = await readCache(geocodeCacheKey(trimmed), GEOCODE_CACHE_TTL_MS, isRoutePoint);
  if (cached) return cached;

  const result = await geocodeOfferAddressCoordinates(trimmed);
  if (result) {
    const point = { latitude: result.lat, longitude: result.lon };
    await writeCache(geocodeCacheKey(trimmed), point);
    return point;
  }

  return null;
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

export async function fetchRouteForPoints(points: RoutePoint[]): Promise<OfferRouteResult | null> {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );
  if (validPoints.length === 0) return null;

  const polyline = validPoints.length >= 2 ? await fetchOsrmRoute(validPoints) : [];
  const bounds = computeBounds(validPoints, polyline);
  return { markers: validPoints, polyline, bounds };
}

export function createRoutePreviewFromPoints(points: RoutePoint[]): OfferRouteResult | null {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );
  if (validPoints.length === 0) return null;

  const previewPolyline = validPoints.length >= 2 ? validPoints : [];
  return {
    markers: validPoints,
    polyline: previewPolyline,
    bounds: computeBounds(validPoints, previewPolyline),
  };
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

  const key = routeCacheKey(unique);
  const cached = await readCache(key, ROUTE_CACHE_TTL_MS, isOfferRouteResult);
  if (cached) return cached;

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

  const route = await fetchRouteForPoints(markers);
  if (route) {
    await writeCache(key, route);
  }
  return route;
}
