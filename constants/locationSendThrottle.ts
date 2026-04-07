import AsyncStorage from '@react-native-async-storage/async-storage';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';

/** AsyncStorage key for last successful location API send (TMS/backend batch from app). */
export const LOCATION_LAST_API_SEND_AT_KEY = '@location_last_api_send_at_ms';

/**
 * Minimum time between automatic background location pings to TMS + backend.
 * Shorter values increase server load; longer values delay freshness.
 */
export const LOCATION_API_MIN_INTERVAL_MS = 60 * 1000;

/** Minimum straight-line distance (meters) from last synced position before sending again. */
export const LOCATION_API_MIN_DISTANCE_METERS = 3000;

/**
 * distanceInterval for Expo Location.startLocationUpdatesAsync (meters).
 * Aligns OS callback rate with the minimum movement we care to upload.
 */
export const LOCATION_BACKGROUND_DISTANCE_INTERVAL_METERS =
  LOCATION_API_MIN_DISTANCE_METERS;

const USER_LOCATION_KEY = '@user_location';

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Gates automatic (background task) location uploads: both time and distance must allow send.
 */
export async function shouldSendAutomaticLocationUpdate(
  latitude: number,
  longitude: number
): Promise<{ ok: boolean; reason: string }> {
  const { locationMinIntervalMs, locationMinDistanceM } =
    await getResolvedAppLocationSettings();
  const now = Date.now();

  const lastSendStr = await AsyncStorage.getItem(LOCATION_LAST_API_SEND_AT_KEY);
  const lastSendMs = lastSendStr ? parseInt(lastSendStr, 10) : 0;
  if (locationMinIntervalMs > 0 && Number.isFinite(lastSendMs) && lastSendMs > 0) {
    const elapsed = now - lastSendMs;
    if (elapsed < locationMinIntervalMs) {
      return {
        ok: false,
        reason: `min_interval_not_elapsed(${Math.round(elapsed / 1000)}s < ${locationMinIntervalMs / 1000}s)`,
      };
    }
  }

  if (locationMinDistanceM > 0) {
    try {
      const locJson = await AsyncStorage.getItem(USER_LOCATION_KEY);
      if (locJson) {
        const loc = JSON.parse(locJson) as { latitude?: number; longitude?: number };
        if (
          typeof loc.latitude === 'number' &&
          typeof loc.longitude === 'number' &&
          Number.isFinite(loc.latitude) &&
          Number.isFinite(loc.longitude)
        ) {
          const d = haversineDistanceMeters(
            loc.latitude,
            loc.longitude,
            latitude,
            longitude
          );
          if (d < locationMinDistanceM) {
            return {
              ok: false,
              reason: `distance_below_threshold(${Math.round(d)}m < ${locationMinDistanceM}m)`,
            };
          }
        }
      }
    } catch {
      // No prior position — allow if time gate passed
    }
  }

  return { ok: true, reason: 'passed_distance_and_time_gates' };
}

/** Call after any successful sendLocationUpdateToBackendUser (manual or background). */
export async function recordSuccessfulLocationApiSend(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LOCATION_LAST_API_SEND_AT_KEY,
      String(Date.now())
    );
  } catch {
    // ignore
  }
}
