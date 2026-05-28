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
              console.warn(
                '[geocoding][Nominatim] HTTP OK but no address in response — treating as no result',
              );
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
            console.warn(
              `[geocoding][Nominatim] Request failed — HTTP ${xhr.status} (no address data; Expo fallback may run)`,
            );
            resolve([]);
          }
        } catch (parseError) {
          console.warn(
            '[geocoding][Nominatim] Failed to parse response:',
            parseError,
          );
          resolve([]);
        }
      };
      
      xhr.onerror = () => {
        if (resolved) return;
        resolved = true;
        console.warn(
          '[geocoding][Nominatim] Network error (no address data; Expo fallback may run)',
        );
        resolve([]);
      };
      
      xhr.ontimeout = () => {
        if (resolved) return;
        resolved = true;
        console.warn(
          '[geocoding][Nominatim] Request timed out after 10s (Expo fallback may run)',
        );
        resolve([]);
      };
      
      try {
        xhr.send();
      } catch (sendError) {
        if (resolved) return;
        resolved = true;
        console.warn(
          '[geocoding][Nominatim] Failed to send request:',
          sendError,
        );
        resolve([]);
      }
    });
  } catch (error) {
    console.warn('[geocoding][Nominatim] Reverse geocode exception:', error);
    return [];
  }
}

export type ResolvedAddressFields = {
  postalCode: string;
  city: string;
  state: string;
  nominatimOk: boolean;
  expoFilledFields: string[];
};

const NOMINATIM_REVERSE_TIMEOUT_MS = 10_000;
const EXPO_REVERSE_TIMEOUT_MS = 8_000;

function geocodeLogTag(logTag?: string): string {
  return logTag?.trim() || '[geocoding]';
}

function applyNominatimGeoToFields(geo: GeocodedAddress): ResolvedAddressFields {
  const regionRaw = geo.region ? String(geo.region).trim() : '';
  return {
    postalCode: (geo.postalCode || '').trim(),
    city: resolveCityForApi(geo),
    state:
      toBackendStateDisplayName(regionRaw, geo.isoCountryCode) || regionRaw,
    nominatimOk: true,
    expoFilledFields: [],
  };
}

function hasAnyAddressField(fields: Pick<ResolvedAddressFields, 'postalCode' | 'city' | 'state'>): boolean {
  return !!(
    (fields.postalCode && fields.postalCode.trim()) ||
    fields.city.trim() ||
    fields.state.trim()
  );
}

/**
 * Fill missing postal/city/state via Expo Location.reverseGeocodeAsync (device geocoder).
 */
export async function fillAddressGapsFromExpo(params: {
  latitude: number;
  longitude: number;
  postalCode: string;
  city: string;
  state: string;
  logTag?: string;
  /** Background auto-update: allow Expo to fill city/state. Share flow: ZIP (+ region) only. */
  allowExpoCityState?: boolean;
}): Promise<ResolvedAddressFields> {
  const tag = geocodeLogTag(params.logTag);
  let { postalCode, city, state } = params;
  const expoFilledFields: string[] = [];

  const needsPostal = !(postalCode && postalCode.trim());
  const needsCity = !city.trim();
  const needsState = !state.trim();

  if (!needsPostal && !needsCity && !needsState) {
    console.log(`${tag}[Expo] Skipped — Nominatim already provided postal/city/state`);
    return { postalCode, city, state, nominatimOk: false, expoFilledFields };
  }

  console.log(
    `${tag}[Expo] Requesting device reverse geocode to fill gaps: ${[
      needsPostal && 'postalCode',
      needsCity && params.allowExpoCityState !== false && 'city',
      needsState && params.allowExpoCityState !== false && 'state',
    ]
      .filter(Boolean)
      .join(', ') || 'none'}`,
  );

  try {
    const expoPromise = Location.reverseGeocodeAsync({
      latitude: params.latitude,
      longitude: params.longitude,
    });
    const expoTimeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Expo reverseGeocode timeout')),
        EXPO_REVERSE_TIMEOUT_MS,
      );
    });
    const expoRows = (await Promise.race([expoPromise, expoTimeout]).catch(
      () => [],
    )) as Location.LocationGeocodedAddress[];
    const e = expoRows[0];

    if (!e) {
      console.warn(
        `${tag}[Expo] No result (empty response or timeout) — gaps may remain unfilled`,
      );
      return { postalCode, city, state, nominatimOk: false, expoFilledFields };
    }

    if (needsPostal) {
      const pc = (e.postalCode || '').trim();
      if (pc) {
        postalCode = pc;
        expoFilledFields.push('postalCode');
      }
    }
    if (params.allowExpoCityState !== false) {
      if (needsCity) {
        const ct = (
          e.city ||
          e.subregion ||
          e.district ||
          e.name ||
          ''
        ).trim();
        if (ct) {
          city = ct;
          expoFilledFields.push('city');
        }
      }
      if (needsState) {
        const st =
          toBackendStateDisplayName(e.region, e.isoCountryCode) ||
          (e.region ? String(e.region).trim() : '');
        if (st) {
          state = st;
          expoFilledFields.push('state');
        }
      }
    }

    if (expoFilledFields.length > 0) {
      console.log(
        `${tag}[Expo] OK — filled missing field(s): ${expoFilledFields.join(', ')} (zip="${postalCode || ''}" city="${city || ''}" state="${state || ''}")`,
      );
    } else {
      console.warn(
        `${tag}[Expo] Response received but could not fill remaining gap(s): postal=${needsPostal && !postalCode} city=${needsCity && !city} state=${needsState && !state}`,
      );
    }
  } catch (expoErr) {
    console.warn(
      `${tag}[Expo] reverseGeocodeAsync failed:`,
      expoErr instanceof Error ? expoErr.message : String(expoErr),
    );
  }

  return { postalCode, city, state, nominatimOk: false, expoFilledFields };
}

/**
 * Nominatim reverse geocode, then Expo for any missing postal/city/state.
 * Logs clearly when Nominatim fails, when Expo rescues, and when both fail.
 */
export async function reverseGeocodeNominatimThenExpo(params: {
  latitude: number;
  longitude: number;
  logTag?: string;
  allowExpoCityState?: boolean;
}): Promise<ResolvedAddressFields> {
  const tag = geocodeLogTag(params.logTag);

  const nominatimPromise = reverseGeocodeAsync({
    latitude: params.latitude,
    longitude: params.longitude,
  });
  const nominatimTimeout = new Promise<GeocodedAddress[]>((_, reject) => {
    setTimeout(
      () => reject(new Error('Nominatim reverse geocode timeout')),
      NOMINATIM_REVERSE_TIMEOUT_MS,
    );
  });

  let fields: ResolvedAddressFields = {
    postalCode: '',
    city: '',
    state: '',
    nominatimOk: false,
    expoFilledFields: [],
  };

  try {
    const nominatimRows = await Promise.race([nominatimPromise, nominatimTimeout]);
    if (nominatimRows.length > 0) {
      fields = { ...applyNominatimGeoToFields(nominatimRows[0]!), nominatimOk: true };
      console.log(
        `${tag}[Nominatim] OK — zip="${fields.postalCode || ''}" city="${fields.city || ''}" state="${fields.state || ''}"`,
      );
    } else {
      console.warn(
        `${tag}[Nominatim] No usable address (empty or error — see [Nominatim] warnings above); trying Expo`,
      );
    }
  } catch {
    console.warn(
      `${tag}[Nominatim] Timed out after ${NOMINATIM_REVERSE_TIMEOUT_MS / 1000}s; trying Expo`,
    );
  }

  const afterExpo = await fillAddressGapsFromExpo({
    latitude: params.latitude,
    longitude: params.longitude,
    postalCode: fields.postalCode,
    city: fields.city,
    state: fields.state,
    logTag: params.logTag,
    allowExpoCityState: params.allowExpoCityState,
  });

  const merged: ResolvedAddressFields = {
    postalCode: afterExpo.postalCode,
    city: afterExpo.city,
    state: afterExpo.state,
    nominatimOk: fields.nominatimOk,
    expoFilledFields: afterExpo.expoFilledFields,
  };

  if (!hasAnyAddressField(merged)) {
    console.error(
      `${tag}[Geocode] FAILED — neither Nominatim nor Expo returned postal/city/state; coordinates-only update may be sent`,
    );
  } else if (!fields.nominatimOk && afterExpo.expoFilledFields.length > 0) {
    console.log(
      `${tag}[Geocode] Resolved via Expo after Nominatim had no usable address`,
    );
  } else if (fields.nominatimOk && afterExpo.expoFilledFields.length > 0) {
    console.log(
      `${tag}[Geocode] Nominatim partial — Expo completed: ${afterExpo.expoFilledFields.join(', ')}`,
    );
  }

  return merged;
}

/**
 * Nominatim first (English labels via Accept-Language), then device geocoder only for missing
 * postal code. Native city/region strings are not merged — they follow the device locale.
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

  if (nominatimRows.length > 0) {
    console.log(
      `[geocoding][Share][Nominatim] OK — zip="${(base.postalCode || '').trim()}" city="${resolveCityForApi(base)}"`,
    );
  }

  const filled = await fillAddressGapsFromExpo({
    latitude: params.latitude,
    longitude: params.longitude,
    postalCode: (base.postalCode || '').trim(),
    city: resolveCityForApi(base),
    state:
      toBackendStateDisplayName(base.region, base.isoCountryCode) ||
      (base.region ? String(base.region).trim() : ''),
    logTag: '[geocoding][Share]',
    allowExpoCityState: false,
  });

  const merged: GeocodedAddress = {
    ...base,
    postalCode: filled.postalCode || base.postalCode,
    city: base.city || filled.city,
    region: filled.state || base.region,
  };

  if (
    (!merged.region || !String(merged.region).trim()) &&
    filled.expoFilledFields.length > 0
  ) {
    try {
      const nativeList = await Location.reverseGeocodeAsync(params);
      const n = nativeList[0];
      if (n?.region && !merged.region) merged.region = n.region;
      if (n?.country && !merged.country) merged.country = n.country;
      if (n?.isoCountryCode && !merged.isoCountryCode) {
        merged.isoCountryCode = n.isoCountryCode;
      }
    } catch {
      // ignore
    }
  }

  const hasUseful =
    !!(merged.postalCode && String(merged.postalCode).trim()) ||
    !!(merged.city && String(merged.city).trim());
  if (!hasUseful) {
    console.error(
      '[geocoding][Share][Geocode] FAILED — neither Nominatim nor Expo returned postal/city',
    );
  } else if (nominatimRows.length === 0 && filled.expoFilledFields.length > 0) {
    console.log(
      '[geocoding][Share][Geocode] Resolved via Expo after Nominatim had no usable address',
    );
  }

  return [merged];
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

