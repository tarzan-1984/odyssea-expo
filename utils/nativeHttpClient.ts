import { NativeModules, Platform } from 'react-native';

// Get module dynamically to ensure it's available in background tasks
const getLocationHttpModule = () => {
  try {
    return NativeModules.LocationHttpModule;
  } catch (e) {
    console.warn('[nativeHttpClient] Failed to get LocationHttpModule from NativeModules:', e);
    return null;
  }
};

interface LocationUpdateData {
  driver_status: string;
  status_date: string;
  current_location: string;
  current_city: string;
  current_zipcode: string;
  latitude: string;
  longitude: string;
  country: string;
  current_country: string;
  notes: string;
}

/**
 * Send location update using native HTTP client (OkHttp)
 * This works in headless JS context on Android
 */
export async function sendLocationUpdateNative(
  url: string,
  apiKey: string,
  requestData: LocationUpdateData
): Promise<boolean> {
  const LocationHttpModule = getLocationHttpModule();
  
  if (Platform.OS !== 'android' || !LocationHttpModule) {
    console.warn('[nativeHttpClient] Native module not available, falling back to fetch');
    // Fallback to fetch if native module not available
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });
      return response.ok;
    } catch (error) {
      console.error('[nativeHttpClient] Fetch fallback failed:', error);
      return false;
    }
  }

  try {
    // LocationHttpModule.sendLocationUpdate uses Promise-based API (React Native Promise)
    // The native module automatically returns a Promise in JavaScript
    const success = await LocationHttpModule.sendLocationUpdate(url, apiKey, requestData as any);
    return success;
  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorCode = error?.code || 'unknown';
    console.error('[nativeHttpClient] Native request failed:', errorCode, errorMessage);
    return false; // Return false instead of throwing
  }
}

/**
 * Send HTTP GET request using native HTTP client (OkHttp)
 * This works in headless JS context on Android
 * Returns response body as string (JSON should be parsed in JavaScript)
 */
export async function sendHttpGetRequestNative(
  url: string,
  headers?: Record<string, string>
): Promise<string | null> {
  if (Platform.OS !== 'android' || !LocationHttpModule) {
    console.warn('[nativeHttpClient] Native module not available for GET request, falling back to fetch');
    // Fallback to fetch if native module not available
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: headers || {},
      });
      if (response.ok) {
        return await response.text();
      }
      return null;
    } catch (error) {
      console.error('[nativeHttpClient] Fetch fallback failed:', error);
      return null;
    }
  }

  try {
    // Convert headers object to ReadableMap format for React Native
    const headersMap = headers ? Object.keys(headers).reduce((acc, key) => {
      acc[key] = headers[key];
      return acc;
    }, {} as Record<string, string>) : null;

    // LocationHttpModule.sendHttpGetRequest uses Promise-based API (React Native Promise)
    // The native module automatically returns a Promise in JavaScript
    const responseBody = await LocationHttpModule.sendHttpGetRequest(url, headersMap as any);
    return responseBody;
  } catch (error: any) {
    console.error('[nativeHttpClient] Native GET request failed:', error);
    // Return null on error instead of throwing
    return null;
  }
}

