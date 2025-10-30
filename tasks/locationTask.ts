import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'background-location-task';
const LOCATION_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
const LAST_UPDATE_KEY = '@last_location_update_timestamp';

interface LocationUpdateData {
  locations: Location.LocationObject[];
}

// Background task definition
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    // Handle different error codes from CoreLocation (iOS) / LocationManager (Android)
    const errorCode = error?.code;
    const errorMessage = error?.message || '';
    
    // Expected errors (don't log as errors):
    // Code 0: Location unknown (temporary GPS issue) - normal, can retry
    // Code 1: Permission denied - expected when permissions not granted
    // Code 2: Network error - can happen
    // Code 3: Heading failure - not relevant for location
    // Code 4: Region monitoring denied - not relevant
    // Code 5: Region monitoring failure - not relevant
    
    if (errorCode === 1) {
      // Permission denied - this is expected when permissions aren't granted
      // Stop trying to get location updates silently
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (stopError) {
        // Ignore errors when stopping
      }
      return; // Exit silently - permissions will be requested by the app UI
    }
    
    // Only log unexpected errors (code 0 is temporary GPS issue, code 1 is permissions)
    if (errorCode !== 0 && errorCode !== 1) {
      console.warn(`⚠️ [LocationTask] Unexpected error (code ${errorCode}):`, errorMessage);
    }
    // For code 0 (location unknown), don't log - it's a temporary GPS issue
    
    return;
  }

  if (data) {
    const { locations } = data as LocationUpdateData;
    if (locations && locations.length > 0) {
      const location = locations[locations.length - 1];
      const { latitude, longitude } = location.coords;

      try {
        // Reverse geocode to get ZIP code
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        let postalCode = '';
        
        if (reverseGeocode && reverseGeocode.length > 0) {
          postalCode = reverseGeocode[0].postalCode || '';
        }

        // Check if automatic location sharing is still enabled
        const settings = await AsyncStorage.getItem('@odyssea_app_settings');
        if (settings) {
          const parsedSettings = JSON.parse(settings);
          if (parsedSettings.automaticLocationSharing) {
            // Check last update time to enforce interval
            // PLATFORM BEHAVIOR:
            // - iOS: May ignore large timeInterval values (> 5 minutes) for battery optimization
            // - Android 8.0+: Limits background location updates to a few times per hour
            // - Both platforms may send updates more frequently than requested
            // SOLUTION: Manual filtering in JavaScript ensures consistent 10-minute interval on both platforms
            const lastUpdateStr = await AsyncStorage.getItem(LAST_UPDATE_KEY);
            const now = Date.now();
            
            if (lastUpdateStr) {
              const lastUpdate = parseInt(lastUpdateStr, 10);
              const timeSinceLastUpdate = now - lastUpdate;
              
              // Only process if enough time has passed (within 30 seconds of target interval)
              // This ensures consistent behavior on both iOS and Android
              const minInterval = LOCATION_UPDATE_INTERVAL - 30000; // 30 seconds before target
              if (timeSinceLastUpdate < minInterval) {
                const minutesPassed = Math.floor(timeSinceLastUpdate / (60 * 1000));
                const minutesNeeded = Math.floor(LOCATION_UPDATE_INTERVAL / (60 * 1000));
                console.log(`⏭️ [LocationTask] Skipping update - only ${minutesPassed} minutes passed, need ${minutesNeeded} minutes`);
                return; // Skip this update
              }
            }
            
            // Save this update
            const timestamp = Date.now();
            const updateData = {
              latitude,
              longitude,
              zipCode: postalCode,
              timestamp,
            };
            
            const timeMinutes = new Date(timestamp).toLocaleTimeString();
            console.log(`📍 [LocationTask] Background update accepted at ${timeMinutes}`);
            
            // Store location data temporarily - will be picked up by app
            await AsyncStorage.setItem('@pending_location_update', JSON.stringify(updateData));
            // Save timestamp for interval filtering
            await AsyncStorage.setItem(LAST_UPDATE_KEY, timestamp.toString());
          } else {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            // Clear last update timestamp when sharing is disabled
            await AsyncStorage.removeItem(LAST_UPDATE_KEY);
          }
        }
      } catch (err) {
        console.error('❌ [LocationTask] Failed to process location:', err);
      }
    }
  }
});

export { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL };

