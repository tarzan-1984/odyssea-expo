import { NativeModules, Platform } from 'react-native';

const { LocationHttpModule } = NativeModules;

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

  return new Promise((resolve) => {
    try {
      LocationHttpModule.sendLocationUpdate(
        url,
        apiKey,
        requestData as any,
        (success: boolean) => {
          resolve(success);
        },
        (error: { message: string; code: string }) => {
          console.error('[nativeHttpClient] Native request failed:', error.code, error.message);
          resolve(false); // Resolve with false instead of reject
        }
      );
    } catch (error) {
      console.error('[nativeHttpClient] Failed to call native module:', error);
      resolve(false);
    }
  });
}

