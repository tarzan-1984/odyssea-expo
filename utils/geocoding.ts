/**
 * Free reverse geocoding using OpenStreetMap Nominatim API
 * No API key required, completely free
 */

import * as Location from 'expo-location';

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
            const addr = address as Record<string, string | undefined>;
            const postcode =
              addr.postcode ||
              addr.postal_code ||
              addr['postal code'] ||
              addr['addr:postcode'] ||
              '';

            // Map OpenStreetMap format to our format (similar to expo-location)
            const result: GeocodedAddress = {
              city: address.city || address.town || address.village || address.municipality || '',
              state: address.state || address.region || '',
              country: address.country || '',
              postalCode: postcode,
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

/**
 * Nominatim first (works everywhere, no Google key), then device geocoder for missing postcode/city.
 * Apple/Google reverse geocode often returns postal codes where OSM omits them (e.g. Ukraine, EU).
 */
export async function reverseGeocodeWithDeviceFallback(params: {
  latitude: number;
  longitude: number;
}): Promise<GeocodedAddress[]> {
  const nominatimRows = await reverseGeocodeAsync(params);
  const base: GeocodedAddress = nominatimRows[0] || {
    postalCode: '',
    city: '',
    region: '',
    country: '',
    subregion: '',
    district: '',
    isoCountryCode: '',
  };

  const needPostal = !(base.postalCode && String(base.postalCode).trim());
  const needCity = !(base.city && String(base.city).trim());

  if (!needPostal && !needCity) {
    return [base];
  }

  try {
    const nativeList = await Location.reverseGeocodeAsync({
      latitude: params.latitude,
      longitude: params.longitude,
    });
    const n = nativeList[0];
    if (n) {
      const merged: GeocodedAddress = { ...base };
      if (needPostal && n.postalCode) {
        merged.postalCode = n.postalCode;
      }
      if (needCity) {
        merged.city =
          n.city || n.district || n.subregion || base.city || '';
      }
      if ((!merged.region || !String(merged.region).trim()) && n.region) {
        merged.region = n.region;
      }
      if ((!merged.country || !String(merged.country).trim()) && n.country) {
        merged.country = n.country;
      }
      if ((!merged.isoCountryCode || !String(merged.isoCountryCode).trim()) && n.isoCountryCode) {
        merged.isoCountryCode = n.isoCountryCode;
      }
      return [merged];
    }
  } catch (e) {
    console.warn('[geocoding] Device reverseGeocodeAsync failed:', e);
  }

  return [base];
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  postalCode?: string;
}

/**
 * Geocode address or ZIP to coordinates using Nominatim search API
 */
export async function geocodeAsync(query: string, countryCode: 'us' | 'ca' = 'us'): Promise<{ latitude: number; longitude: number } | null> {
  const result = await geocodeWithPostalAsync(query, countryCode);
  return result ? { latitude: result.latitude, longitude: result.longitude } : null;
}

/**
 * Geocode address or ZIP to coordinates and return postal code when available.
 * Uses addressdetails=1; if search doesn't return postcode, falls back to reverse geocode.
 */
export async function geocodeWithPostalAsync(query: string, countryCode: 'us' | 'ca' = 'us'): Promise<GeocodeResult | null> {
  try {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const params = new URLSearchParams({
      q: trimmed,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    });
    params.set('countrycodes', countryCode);

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const result = await new Promise<GeocodeResult | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 10000;
      xhr.open('GET', url, true);
      xhr.setRequestHeader('User-Agent', 'OdysseaApp/1.0');

      let resolved = false;
      xhr.onload = () => {
        if (resolved) return;
        resolved = true;
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as Array<{ lat: string; lon: string; address?: { postcode?: string } }>;
            if (Array.isArray(data) && data.length > 0) {
              const item = data[0];
              let postalCode = item.address?.postcode;
              resolve({
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
                postalCode: postalCode || undefined,
              });
              return;
            }
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      };
      xhr.onerror = xhr.ontimeout = () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      };
      xhr.send();
    });

    // If search didn't return postcode, reverse geocode to get it
    if (result && !result.postalCode) {
      const reversed = await reverseGeocodeAsync({ latitude: result.latitude, longitude: result.longitude });
      if (reversed.length > 0 && reversed[0].postalCode) {
        result.postalCode = reversed[0].postalCode;
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Geocode ZIP or address string to get city and state.
 * Use when user manually enters ZIP - ensures city/state match the entered location.
 */
export async function geocodeZipToAddress(
  zipOrAddress: string,
  countryCode: 'us' | 'ca' = 'us'
): Promise<{ city: string; state: string } | null> {
  const coords = await geocodeWithPostalAsync(zipOrAddress.trim(), countryCode);
  if (!coords) return null;
  const reversed = await reverseGeocodeAsync({
    latitude: coords.latitude,
    longitude: coords.longitude,
  });
  if (reversed.length === 0) return null;
  const g = reversed[0];
  const city = g.city || g.subregion || g.district || '';
  const state = g.region ? g.region.split(' ')[0] : '';
  return { city, state };
}

