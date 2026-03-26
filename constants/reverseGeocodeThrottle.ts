import AsyncStorage from '@react-native-async-storage/async-storage';

/** Unix seconds — last successful background/manual reverse geocode (Nominatim). */
export const LAST_SUCCESSFUL_REVERSE_GEOCODE_UNIX_KEY =
  '@last_successful_reverse_geocode_unix';

/**
 * In the product, a driver always has a driver status. Background location still
 * sends fresh coordinates every tick; scheduled Nominatim reverse geocoding runs
 * only for these two statuses (throttled). Any other status: no Nominatim in
 * background — only cached ZIP/city/state from AsyncStorage until the user
 * changes status or uses “Share my location”.
 */
const BACKGROUND_NOMINATIM_INTERVAL_SEC_BY_STATUS: Readonly<Record<string, number>> =
  {
    loaded_enroute: 10 * 60,
    available: 20 * 60,
  };

/**
 * Min seconds between Nominatim reverse geocodes in the background task for the
 * given driver status. `null` — do not call Nominatim; use cached ZIP/city/state.
 */
export function getReverseGeocodeIntervalSecondsForDriverStatus(
  status: string | null | undefined
): number | null {
  const s = (status || '').trim();
  if (!s) return null;
  const sec = BACKGROUND_NOMINATIM_INTERVAL_SEC_BY_STATUS[s];
  return sec !== undefined ? sec : null;
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
