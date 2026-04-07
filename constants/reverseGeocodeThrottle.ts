import AsyncStorage from '@react-native-async-storage/async-storage';

/** Unix seconds — last successful background reverse geocode (Expo OS or Nominatim). */
export const LAST_SUCCESSFUL_REVERSE_GEOCODE_UNIX_KEY =
  '@last_successful_reverse_geocode_unix';

/** JSON `{ lat, lon }` — point where we last resolved ZIP/city/state successfully. */
export const REVERSE_GEOCODE_ANCHOR_KEY = '@reverse_geocode_anchor_v1';

/** Distance threshold comes from app_settings via `getResolvedAppLocationSettings().reverseGeocodeMinDistanceM`. */

export type GeocodeAnchor = { lat: number; lon: number };

export async function loadGeocodeAnchor(): Promise<GeocodeAnchor | null> {
  try {
    const raw = await AsyncStorage.getItem(REVERSE_GEOCODE_ANCHOR_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GeocodeAnchor>;
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return null;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
    return { lat: p.lat, lon: p.lon };
  } catch {
    return null;
  }
}

export async function saveGeocodeAnchor(lat: number, lon: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      REVERSE_GEOCODE_ANCHOR_KEY,
      JSON.stringify({ lat, lon })
    );
  } catch {
    // ignore
  }
}

/**
 * Background reverse geocode (Expo → Nominatim fallback) only for these statuses.
 * Others: use cached ZIP/city/state only.
 */
export function shouldRunBackgroundGeocodeForDriverStatus(
  status: string | null | undefined
): boolean {
  const s = (status || '').trim();
  return s === 'loaded_enroute' || s === 'available';
}

export async function saveLastSuccessfulReverseGeocodeTimestamp(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_SUCCESSFUL_REVERSE_GEOCODE_UNIX_KEY,
      String(Math.floor(Date.now() / 1000))
    );
  } catch {
    // ignore
  }
}
