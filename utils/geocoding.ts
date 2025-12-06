/**
 * Free reverse geocoding using OpenStreetMap Nominatim API
 * No API key required, completely free
 */

export interface GeocodedAddress {
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  region?: string;
  subregion?: string;
  district?: string;
  isoCountryCode?: string;
}

/**
 * Reverse geocode coordinates to address using OpenStreetMap Nominatim API
 * Free, no API key required
 * Uses XMLHttpRequest (works in headless JS/background tasks) instead of fetch
 */
export async function reverseGeocodeAsync(params: {
  latitude: number;
  longitude: number;
}): Promise<GeocodedAddress[]> {
  try {
    const { latitude, longitude } = params;
    
    // OpenStreetMap Nominatim API - free, no API key required
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    
    // IMPORTANT: Use XMLHttpRequest instead of fetch - it works in headless JS/background tasks
    // Same approach as in locationApi.ts for sending location updates
    return new Promise<GeocodedAddress[]>((resolve) => {
      const xhr = new XMLHttpRequest();
      const timeout = 10000; // 10 seconds
      
      xhr.timeout = timeout;
      xhr.open('GET', url, true);
      xhr.setRequestHeader('User-Agent', 'OdysseaApp/1.0'); // Required by Nominatim
      
      let resolved = false;
      
      xhr.onload = () => {
        if (resolved) return;
        resolved = true;
        
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            
            if (!data || !data.address) {
              resolve([]);
              return;
            }

            const address = data.address;
            
            // Map OpenStreetMap format to our format (similar to expo-location)
            const result: GeocodedAddress = {
              city: address.city || address.town || address.village || address.municipality || '',
              state: address.state || address.region || '',
              country: address.country || '',
              postalCode: address.postcode || '',
              region: address.state || address.region || '',
              subregion: address.county || address.state_district || '',
              district: address.district || address.neighbourhood || '',
              isoCountryCode: address.country_code?.toUpperCase() || '',
            };

            resolve([result]);
          } else {
            console.warn(`[geocoding] Geocoding failed: ${xhr.status}`);
            resolve([]);
          }
        } catch (parseError) {
          console.warn('[geocoding] Failed to parse geocoding response:', parseError);
          resolve([]);
        }
      };
      
      xhr.onerror = () => {
        if (resolved) return;
        resolved = true;
        console.warn('[geocoding] Geocoding request failed: Network error');
        resolve([]);
      };
      
      xhr.ontimeout = () => {
        if (resolved) return;
        resolved = true;
        console.warn('[geocoding] Geocoding request timed out');
        resolve([]);
      };
      
      try {
        xhr.send();
      } catch (sendError) {
        if (resolved) return;
        resolved = true;
        console.warn('[geocoding] Failed to send geocoding request:', sendError);
        resolve([]);
      }
    });
  } catch (error) {
    console.warn('[geocoding] Reverse geocoding failed:', error);
    return [];
  }
}

