/**
 * Free reverse geocoding using OpenStreetMap Nominatim API
 * No API key required, completely free
 */

import * as Location from 'expo-location';
import { toBackendStateDisplayName } from '@/utils/stateDisplayName';

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

/** OSM address keys in priority order for a human locality name (matches TMS `current_city` style). */
function localityFromOsmAddress(addr: Record<string, string | undefined>): string {
  const keys = [
    'city',
    'town',
    'village',
    'municipality',
    'hamlet',
    'suburb',
    'neighbourhood',
    'quarter',
    'city_district',
  ];
  for (const k of keys) {
    const v = addr[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

/**
 * Locality for API `city` → DB → TMS `current_city` (e.g. "Hialeah Gardens", "West Bridgewater").
 * Prefer `city`; then `district`; `subregion` last (often a county from Nominatim — avoid when city exists).
 */
export function resolveCityForApi(geo: Partial<GeocodedAddress>): string {
  const pick = (s?: string) => (s && String(s).trim()) || '';
  const c = pick(geo.city);
  if (c) return c;
  const d = pick(geo.district);
  if (d) return d;
  return pick(geo.subregion);
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
    
    // Nominatim localizes by HTTP Accept-Language; force English for UI labels (independent of device locale)
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=en`;
    
    // IMPORTANT: Use XMLHttpRequest instead of fetch - it works in headless JS/background tasks
    // Same approach as in locationApi.ts for sending location updates
    return new Promise<GeocodedAddress[]>((resolve) => {
      const xhr = new XMLHttpRequest();
      const timeout = 10000; // 10 seconds
      
      xhr.timeout = timeout;
      xhr.open('GET', url, true);
      xhr.setRequestHeader('User-Agent', 'OdysseaApp/1.0'); // Required by Nominatim
      xhr.setRequestHeader('Accept-Language', 'en');
      
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

            const locality = localityFromOsmAddress(addr);
            // Map OpenStreetMap format to our format (similar to expo-location)
            const result: GeocodedAddress = {
              city: locality || addr.district || addr.neighbourhood || '',
              state: address.state || address.region || '',
              country: address.country || '',
              postalCode: postcode,
              region: address.state || address.region || '',
              subregion: addr.county || addr.state_district || '',
              district: addr.district || addr.neighbourhood || addr.quarter || '',
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
          resolveCityForApi({
            city: n.city || undefined,
            district: n.district || undefined,
            subregion: n.subregion || undefined,
          }) || resolveCityForApi(base);
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
    params.set('accept-language', 'en');

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const result = await new Promise<GeocodeResult | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 10000;
      xhr.open('GET', url, true);
      xhr.setRequestHeader('User-Agent', 'OdysseaApp/1.0');
      xhr.setRequestHeader('Accept-Language', 'en');

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
  const city = resolveCityForApi(g);
  const state =
    toBackendStateDisplayName(g.region, g.isoCountryCode) || '';
  return { city, state };
}

