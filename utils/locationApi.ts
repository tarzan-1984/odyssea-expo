import * as Location from 'expo-location';
import { StatusValue } from '@/components/common/StatusSelect';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    let responseData: any;
    try {
      responseData = await response.json();
    } catch (parseError) {
      // If response is not JSON (e.g., HTML error page), read as text
      const textData = await response.text();
      responseData = { error: 'Invalid JSON response', raw: textData.substring(0, 200) };
    }
    
    console.log('[locationApi] TMS API Response status:', response.status);
    
    if (response.ok) {
      console.log('[locationApi] ✅ Location update sent successfully');
      if (responseData?.success) {
        console.log('[locationApi] TMS API confirmed success');
      }
      return true;
    } else {
      // Log error details without overwhelming the console
      const errorMessage = responseData?.message || responseData?.error || 'Unknown error';
      const errorCode = responseData?.code || 'unknown';
      console.error(`[locationApi] ❌ Failed to send location update: ${response.status} (${errorCode})`);
      console.error(`[locationApi] Error message: ${errorMessage}`);
      
      // Only log full response data for non-500 errors or if it's small
      if (response.status !== 500 && responseData && Object.keys(responseData).length < 10) {
        console.warn('[locationApi] Response data:', responseData);
      } else if (response.status === 500) {
        console.warn('[locationApi] Server error (500) - this is a backend issue, not a client issue');
      }
      
      return false;
    }
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

    const accessToken = await secureStorage.getItemAsync('accessToken');
    const userJson = await secureStorage.getItemAsync('user');

    if (!accessToken || !userJson) {
      console.warn('[locationApi] Missing access token or user data, skipping backend location update');
      return;
    }

    const user = JSON.parse(userJson);
    const userId = user?.id;

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

