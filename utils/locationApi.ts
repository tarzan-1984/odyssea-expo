import * as Location from 'expo-location';
import { StatusValue } from '@/components/common/StatusSelect';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import { sendLocationUpdateNative } from '@/utils/nativeHttpClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Format date and time for TMS API
 * Format: "01/15/2024 10:30 AM"
 */
export function formatStatusDate(statusDate?: string): string {
  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  if (statusDate && statusDate.trim() !== '') {
    // If statusDate is provided (e.g., "11/24/2025"), combine it with current time
    return `${statusDate} ${displayHours}:${minutes} ${ampm}`;
  } else {
    // Use current date and time
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${day}/${year} ${displayHours}:${minutes} ${ampm}`;
  }
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
    // Use expo-location's native reverseGeocodeAsync - works in both foreground and background
    const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (reverseGeocode && reverseGeocode.length > 0) {
      const geo = reverseGeocode[0];
      city = geo.city || geo.subregion || geo.district || '';
      state = geo.region ? geo.region.split(' ')[0] : '';
      country = geo.country === 'United States' ? 'USA' : (geo.country || geo.isoCountryCode || 'USA');
    }
  } catch (geoError) {
    console.warn('[locationApi] Failed to get location details from geocoding:', geoError);
  }
  
  return { city, state, country };
}

/**
 * Map status value to API format
 */
export function mapStatusToApi(statusValue: StatusValue): string {
  const statusMap: Record<StatusValue, string> = {
    'available': 'available',
    'available_on': 'available_on',
    'available_off': 'available_off',
    'loaded_enroute': 'loaded_enroute',
  };
  return statusMap[statusValue] || 'available';
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
      return false;
    }

    const url = `https://www.endurance-tms.com/wp-json/tms/v1/driver/location/update?driver_id=${externalId}&user_id=1`;
    
    console.log('[locationApi] Sending location update to TMS API...');
    console.log('[locationApi] URL:', url);
    console.log('[locationApi] Request data:', requestData);

    // IMPORTANT: In headless JS (background task), fetch may hang or timeout
    // Use XMLHttpRequest instead - it works better in headless JS on Android
    console.log('[locationApi] Starting HTTP request with XMLHttpRequest (works in headless JS)...');
    const fetchStartTime = Date.now();
    
    return new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      const timeout = 10000; // 10 seconds
      
      xhr.timeout = timeout;
      xhr.open('POST', url, true);
      xhr.setRequestHeader('X-API-Key', apiKey);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      let resolved = false;
      
      xhr.onload = () => {
        if (resolved) return;
        resolved = true;
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`[locationApi] ✅ Request completed in ${fetchDuration}ms, status: ${xhr.status}`);
        
        let responseData: any;
        try {
          responseData = JSON.parse(xhr.responseText);
          console.log(`[locationApi] ✅ Response parsed successfully`);
        } catch (parseError) {
          console.warn(`[locationApi] ⚠️ Failed to parse JSON, response: ${xhr.responseText?.substring(0, 200)}`);
          responseData = { error: 'Invalid JSON response', raw: xhr.responseText?.substring(0, 200) };
        }
        
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[locationApi] ✅ Location update sent successfully');
          if (responseData?.success) {
            console.log('[locationApi] TMS API confirmed success');
          }
          resolve(true);
        } else {
          const errorMessage = responseData?.message || responseData?.error || 'Unknown error';
          const errorCode = responseData?.code || 'unknown';
          console.error(`[locationApi] ❌ Failed to send location update: ${xhr.status} (${errorCode})`);
          console.error(`[locationApi] Error message: ${errorMessage}`);
          resolve(false);
        }
      };
      
      xhr.onerror = () => {
        if (resolved) return;
        resolved = true;
        const fetchDuration = Date.now() - fetchStartTime;
        console.error(`[locationApi] ❌ Request failed after ${fetchDuration}ms: Network error`);
        resolve(false);
      };
      
      xhr.ontimeout = () => {
        if (resolved) return;
        resolved = true;
        const fetchDuration = Date.now() - fetchStartTime;
        console.error(`[locationApi] ❌ Request timed out after ${fetchDuration}ms`);
        resolve(false);
      };
      
      try {
        xhr.send(JSON.stringify(requestData));
      } catch (sendError) {
        if (resolved) return;
        resolved = true;
        console.error(`[locationApi] ❌ Failed to send request:`, sendError);
        resolve(false);
      }
    });
  } catch (error) {
    console.error('[locationApi] ❌ Error sending location update:', error);
    return false;
  }
}

/**
 * Send location update to our own backend (users table)
 * Fire-and-forget helper: callers can ignore the returned promise.
 */
export async function sendLocationUpdateToBackendUser(params: {
  location?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude: number;
  longitude: number;
  lastUpdateIso?: string;
}) {
  try {
    if (!API_BASE_URL) {
      console.warn('[locationApi] API_BASE_URL is not configured, skipping backend location update');
      return;
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
            console.log('[locationApi] ✅ Retrieved from secureStorage and cached in AsyncStorage');
          }
        }
      } catch (secureStorageError) {
        console.warn('[locationApi] SecureStorage not available in background (expected on iOS):', secureStorageError);
      }
    }

    if (!accessToken || !userId) {
      console.warn('[locationApi] Missing access token or user data, skipping backend location update');
      return;
    }

    if (!userId) {
      console.warn('[locationApi] User ID not found in secure storage, skipping backend location update');
      return;
    }

    const url = `${API_BASE_URL}/v1/users/${userId}/location`;

    const body = {
      location: params.location,
      city: params.city,
      state: params.state,
      zip: params.zip,
      latitude: params.latitude,
      longitude: params.longitude,
      // Use either explicitly provided client timestamp or device local time string
      lastLocationUpdateAt: params.lastUpdateIso ?? getLocalIsoString(),
    };

    try {
      console.log('[locationApi] 🔄 Sending location update to backend users endpoint...', {
        url,
        body,
      });

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

      if (response.ok) {
        console.log(
          '[locationApi] ✅ Backend user location updated successfully',
          responseData ? { status: response.status, data: responseData } : { status: response.status },
        );
      } else {
        console.warn(
          '[locationApi] ❌ Backend user location update returned non-2xx status',
          { status: response.status, data: responseData },
        );
      }
    } catch (error) {
      console.warn('[locationApi] ❌ Backend location update request failed:', error);
    }
  } catch (error) {
    console.warn('[locationApi] ❌ Error while preparing backend location update:', error);
  }
}

