import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/config';
import { fileLogger } from '@/utils/fileLogger';
import { eventBus, AppEvents } from '@/services/EventBus';

/** Defaults aligned with `locationSendThrottle.ts` (used when API/storage not yet loaded). */
const FALLBACK_INTERVAL_MS = 60 * 1000;
const FALLBACK_DISTANCE_M = 3000;
const FALLBACK_REVERSE_GEOCODE_DISTANCE_M = 5000;
const FALLBACK_ENV_MODE: 'live' | 'test' = 'live';
const FALLBACK_TEST_DRIVER_EXTERNAL_ID = '3343';
const FALLBACK_MAX_DRIVER_OPEN_OFFER_PARTICIPATIONS = 2;

export const APP_LOCATION_SETTINGS_KEY = '@app_location_settings_v1';

export type AppLocationSettingsStored = {
  locationMinIntervalMs: number;
  locationMinDistanceM: number;
  reverseGeocodeMinDistanceM: number;
  locationEnvironmentMode: 'live' | 'test';
  locationTestDriverExternalId: string;
  /** Max active unassigned offers the driver may bid on at once (server + UI limit). */
  maxDriverOpenOfferParticipations: number;
  /** Server minimum marketing version; empty = no server-side force-update gate. */
  minimumAppVersion: string;
};

export const DEFAULT_APP_LOCATION_SETTINGS: AppLocationSettingsStored = {
  locationMinIntervalMs: FALLBACK_INTERVAL_MS,
  locationMinDistanceM: FALLBACK_DISTANCE_M,
  reverseGeocodeMinDistanceM: FALLBACK_REVERSE_GEOCODE_DISTANCE_M,
  locationEnvironmentMode: FALLBACK_ENV_MODE,
  locationTestDriverExternalId: FALLBACK_TEST_DRIVER_EXTERNAL_ID,
  maxDriverOpenOfferParticipations: FALLBACK_MAX_DRIVER_OPEN_OFFER_PARTICIPATIONS,
  minimumAppVersion: '',
};

function clampParticipationLimit(n: number): number {
  if (!Number.isFinite(n)) return FALLBACK_MAX_DRIVER_OPEN_OFFER_PARTICIPATIONS;
  const rounded = Math.floor(n);
  if (rounded < 1) return 1;
  if (rounded > 50) return 50;
  return rounded;
}

export async function getResolvedAppLocationSettings(): Promise<AppLocationSettingsStored> {
  try {
    const raw = await AsyncStorage.getItem(APP_LOCATION_SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_APP_LOCATION_SETTINGS };
    }
    const p = JSON.parse(raw) as Partial<AppLocationSettingsStored>;
    const interval =
      typeof p.locationMinIntervalMs === 'number' && p.locationMinIntervalMs >= 0
        ? p.locationMinIntervalMs
        : DEFAULT_APP_LOCATION_SETTINGS.locationMinIntervalMs;
    const distance =
      typeof p.locationMinDistanceM === 'number' && p.locationMinDistanceM >= 0
        ? p.locationMinDistanceM
        : DEFAULT_APP_LOCATION_SETTINGS.locationMinDistanceM;
    const revGeo =
      typeof p.reverseGeocodeMinDistanceM === 'number' &&
      p.reverseGeocodeMinDistanceM >= 100
        ? p.reverseGeocodeMinDistanceM
        : DEFAULT_APP_LOCATION_SETTINGS.reverseGeocodeMinDistanceM;
    const envMode =
      p.locationEnvironmentMode === 'test' || p.locationEnvironmentMode === 'live'
        ? p.locationEnvironmentMode
        : DEFAULT_APP_LOCATION_SETTINGS.locationEnvironmentMode;
    const testExtId =
      typeof p.locationTestDriverExternalId === 'string' &&
      p.locationTestDriverExternalId.trim() !== ''
        ? p.locationTestDriverExternalId.trim()
        : DEFAULT_APP_LOCATION_SETTINGS.locationTestDriverExternalId;
    const participations =
      typeof p.maxDriverOpenOfferParticipations === 'number'
        ? clampParticipationLimit(p.maxDriverOpenOfferParticipations)
        : DEFAULT_APP_LOCATION_SETTINGS.maxDriverOpenOfferParticipations;
    const minimumAppVersion =
      typeof p.minimumAppVersion === 'string' ? p.minimumAppVersion.trim() : '';
    return {
      locationMinIntervalMs: interval,
      locationMinDistanceM: distance,
      reverseGeocodeMinDistanceM: revGeo,
      locationEnvironmentMode: envMode,
      locationTestDriverExternalId: testExtId,
      maxDriverOpenOfferParticipations: participations,
      minimumAppVersion,
    };
  } catch {
    return { ...DEFAULT_APP_LOCATION_SETTINGS };
  }
}

export async function persistAppLocationSettingsLocally(
  s: AppLocationSettingsStored
): Promise<void> {
  await AsyncStorage.setItem(APP_LOCATION_SETTINGS_KEY, JSON.stringify(s));
}

export async function fetchAppLocationSettingsFromBackend(
  accessToken: string
): Promise<AppLocationSettingsStored | null> {
  if (!API_BASE_URL) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/v1/app-settings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const body = data.data ?? data;
    if (!body || typeof body !== 'object') return null;
    const interval = body.locationMinIntervalMs;
    const distance = body.locationMinDistanceM;
    const revGeoRaw = body.reverseGeocodeMinDistanceM;
    const envModeRaw = body.locationEnvironmentMode;
    const testExtIdRaw = body.locationTestDriverExternalId;
    const revGeo =
      typeof revGeoRaw === 'number' && revGeoRaw >= 100
        ? revGeoRaw
        : FALLBACK_REVERSE_GEOCODE_DISTANCE_M;
    if (typeof interval !== 'number' || typeof distance !== 'number') return null;
    if (interval < 0 || distance < 0) return null;
    const envMode: 'live' | 'test' =
      envModeRaw === 'test' || envModeRaw === 'live' ? envModeRaw : FALLBACK_ENV_MODE;
    const testExtId =
      typeof testExtIdRaw === 'string' && testExtIdRaw.trim() !== ''
        ? testExtIdRaw.trim()
        : FALLBACK_TEST_DRIVER_EXTERNAL_ID;
    const maxPartRaw = body.maxDriverOpenOfferParticipations;
    const maxDriverOpenOfferParticipations =
      typeof maxPartRaw === 'number'
        ? clampParticipationLimit(maxPartRaw)
        : FALLBACK_MAX_DRIVER_OPEN_OFFER_PARTICIPATIONS;
    const minimumAppVersionRaw = body.minimumAppVersion;
    const minimumAppVersion =
      typeof minimumAppVersionRaw === 'string' ? minimumAppVersionRaw.trim() : '';
    return {
      locationMinIntervalMs: interval,
      locationMinDistanceM: distance,
      reverseGeocodeMinDistanceM: revGeo,
      locationEnvironmentMode: envMode,
      locationTestDriverExternalId: testExtId,
      maxDriverOpenOfferParticipations,
      minimumAppVersion,
    };
  } catch (e) {
    fileLogger.error('appLocationSettings', 'FETCH_FAILED', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Fetches global app location thresholds from backend, persists to AsyncStorage.
 * Emits APP_LOCATION_SETTINGS_SYNCED when values differ from stored (so UI can restart tracking).
 */
export async function syncAppLocationSettingsFromBackend(
  accessToken: string
): Promise<boolean> {
  const remote = await fetchAppLocationSettingsFromBackend(accessToken);
  if (!remote) return false;

  const prev = await getResolvedAppLocationSettings();
  const changed =
    prev.locationMinIntervalMs !== remote.locationMinIntervalMs ||
    prev.locationMinDistanceM !== remote.locationMinDistanceM ||
    prev.reverseGeocodeMinDistanceM !== remote.reverseGeocodeMinDistanceM ||
    prev.locationEnvironmentMode !== remote.locationEnvironmentMode ||
    prev.locationTestDriverExternalId !== remote.locationTestDriverExternalId ||
    prev.maxDriverOpenOfferParticipations !== remote.maxDriverOpenOfferParticipations ||
    prev.minimumAppVersion !== remote.minimumAppVersion;

  await persistAppLocationSettingsLocally(remote);
  if (changed) {
    eventBus.emit('APP_LOCATION_SETTINGS_SYNCED', remote);
  }
  eventBus.emit(AppEvents.AppUpdateCheckRequested, remote);
  return changed;
}
