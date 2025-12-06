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
 */
export async function reverseGeocodeAsync(params: {
  latitude: number;
  longitude: number;
}): Promise<GeocodedAddress[]> {
  try {
    const { latitude, longitude } = params;
    
    // OpenStreetMap Nominatim API - free, no API key required
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OdysseaApp/1.0', // Required by Nominatim
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    
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

