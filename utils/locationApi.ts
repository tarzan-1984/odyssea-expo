import * as Location from 'expo-location';
import { StatusValue } from '@/components/common/StatusSelect';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fileLogger } from '@/utils/fileLogger';
import { reverseGeocodeAsync, resolveCityForApi } from '@/utils/geocoding';
import { toLocationDeviceFields } from '@/utils/mobileDevicePayload';
import { loadMobileDeviceContextForBackground } from '@/utils/mobileDeviceIdentity';

import { formatStatusDateNyDisplay } from './nyWallClock';

/**
 * Format date and time for TMS API (America/New_York wall clock).
 * Output format: "01/15/2024 10:30 AM"
 */
export function formatStatusDate(statusDate?: string): string {
  const nowNy = formatStatusDateNyDisplay(new Date());
  const nowTimeMatch = nowNy.match(/\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  const nowTimePart = nowTimeMatch?.[1] ?? '12:00 AM';

  if (!statusDate || statusDate.trim() === '') {
    const dateMatch = nowNy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+/);
    if (dateMatch) {
      const [, month, day, year2] = dateMatch;
      return `${month}/${day}/20${year2} ${nowTimePart}`;
    }
    return nowNy;
  }

  const trimmed = statusDate.trim();
  const timeMatch = trimmed.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (timeMatch) {
    const datePart = timeMatch[1];
    const timePart = timeMatch[2];
    const dateSegments = datePart.split('/');
    if (dateSegments.length === 3) {
      let year = parseInt(dateSegments[2], 10);
      if (year < 100) year += 2000;
      return `${dateSegments[0]}/${dateSegments[1]}/${year} ${timePart}`;
    }
  }
  return `${trimmed} ${nowTimePart}`;
}

/**
 * Get location details (city, state, country) from coordinates
 */
export async function getLocationDetails(
  latitude: number,
  longitude: number
): Promise<{ city: string; state: string; country: string }> {
  let city = '';
  let state = '';
  let country = 'USA';

  try {
    const rows = await reverseGeocodeAsync({ latitude, longitude });
    if (rows.length > 0) {
      const g = rows[0]!;
      city = resolveCityForApi(g);
      state =
        toBackendStateDisplayName(g.region, g.isoCountryCode) ||
        (g.region ? String(g.region).trim() : '');
      const c = g.country || '';
      country =
        c === 'United States' || g.isoCountryCode === 'US'
          ? 'USA'
          : c || g.isoCountryCode || 'USA';
      return { city, state, country };
    }
  } catch (geoError) {
    console.warn('[locationApi] Nominatim location details failed:', geoError);
  }

  return { city, state, country };
}

/**
 * Map status value to API format
 */
export function mapStatusToApi(statusValue: StatusValue): string {
  // Map all status values to their API format
  // For now, return as-is since all statuses are valid
  return statusValue;
}

/**
 * Get local time of device as ISO-like string without timezone suffix.
 * Example: "2025-12-02T22:05:20.818" (exactly what user sees on the phone).
 */
export function getLocalIsoString(date: Date = new Date()): string {
  const offsetMinutes = date.getTimezoneOffset();
  const localTime = new Date(date.getTime() - offsetMinutes * 60_000);
  // Remove trailing "Z" to avoid it being interpreted as UTC
  return localTime.toISOString().replace(/Z$/, '');
}

/**
 * Send location update to TMS API
 */
export async function sendLocationUpdateToTMS(
  externalId: string,
  latitude: number,
  longitude: number,
  zipCode: string,
  statusValue: StatusValue,
  statusDate?: string
): Promise<boolean> {
  try {
    if (!externalId) {
      console.error('[locationApi] No externalId provided');
      fileLogger.error('locationApi', 'NO_EXTERNAL_ID', {
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
      });
      return false;
    }

    // Get location details from reverse geocoding
    const { city, state, country } = await getLocationDetails(latitude, longitude);

    // Format date
    const formattedDate = formatStatusDate(statusDate);

    // Map status
    const driverStatus = mapStatusToApi(statusValue);

    // Prepare request data
    const requestData = {
      driver_status: driverStatus,
      status_date: formattedDate,
      current_location: state || 'NY',
      current_city: city || 'New York',
      current_zipcode: zipCode || '',
      latitude: String(latitude),
      longitude: String(longitude),
      country: country,
      current_country: country,
      notes: 'Driver is available for new loads',
    };

    const apiKey = process.env.EXPO_PUBLIC_TMS_API_KEY;
    if (!apiKey) {
      console.error('[locationApi] TMS API Key not configured');
      fileLogger.error('locationApi', 'TMS_API_KEY_NOT_CONFIGURED', {
        externalId,
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
      });
      return false;
    }

    const trimmedId = externalId.trim();
    if (!/^\d+$/.test(trimmedId)) {
      console.error('[locationApi] TMS batch requires numeric driver externalId');
      fileLogger.error('locationApi', 'TMS_BATCH_NON_NUMERIC_DRIVER_ID', { externalId });
      return false;
    }
    const driverId = parseInt(trimmedId, 10);
    const url =
      'https://www.endurance-tms.com/wp-json/tms/v1/driver/location/update/batch?user_id=1';

    const batchBody = {
      items: [
        {
          driver_id: driverId,
          ...requestData,
        },
      ],
    };

    console.log('[locationApi] Sending location batch update to TMS API...');
    const fetchStartTime = Date.now();

    return new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      const timeout = 30000; // 30 seconds (increased from 10s to handle slow TMS API responses)

      xhr.timeout = timeout;
      xhr.open('POST', url, true);
      xhr.setRequestHeader('X-API-Key', apiKey);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      let resolved = false;
      
      xhr.onload = () => {
        if (resolved) return;
        resolved = true;
        const fetchDuration = Date.now() - fetchStartTime;
        
        let responseData: any;
        try {
          responseData = JSON.parse(xhr.responseText);
        } catch (parseError) {
          fileLogger.error('locationApi', 'RESPONSE_PARSE_ERROR', {
            status: xhr.status,
            duration: fetchDuration,
            responsePreview: xhr.responseText?.substring(0, 200),
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          responseData = { error: 'Invalid JSON response', raw: xhr.responseText?.substring(0, 200) };
        }
        
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[locationApi] ✅ TMS API: Location update sent successfully');
          resolve(true);
        } else {
          const errorMessage = responseData?.message || responseData?.error || 'Unknown error';
          const errorCode = responseData?.code || 'unknown';
          console.error(`[locationApi] ❌ TMS API: Failed to send location update (${xhr.status} - ${errorCode})`);
          fileLogger.error('locationApi', 'SEND_FAILED', {
            status: xhr.status,
            errorCode,
            errorMessage,
            duration: fetchDuration,
            externalId,
            responsePreview: xhr.responseText?.substring(0, 200),
          });
          resolve(false);
        }
      };
      
      xhr.onerror = () => {
        if (resolved) return;
        resolved = true;
        const fetchDuration = Date.now() - fetchStartTime;
        console.error(`[locationApi] ❌ TMS API: Network error`);
        fileLogger.error('locationApi', 'NETWORK_ERROR', {
          duration: fetchDuration,
          externalId,
          url,
        });
        resolve(false);
      };
      
      xhr.ontimeout = () => {
        if (resolved) return;
        resolved = true;
        const fetchDuration = Date.now() - fetchStartTime;
        console.error(`[locationApi] ❌ TMS API: Request timed out`);
        fileLogger.error('locationApi', 'REQUEST_TIMEOUT', {
          duration: fetchDuration,
          timeout: timeout,
          externalId,
          url,
          note: 'Request will be retried via queue',
        });
        resolve(false);
      };
      
      try {
        xhr.send(JSON.stringify(batchBody));
      } catch (sendError) {
        if (resolved) return;
        resolved = true;
        console.error(`[locationApi] ❌ TMS API: Failed to send request`);
        fileLogger.error('locationApi', 'SEND_EXCEPTION', {
          error: sendError instanceof Error ? sendError.message : String(sendError),
          stack: sendError instanceof Error ? sendError.stack : undefined,
          externalId,
          url,
        });
        resolve(false);
      }
    });
  } catch (error) {
    console.error('[locationApi] ❌ TMS API: Error sending location update');
    fileLogger.error('locationApi', 'SEND_LOCATION_EXCEPTION', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      externalId,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    });
    return false;
  }
}

/** Address fields resolved on the server (PostGIS → cache → HERE). */
export type ResolvedBackendUserLocation = {
  city?: string;
  state?: string;
  zip?: string;
  location?: string;
};

/** Result of PUT /users/:id/location (DB save + server-side TMS for drivers). */
export type SendLocationToBackendResult = {
  ok: boolean;
  status: number;
  /** True when DB saved but TMS failed (HTTP 503). */
  tmsSyncFailed: boolean;
  tmsError?: string;
  /** Saved user location fields returned by backend after server-side geocode. */
  resolved?: ResolvedBackendUserLocation;
};

const USER_LOCATION_KEY = '@user_location';

function extractUserFromBackendResponse(
  responseData: unknown,
): Record<string, unknown> | undefined {
  const raw = responseData as Record<string, unknown> | null | undefined;
  if (!raw) {
    return undefined;
  }
  const data = raw.data;
  if (data && typeof data === 'object') {
    const envelope = data as Record<string, unknown>;
    if (envelope.user && typeof envelope.user === 'object') {
      return envelope.user as Record<string, unknown>;
    }
    if ('city' in envelope || 'zip' in envelope || 'latitude' in envelope) {
      return envelope;
    }
  }
  if (raw.user && typeof raw.user === 'object') {
    return raw.user as Record<string, unknown>;
  }
  return undefined;
}

function extractResolvedUserFromBackendResponse(
  responseData: unknown,
): ResolvedBackendUserLocation | undefined {
  const user = extractUserFromBackendResponse(responseData);
  if (!user) {
    return undefined;
  }
  const trim = (v: unknown): string | undefined => {
    if (typeof v !== 'string') {
      return undefined;
    }
    const t = v.trim();
    return t || undefined;
  };
  return {
    city: trim(user.city),
    state: trim(user.state),
    zip: trim(user.zip),
    location: trim(user.location),
  };
}

/** Map banner / form line from server-resolved address (zip optional). */
export function buildLocationDisplayLabel(parts: {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}): string | undefined {
  const city = parts.city?.trim();
  const state = parts.state?.trim();
  const zip = parts.zip?.trim();
  const country = parts.country?.trim();
  // Avoid misleading zip-only badges when city/state failed to resolve.
  if (!city && !state && !country) {
    return undefined;
  }
  const tokens = [city, state, zip, country].filter(Boolean);
  return tokens.length > 0 ? tokens.join(' ') : undefined;
}

/** Cache server-resolved city/state/zip for map UI and next background ping. */
export async function persistResolvedUserLocationToCache(params: {
  latitude: number;
  longitude: number;
  resolved?: ResolvedBackendUserLocation;
}): Promise<void> {
  const zip = params.resolved?.zip;
  const city = params.resolved?.city;
  const state = params.resolved?.state;
  await AsyncStorage.setItem(
    USER_LOCATION_KEY,
    JSON.stringify({
      latitude: params.latitude,
      longitude: params.longitude,
      zipCode: zip,
      city,
      state,
      lastUpdate: new Date().toISOString(),
    }),
  );
  if (zip) {
    await AsyncStorage.setItem('@user_zip', zip);
  } else if (city || state) {
    // Drop stale ZIP from another region when server sent a new city/state without zip.
    await AsyncStorage.removeItem('@user_zip');
  }
}

/**
 * Send location update to our own backend (DB + TMS sync on server for drivers).
 * `ok` is true for 200 and 503 (databaseUpdated); false for other errors.
 */
export async function sendLocationUpdateToBackendUser(params: {
  location?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude: number;
  longitude: number;
  lastUpdateIso?: string;
  /** Omit on background-only pings to avoid overwriting driver status in DB. */
  driverStatus?: string;
  statusDate?: string;
  isAutoupdate?: boolean;
  /** True only from background location task — server skips TMS for this request. */
  isBackgroundTaskLocationUpdate?: boolean;
  /** True only for status form submit or Share location — server logs as manual. */
  isManualDriverLocationAction?: boolean;
  deviceId?: string;
  deviceModel?: string;
  deviceName?: string;
  devicePlatform?: string;
}): Promise<SendLocationToBackendResult> {
  try {
    if (!API_BASE_URL) {
      console.warn('[locationApi] API_BASE_URL is not configured, skipping backend location update');
      return { ok: false, status: 0, tmsSyncFailed: false };
    }

    // IMPORTANT: In background/headless JS, secureStorage may not work (requires user interaction on iOS)
    // Try AsyncStorage first (cached when app is active), then secureStorage as fallback
    let accessToken: string | null = null;
    let userId: string | null = null;
    
    // Try to get from AsyncStorage cache first (works in background)
    try {
      const cachedToken = await AsyncStorage.getItem('@user_access_token');
      const cachedUserId = await AsyncStorage.getItem('@user_id');
      if (cachedToken && cachedUserId) {
        accessToken = cachedToken;
        userId = cachedUserId;
        console.log('[locationApi] ✅ Using cached accessToken and userId from AsyncStorage');
      }
    } catch (cacheError) {
      console.warn('[locationApi] Failed to read from AsyncStorage cache:', cacheError);
    }
    
    // Fallback: try secureStorage (may fail in background on iOS)
    if (!accessToken || !userId) {
      try {
        const token = await secureStorage.getItemAsync('accessToken');
        const userJson = await secureStorage.getItemAsync('user');
        if (token && userJson) {
          const user = JSON.parse(userJson);
          accessToken = token;
          userId = user?.id || null;
          // Cache for next time
          if (accessToken && userId) {
            await AsyncStorage.setItem('@user_access_token', accessToken);
            await AsyncStorage.setItem('@user_id', userId);
          }
        }
      } catch (secureStorageError) {
        // Silent fail
      }
    }

    if (!accessToken || !userId) {
      return { ok: false, status: 401, tmsSyncFailed: false };
    }

    const url = `${API_BASE_URL}/v1/users/${userId}/location`;

    /** Non-empty trimmed string → set on body; empty/omit → backend keeps existing columns. */
    const putTrimmed = (
      obj: Record<string, unknown>,
      key: string,
      value: string | undefined,
    ): void => {
      if (value === undefined || value === null) {
        return;
      }
      const t = String(value).trim();
      if (t === '') {
        return;
      }
      obj[key] = t;
    };

    const body: Record<string, unknown> = {
      latitude: params.latitude,
      longitude: params.longitude,
      lastLocationUpdateAt: params.lastUpdateIso ?? getLocalIsoString(),
    };
    putTrimmed(body, 'location', params.location);
    putTrimmed(body, 'city', params.city);
    putTrimmed(body, 'state', params.state);
    putTrimmed(body, 'zip', params.zip);
    if (params.country !== undefined) body.country = params.country;
    if (params.driverStatus !== undefined) body.driverStatus = params.driverStatus;
    if (params.statusDate !== undefined) body.statusDate = params.statusDate;
    if (params.isAutoupdate !== undefined) body.isAutoupdate = params.isAutoupdate;
    if (params.isBackgroundTaskLocationUpdate === true) {
      body.isBackgroundTaskLocationUpdate = true;
    }
    if (params.isManualDriverLocationAction === true) {
      body.isManualDriverLocationAction = true;
    }

    let deviceFields = toLocationDeviceFields(
      params.deviceId
        ? {
            deviceId: params.deviceId,
            model: params.deviceModel,
            deviceName: params.deviceName,
            platform: params.devicePlatform,
          }
        : null,
    );
    if (!deviceFields.deviceId) {
      try {
        const cachedDevice = await loadMobileDeviceContextForBackground();
        deviceFields = toLocationDeviceFields(cachedDevice);
      } catch {
        // Legacy clients without device id must still send location updates.
      }
    }
    if (deviceFields.deviceId) body.deviceId = deviceFields.deviceId;
    if (deviceFields.deviceModel) body.deviceModel = deviceFields.deviceModel;
    if (deviceFields.deviceName) body.deviceName = deviceFields.deviceName;
    if (deviceFields.devicePlatform) body.devicePlatform = deviceFields.devicePlatform;

    try {
      const isImmediateBackground =
        params.isBackgroundTaskLocationUpdate === true &&
        params.isManualDriverLocationAction !== true;
      if (isImmediateBackground) {
        console.log(
          `[locationApi] PUT ${url} (background/automatic${params.isAutoupdate ? ', autoupdate on' : ''})`,
        );
      } else {
        console.log('[locationApi] Sending location update to backend...');
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      let responseData: any = null;
      try {
        responseData = await response.json();
      } catch {
        // ignore JSON parse errors, maybe empty body
      }

      const wrappedOk = responseData?.data ?? responseData;
      const resolved = extractResolvedUserFromBackendResponse(responseData);

      if (response.status === 503) {
        const errBody = responseData as { tmsError?: string; message?: string; databaseUpdated?: boolean };
        const tmsError =
          errBody?.tmsError ||
          (typeof errBody?.message === 'string' ? errBody.message : undefined) ||
          'TMS sync failed after database update';
        console.warn('[locationApi] ⚠️ Backend saved location but TMS sync failed:', tmsError);
        fileLogger.error('locationApi', 'BACKEND_OK_TMS_FAILED', {
          status: response.status,
          tmsError,
          databaseUpdated: errBody?.databaseUpdated === true,
        });
        return {
          ok: true,
          status: 503,
          tmsSyncFailed: true,
          tmsError: String(tmsError),
          resolved,
        };
      }

      if (response.ok) {
        console.log('[locationApi] ✅ Backend: Location update sent successfully');
        return { ok: true, status: response.status, tmsSyncFailed: false, resolved };
      }

      fileLogger.error('locationApi', 'Backend location update returned non-2xx status', {
        status: response.status,
        data: responseData,
      });
      console.error('[locationApi] ❌ Backend: Failed to send location update');
      return {
        ok: false,
        status: response.status,
        tmsSyncFailed: false,
        tmsError:
          typeof wrappedOk === 'object' && wrappedOk && 'message' in wrappedOk
            ? String((wrappedOk as { message?: string }).message)
            : undefined,
      };
    } catch (error) {
      fileLogger.error('locationApi', 'Backend location update request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('[locationApi] ❌ Backend: Error sending location update');
      return { ok: false, status: 0, tmsSyncFailed: false };
    }
  } catch (error) {
    return { ok: false, status: 0, tmsSyncFailed: false };
  }
}

