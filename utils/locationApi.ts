import * as Location from 'expo-location';
import { StatusValue } from '@/components/common/StatusSelect';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fileLogger } from '@/utils/fileLogger';
import { reverseGeocodeAsync, resolveCityForApi } from '@/utils/geocoding';
import { toBackendStateDisplayName } from '@/utils/stateDisplayName';

/**
 * Format date and time for TMS API
 * Output format: "01/15/2024 10:30 AM"
 */
export function formatStatusDate(statusDate?: string): string {
  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  if (!statusDate || statusDate.trim() === '') {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${day}/${year} ${displayHours}:${minutes} ${ampm}`;
  }

  const trimmed = statusDate.trim();
  // If already contains time (e.g. "02/11/26 2:30 PM"), use it and ensure 4-digit year
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
  // Date only (e.g. "11/24/25"), combine with current time
  return `${trimmed} ${displayHours}:${minutes} ${ampm}`;
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

/** Result of PUT /users/:id/location (DB save + server-side TMS for drivers). */
export type SendLocationToBackendResult = {
  ok: boolean;
  status: number;
  /** True when DB saved but TMS failed (HTTP 503). */
  tmsSyncFailed: boolean;
  tmsError?: string;
};

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
        return { ok: true, status: 503, tmsSyncFailed: true, tmsError: String(tmsError) };
      }

      if (response.ok) {
        console.log('[locationApi] ✅ Backend: Location update sent successfully');
        return { ok: true, status: response.status, tmsSyncFailed: false };
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

