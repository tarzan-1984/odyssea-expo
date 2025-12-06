/**
 * Free reverse geocoding using OpenStreetMap Nominatim API
 * No API key required, completely free
 */

import { Platform } from 'react-native';
import { sendHttpGetRequestNative } from '@/utils/nativeHttpClient';

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
 * Uses native HTTP client in background/headless JS (works on Android)
 * Falls back to fetch in foreground (works on both platforms)
 */
export async function reverseGeocodeAsync(params: {
  latitude: number;
  longitude: number;
}): Promise<GeocodedAddress[]> {
  try {
    const { latitude, longitude } = params;
    
    // OpenStreetMap Nominatim API - free, no API key required
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    
    let responseBody: string | null = null;
    
    // Use native HTTP client in background (Android) or fallback to fetch
    if (Platform.OS === 'android') {
      try {
        responseBody = await sendHttpGetRequestNative(url, {
          'User-Agent': 'OdysseaApp/1.0', // Required by Nominatim
        });
      } catch (nativeError) {
        console.warn('[geocoding] Native HTTP request failed, trying fetch fallback:', nativeError);
        // Fallback to fetch
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'OdysseaApp/1.0',
          },
        });
        if (response.ok) {
          responseBody = await response.text();
        }
      }
    } else {
      // iOS or other platforms - use fetch
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'OdysseaApp/1.0',
        },
      });
      if (response.ok) {
        responseBody = await response.text();
      }
    }

    if (!responseBody) {
      throw new Error('Geocoding failed: No response body');
    }

    const data = JSON.parse(responseBody);
    
    if (!data || !data.address) {
      return [];
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

    return [result];
  } catch (error) {
    console.warn('[geocoding] Reverse geocoding failed:', error);
    return [];
  }
}

