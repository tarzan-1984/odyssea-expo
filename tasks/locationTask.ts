import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/utils/secureStorage';

const LOCATION_TASK_NAME = 'background-location-task';
// Interval for desired background location updates.
// Temporarily set to 1 minute for testing.
const LOCATION_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds
const USER_LOCATION_KEY = '@user_location';

interface LocationUpdateData {
  locations: Location.LocationObject[];
}

// Background task definition
console.log('📍 [LocationTask] Task definition registered:', LOCATION_TASK_NAME);

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
      // Local device time string without timezone suffix (exactly what user sees)
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
      const timestamp = local.toISOString().replace(/Z$/, '');
      
      console.log(`📍 [LocationTask] New location received at ${new Date().toLocaleTimeString()}:`, {
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
        accuracy: location.coords.accuracy,
        timestamp
      });

      try {
        // Reverse geocode to get ZIP code
        console.log(`🔄 [LocationTask] Starting reverse geocoding...`);
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        let postalCode = '';
        
        if (reverseGeocode && reverseGeocode.length > 0) {
          postalCode = reverseGeocode[0].postalCode || '';
          console.log(`✅ [LocationTask] Reverse geocoding completed. ZIP code: ${postalCode || 'not found'}`);
        } else {
          console.warn(`⚠️ [LocationTask] Reverse geocoding returned no results`);
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
            console.log(`⏱️ [LocationTask] Checking update interval...`);
            const existingLocationJson = await AsyncStorage.getItem(USER_LOCATION_KEY);
            const now = Date.now();
            
            if (existingLocationJson) {
              try {
                const existingLocation = JSON.parse(existingLocationJson);
                if (existingLocation.lastUpdate) {
                  const lastUpdate = new Date(existingLocation.lastUpdate).getTime();
                  const timeSinceLastUpdate = now - lastUpdate;
                  const minutesSinceUpdate = Math.floor(timeSinceLastUpdate / 60000);
                  const secondsSinceUpdate = Math.floor((timeSinceLastUpdate % 60000) / 1000);
                  
                  console.log(`⏱️ [LocationTask] Last update was ${minutesSinceUpdate}m ${secondsSinceUpdate}s ago`);
                  
                  // Only process if enough time has passed (within 30 seconds of target interval)
                  // This ensures consistent behavior on both iOS and Android
                  const minInterval = LOCATION_UPDATE_INTERVAL - 30000; // 30 seconds before target
                  if (timeSinceLastUpdate < minInterval) {
                    const remainingMinutes = Math.floor((minInterval - timeSinceLastUpdate) / 60000);
                    const remainingSeconds = Math.floor(((minInterval - timeSinceLastUpdate) % 60000) / 1000);
                    console.log(`⏸️ [LocationTask] Update skipped - need to wait ${remainingMinutes}m ${remainingSeconds}s more`);
                    return; // Skip this update
                  }
                } else {
                  console.log(`ℹ️ [LocationTask] No previous update timestamp found, proceeding with update`);
                }
              } catch (parseError) {
                console.warn(`⚠️ [LocationTask] Failed to parse existing location data:`, parseError);
                // If parsing fails, continue with update
              }
            } else {
              console.log(`ℹ️ [LocationTask] No existing location data found, proceeding with first update`);
            }
            
            const timeMinutes = new Date().toLocaleTimeString();
            console.log(`✅ [LocationTask] Background update accepted at ${timeMinutes} - proceeding with API call`);
            
            // Try to send location update to API directly from background task
            // This ensures updates are sent even when app is closed
            // Works on both iOS and Android
            console.log(`🌐 [LocationTask] Preparing to send location update to API...`);
            try {
              // Get user data from secure storage (works on both iOS and Android)
              console.log(`🔍 [LocationTask] Retrieving user data from secure storage...`);
              const userJson = await secureStorage.getItemAsync('user');
              if (userJson) {
                const user = JSON.parse(userJson);
                const externalId = user?.externalId;
                console.log(`✅ [LocationTask] User data retrieved. External ID: ${externalId || 'not found'}`);
                
                // Get status from AsyncStorage
                const savedStatus = await AsyncStorage.getItem('@user_status');
                const statusValue = savedStatus || 'available'; // Default to 'available' if not set
                console.log(`📋 [LocationTask] User status: ${statusValue}`);
                
                if (externalId && postalCode) {
                  // Dynamically import location API function to avoid issues in background task
                  // This works on both iOS and Android
                  let sendLocationUpdateToTMS;
                  let sendLocationUpdateToBackendUser;
                  try {
                    console.log(`📦 [LocationTask] Importing location API module...`);
                    // Use require for background task compatibility (works on both platforms)
                    const locationApiModule = require('@/utils/locationApi');
                    sendLocationUpdateToTMS = locationApiModule.sendLocationUpdateToTMS;
                    sendLocationUpdateToBackendUser = locationApiModule.sendLocationUpdateToBackendUser;
                    console.log(`✅ [LocationTask] Location API module imported successfully`);
                  } catch (importError) {
                    console.error('❌ [LocationTask] Failed to import locationApi:', importError);
                    throw importError;
                  }
                  
                  console.log(`📤 [LocationTask] Sending location update to TMS API...`, {
                    externalId,
                    latitude: latitude.toFixed(6),
                    longitude: longitude.toFixed(6),
                    postalCode,
                    status: statusValue
                  });
                  
                  const apiStartTime = Date.now();
                  const success = await sendLocationUpdateToTMS(
                    externalId,
                    latitude,
                    longitude,
                    postalCode,
                    statusValue as any,
                    '' // Empty string - function will use current date/time
                  );
                  const apiDuration = Date.now() - apiStartTime;
                  
                  if (success) {
                    console.log(`✅ [LocationTask] API call successful (took ${apiDuration}ms)`);

                    // Fire-and-forget update to our own backend with extended location info
                    try {
                      const geo = (reverseGeocode && reverseGeocode.length > 0) ? reverseGeocode[0] : null;
                      const city =
                        geo?.city || geo?.subregion || geo?.district || undefined;
                      const state = geo?.region ? geo.region.split(' ')[0] : undefined;
                      const locationString = geo
                        ? `${city || ''} ${state || ''} ${postalCode || ''}`.trim()
                        : undefined;

                    if (sendLocationUpdateToBackendUser) {
                      void sendLocationUpdateToBackendUser({
                        location: locationString,
                        city,
                        state,
                        zip: postalCode,
                        latitude,
                        longitude,
                        lastUpdateIso: timestamp,
                      });
                    }
                    } catch (backendError) {
                      console.warn('⚠️ [LocationTask] Failed to send location to backend users endpoint:', backendError);
                    }
                  } else {
                    console.warn(`⚠️ [LocationTask] API call returned false (took ${apiDuration}ms)`);
                  }
                  
                  // Save coordinates and time only after successful API call
                  if (success) {
                    try {
                      const locationData = {
                        latitude,
                        longitude,
                        zipCode: postalCode,
                        lastUpdate: new Date().toISOString()
                      };
                      console.log(`💾 [LocationTask] Saving location data to AsyncStorage...`, {
                        latitude: latitude.toFixed(6),
                        longitude: longitude.toFixed(6),
                        zipCode: postalCode,
                        lastUpdate: locationData.lastUpdate
                      });
                      // Save to AsyncStorage (unified storage for both foreground and background)
                      await AsyncStorage.setItem(USER_LOCATION_KEY, JSON.stringify(locationData));
                      console.log(`✅ [LocationTask] Location data saved to AsyncStorage successfully`);
                    } catch (storageError) {
                      console.error(`❌ [LocationTask] Failed to save location data to AsyncStorage:`, storageError);
                    }
                  } else {
                    console.warn(`⚠️ [LocationTask] Skipping AsyncStorage save - API call was not successful`);
                  }
                } else {
                  if (!externalId) {
                    console.warn(`⚠️ [LocationTask] Missing externalId, skipping API call`);
                  }
                  if (!postalCode) {
                    console.warn(`⚠️ [LocationTask] Missing postalCode, skipping API call`);
                  }
                }
              } else {
                console.warn(`⚠️ [LocationTask] User data not found in secure storage`);
              }
            } catch (apiError) {
              // Handle different types of errors
              if (apiError instanceof Error) {
                console.error('❌ [LocationTask] Error sending location update from background task:', apiError.message);
                // Log stack trace only in development
                if (__DEV__) {
                  console.error('❌ [LocationTask] Stack trace:', apiError.stack);
                }
              } else {
                console.error('❌ [LocationTask] Unknown error sending location update:', apiError);
              }
              // Don't save coordinates if API call failed - wait for next successful update
            }
          } else {
            console.log(`⏸️ [LocationTask] Automatic location sharing is disabled, stopping background tracking...`);
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log(`✅ [LocationTask] Background tracking stopped`);
          }
        } else {
          console.warn(`⚠️ [LocationTask] App settings not found in AsyncStorage`);
        }
      } catch (err) {
        console.error('❌ [LocationTask] Failed to process location:', err);
      }
    } else {
      console.warn(`⚠️ [LocationTask] No locations in data payload`);
    }
  }
});

export { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL };

