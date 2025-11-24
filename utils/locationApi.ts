import * as Location from 'expo-location';
import { StatusValue } from '@/components/common/StatusSelect';

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

    const responseData = await response.json();
    console.log('[locationApi] TMS API Response status:', response.status);
    console.log('[locationApi] TMS API Response data:', responseData);

    if (response.ok) {
      console.log('[locationApi] ✅ Location update sent successfully');
      return true;
    } else {
      console.error('[locationApi] ❌ Failed to send location update:', response.status, responseData);
      return false;
    }
  } catch (error) {
    console.error('[locationApi] ❌ Error sending location update:', error);
    return false;
  }
}

