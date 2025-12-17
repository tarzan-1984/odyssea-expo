import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/utils/secureStorage';

const LOCATION_TASK_NAME = 'background-location-task';
// Interval for desired background location updates.
// Temporarily set to 1 minute for testing.
const LOCATION_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds
const USER_LOCATION_KEY = '@user_location';
const LOCATION_QUEUE_KEY = '@location_update_queue'; // Queue for failed/pending location updates

interface LocationUpdateData {
  locations: Location.LocationObject[];
}

// Background task definition
console.log('📍 [LocationTask] ========== REGISTERING TASK ==========');
console.log('📍 [LocationTask] Task name:', LOCATION_TASK_NAME);
console.log('📍 [LocationTask] TaskManager available:', typeof TaskManager !== 'undefined');
console.log('📍 [LocationTask] defineTask available:', typeof TaskManager.defineTask !== 'undefined');

try {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  const triggerTime = new Date().toLocaleTimeString();
  console.log(`📍 [LocationTask] ========== TASK TRIGGERED ==========`);
  console.log(`📍 [LocationTask] Time: ${triggerTime}`);
  console.log(`📍 [LocationTask] hasError: ${!!error}`);
  console.log(`📍 [LocationTask] hasData: ${!!data}`);
  console.log(`📍 [LocationTask] App state check - task is running in background/foreground`);
  if (error) {
    console.log(`📍 [LocationTask] Error object:`, error);
  }
  if (data) {
    console.log(`📍 [LocationTask] Data object keys:`, Object.keys(data || {}));
    if (data.locations) {
      console.log(`📍 [LocationTask] Number of locations: ${data.locations?.length || 0}`);
    }
  }
  console.log(`📍 [LocationTask] ====================================`);
  
  if (error) {
    // Handle different error codes from CoreLocation (iOS) / LocationManager (Android)
    const errorCode = error?.code;
    const errorMessage = error?.message || '';
    
    console.warn(`⚠️ [LocationTask] Error received (code ${errorCode}):`, errorMessage);
    
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
      console.warn(`⚠️ [LocationTask] Permission denied, stopping location updates`);
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
        // Perform reverse geocoding to get zip, city, state from new coordinates
        // Uses XMLHttpRequest (works in headless JS on Android) - same as locationApi.ts
        // IMPORTANT: Add timeout to prevent blocking - if geocoding fails, continue with saved values
        let postalCode = '';
        let city = '';
        let state = '';
        
        // Try reverse geocoding with timeout (3 seconds max) to prevent blocking
        try {
          console.log(`🌍 [LocationTask] Attempting reverse geocoding for coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          
          // Use reverse geocoding with timeout to prevent blocking
          const reverseGeocodePromise = (async () => {
            try {
              const reverseGeocodeModule = require('@/utils/geocoding');
              const reverseGeocodeAsync = reverseGeocodeModule.reverseGeocodeAsync;
              if (!reverseGeocodeAsync) {
                console.warn(`⚠️ [LocationTask] reverseGeocodeAsync function not found in module`);
                return [];
              }
              return await reverseGeocodeAsync({ latitude, longitude });
            } catch (requireError) {
              console.warn(`⚠️ [LocationTask] Failed to require or call geocoding module:`, requireError);
              return [];
            }
          })();
          
          // Race between geocoding and timeout (3 seconds - shorter to avoid blocking)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Geocoding timeout')), 3000);
          });
          
          const reverseGeocode = await Promise.race([reverseGeocodePromise, timeoutPromise]).catch((timeoutError) => {
            console.warn(`⚠️ [LocationTask] Reverse geocoding timed out or failed, using fallback:`, timeoutError);
            return [];
          });
          
          if (reverseGeocode && reverseGeocode.length > 0) {
            const geo = reverseGeocode[0];
            postalCode = geo.postalCode || '';
            city = geo.city || geo.subregion || geo.district || '';
            state = geo.region ? geo.region.split(' ')[0] : '';
            
            console.log(`✅ [LocationTask] Reverse geocoding successful:`, {
              postalCode: postalCode || 'not found',
              city: city || 'not found',
              state: state || 'not found',
            });
          } else {
            console.warn(`⚠️ [LocationTask] Reverse geocoding returned no results, using fallback`);
          }
        } catch (geoError) {
          console.warn(`⚠️ [LocationTask] Reverse geocoding failed (will use fallback):`, geoError);
          // Continue execution - don't let geocoding errors block location updates
        }
        
        console.log(`📍 [LocationTask] After geocoding attempt, proceeding with location update...`);
        
        // IMPORTANT: Don't use fallback from saved values - only use what we got from reverse geocoding
        // If geocoding didn't return values, send empty strings (don't use old saved values)
        if (!postalCode) {
          console.warn(`⚠️ [LocationTask] No postal code from geocoding, will send with empty postal code`);
        }
        if (!city) {
          console.log(`ℹ️ [LocationTask] No city from geocoding, will send with empty city`);
        }
        if (!state) {
          console.log(`ℹ️ [LocationTask] No state from geocoding, will send with empty state`);
        }
        
        // Log final values that will be sent
        console.log(`📋 [LocationTask] Final location data to send:`, {
          postalCode: postalCode || 'empty',
          city: city || 'empty',
          state: state || 'empty',
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
        });

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
            // SOLUTION: Manual filtering in JavaScript ensures consistent 1-minute interval on both platforms
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
            // IMPORTANT: For testing, we'll use a shorter interval to allow more frequent updates
            // In production, this should be LOCATION_UPDATE_INTERVAL - 30000 (30 seconds before target)
            // For testing, we use 30 seconds to allow updates every 30 seconds minimum (more lenient)
            const TESTING_MODE = true; // Set to false for production
            const minInterval = TESTING_MODE ? 30000 : (LOCATION_UPDATE_INTERVAL - 30000); // 30 seconds for testing, 30 seconds for production
            console.log(`⏱️ [LocationTask] Time since last update: ${timeSinceLastUpdate}ms (${Math.floor(timeSinceLastUpdate / 1000)}s)`);
            console.log(`⏱️ [LocationTask] Minimum interval required: ${minInterval}ms (${Math.floor(minInterval / 1000)}s)`);
            console.log(`⏱️ [LocationTask] Testing mode: ${TESTING_MODE}`);
            
            if (timeSinceLastUpdate < minInterval) {
              const remainingMs = minInterval - timeSinceLastUpdate;
              const remainingMinutes = Math.floor(remainingMs / 60000);
              const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
              console.log(`⏸️ [LocationTask] ⚠️ Update SKIPPED - need to wait ${remainingMinutes}m ${remainingSeconds}s more`);
              console.log(`⏸️ [LocationTask] This is normal - system sends updates more frequently than our interval`);
              return; // Skip this update
            }
            
            console.log(`✅ [LocationTask] ✅ Interval check PASSED - enough time has passed since last update`);
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
            console.log(`✅ [LocationTask] ========== PROCEEDING WITH API CALL ==========`);
            console.log(`✅ [LocationTask] Time: ${timeMinutes}`);
            console.log(`✅ [LocationTask] Latitude: ${latitude.toFixed(6)}`);
            console.log(`✅ [LocationTask] Longitude: ${longitude.toFixed(6)}`);
            console.log(`✅ [LocationTask] ============================================`);
            
            // Try to send location update to API directly from background task
            // This ensures updates are sent even when app is closed
            // Works on both iOS and Android
            console.log(`🌐 [LocationTask] Preparing to send location update to API...`);
            try {
              // IMPORTANT: In background/headless JS, secureStorage may not work (requires user interaction on iOS)
              // Use AsyncStorage instead - we cache externalId there when app is active
              console.log(`🔍 [LocationTask] Retrieving user data from AsyncStorage (cached for background use)...`);
              let externalId: string | null = null;
              
              // Try to get externalId from AsyncStorage (cached when app is active)
              try {
                const cachedExternalId = await AsyncStorage.getItem('@user_external_id');
                if (cachedExternalId) {
                  externalId = cachedExternalId;
                  console.log(`✅ [LocationTask] External ID retrieved from cache: ${externalId}`);
                } else {
                  console.warn(`⚠️ [LocationTask] External ID not found in cache, trying secureStorage as fallback...`);
                  // Fallback: try secureStorage (may fail in background on iOS)
                  try {
                    const userJson = await secureStorage.getItemAsync('user');
                    if (userJson) {
                      const user = JSON.parse(userJson);
                      externalId = user?.externalId || null;
                      // Cache it for next time
                      if (externalId) {
                        await AsyncStorage.setItem('@user_external_id', externalId);
                        console.log(`✅ [LocationTask] External ID retrieved from secureStorage and cached: ${externalId}`);
                      }
                    }
                  } catch (secureStorageError) {
                    console.warn(`⚠️ [LocationTask] SecureStorage not available in background (expected on iOS):`, secureStorageError);
                  }
                }
              } catch (cacheError) {
                console.warn(`⚠️ [LocationTask] Failed to read from AsyncStorage:`, cacheError);
              }
              
              // Get status from AsyncStorage
              const savedStatus = await AsyncStorage.getItem('@user_status');
              const statusValue = savedStatus || 'available'; // Default to 'available' if not set
              console.log(`📋 [LocationTask] User status: ${statusValue}`);
              
              console.log(`🔍 [LocationTask] Checking conditions: externalId=${!!externalId}, postalCode=${!!postalCode}`);
                // IMPORTANT: Allow sending even without postalCode if we have externalId
                // The API might accept empty postal code or we can use a default value
                if (externalId) {
                  // Use empty string as default postal code if not available
                  const finalPostalCode = postalCode || '';
                  if (!postalCode) {
                    console.warn(`⚠️ [LocationTask] No postal code available, will send with empty postal code`);
                  }
                  
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
                    postalCode: finalPostalCode,
                    status: statusValue
                  });
                  
                  // Log final values that will be sent in the request
                  console.log(`📤 [LocationTask] ========== FINAL VALUES TO SEND ==========`);
                  console.log(`📤 [LocationTask] ZIP (postalCode): "${finalPostalCode}" ${!postalCode ? '(from fallback/saved)' : '(from reverse geocoding)'}`);
                  console.log(`📤 [LocationTask] City: "${city || 'empty'}" ${!city ? '(from fallback/saved or empty)' : '(from reverse geocoding)'}`);
                  console.log(`📤 [LocationTask] State: "${state || 'empty'}" ${!state ? '(from fallback/saved or empty)' : '(from reverse geocoding)'}`);
                  console.log(`📤 [LocationTask] Latitude: ${latitude.toFixed(6)}`);
                  console.log(`📤 [LocationTask] Longitude: ${longitude.toFixed(6)}`);
                  console.log(`📤 [LocationTask] ==========================================`);
                  
                  // IMPORTANT: In headless JS, fetch/XMLHttpRequest may not work
                  // Use native HTTP client (OkHttp) - it works reliably in headless JS
                  console.log(`📤 [LocationTask] Sending location update using native HTTP client...`);
                  const apiStartTime = Date.now();
                  
                  // Try to send using native HTTP client
                  let success = false;
                  try {
                    success = await sendLocationUpdateToTMS(
                      externalId,
                      latitude,
                      longitude,
                      finalPostalCode,
                      statusValue as any,
                      ''
                    );
                  } catch (fetchError) {
                    console.warn(`⚠️ [LocationTask] Native HTTP request failed, will queue for retry:`, fetchError);
                    success = false;
                  }
                  
                  const apiDuration = Date.now() - apiStartTime;
                  
                  if (success) {
                    console.log(`✅ [LocationTask] Native HTTP request successful (took ${apiDuration}ms)`);
                    
                    // If successful, try to flush any pending queue items
                    try {
                      await flushLocationQueue();
                    } catch (flushError) {
                      console.warn(`⚠️ [LocationTask] Failed to flush queue:`, flushError);
                    }
                  } else {
                    console.warn(`⚠️ [LocationTask] Native HTTP request failed (took ${apiDuration}ms), adding to queue`);
                    // Add to queue for retry later
                    await addToLocationQueue({
                      externalId,
                      latitude,
                      longitude,
                      postalCode: finalPostalCode,
                      status: statusValue,
                      timestamp: new Date().toISOString(),
                    });
                  }

                  // Fire-and-forget update to our own backend (with reverse geocoded data)
                  try {
                    if (sendLocationUpdateToBackendUser) {
                      void sendLocationUpdateToBackendUser({
                        location: undefined, // Skip location string in background
                        city: city || undefined,
                        state: state || undefined,
                        zip: finalPostalCode,
                        latitude,
                        longitude,
                        lastUpdateIso: timestamp,
                      });
                    }
                  } catch (backendError) {
                    console.warn('⚠️ [LocationTask] Failed to send location to backend users endpoint:', backendError);
                  }
                  
                  // Save coordinates and time only after successful API call
                  if (success) {
                    try {
                      const locationData = {
                        latitude,
                        longitude,
                        zipCode: finalPostalCode,
                        city: city || undefined,
                        state: state || undefined,
                        lastUpdate: new Date().toISOString()
                      };
                      console.log(`💾 [LocationTask] Saving location data to AsyncStorage...`, {
                        latitude: latitude.toFixed(6),
                        longitude: longitude.toFixed(6),
                        zipCode: finalPostalCode,
                        city: city || 'not found',
                        state: state || 'not found',
                        lastUpdate: locationData.lastUpdate
                      });
                      // Save to AsyncStorage (unified storage for both foreground and background)
                      await AsyncStorage.setItem(USER_LOCATION_KEY, JSON.stringify(locationData));
                      
                      // Also save zip code separately to @user_zip for easier access
                      if (finalPostalCode) {
                        await AsyncStorage.setItem('@user_zip', finalPostalCode);
                      }
                      
                      console.log(`✅ [LocationTask] Location data saved to AsyncStorage successfully`);
                    } catch (storageError) {
                      console.error(`❌ [LocationTask] Failed to save location data to AsyncStorage:`, storageError);
                    }
                  } else {
                    console.warn(`⚠️ [LocationTask] Skipping AsyncStorage save - API call was not successful`);
                  }
                } else {
                  console.warn(`⚠️ [LocationTask] Missing required data for API call:`, {
                    hasExternalId: !!externalId,
                    hasPostalCode: !!postalCode,
                    externalId: externalId || 'not found',
                    postalCode: postalCode || 'not found'
                  });
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
  
  console.log('📍 [LocationTask] ✅ TaskManager.defineTask completed without error');
} catch (defineError) {
  console.error('❌ [LocationTask] ❌❌❌ ERROR REGISTERING TASK ❌❌❌');
  console.error('❌ [LocationTask] Error:', defineError);
  if (defineError instanceof Error) {
    console.error('❌ [LocationTask] Error message:', defineError.message);
    console.error('❌ [LocationTask] Error stack:', defineError.stack);
  }
  throw defineError; // Re-throw to prevent silent failure
}

// Log task registration (synchronous check)
console.log('📍 [LocationTask] Task definition completed, name:', LOCATION_TASK_NAME);

/**
 * Add location update to queue for retry
 */
async function addToLocationQueue(update: {
  externalId: string;
  latitude: number;
  longitude: number;
  postalCode: string;
  status: string;
  timestamp: string;
}): Promise<void> {
  try {
    const queueJson = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
    const queue: typeof update[] = queueJson ? JSON.parse(queueJson) : [];
    
    // Add new update to queue (limit queue size to 50 items)
    queue.push(update);
    if (queue.length > 50) {
      queue.shift(); // Remove oldest item
    }
    
    await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(queue));
    console.log(`📦 [LocationTask] Added to queue (${queue.length} items)`);
  } catch (error) {
    console.error(`❌ [LocationTask] Failed to add to queue:`, error);
  }
}

/**
 * Flush location queue - try to send all pending updates
 */
export async function flushLocationQueue(): Promise<void> {
  try {
    const queueJson = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
    if (!queueJson) {
      return; // No queue
    }
    
    const queue: Array<{
      externalId: string;
      latitude: number;
      longitude: number;
      postalCode: string;
      status: string;
      timestamp: string;
    }> = JSON.parse(queueJson);
    
    if (queue.length === 0) {
      return; // Empty queue
    }
    
    console.log(`🔄 [LocationTask] Flushing queue (${queue.length} items)...`);
    
    // Import location API
    const locationApiModule = require('@/utils/locationApi');
    const sendLocationUpdateToTMS = locationApiModule.sendLocationUpdateToTMS;
    
    const successful: number[] = [];
    const failed: number[] = [];
    
    // Try to send each queued update
    for (let i = 0; i < queue.length; i++) {
      const update = queue[i];
      try {
        const success = await sendLocationUpdateToTMS(
          update.externalId,
          update.latitude,
          update.longitude,
          update.postalCode,
          update.status as any,
          ''
        );
        
        if (success) {
          successful.push(i);
          console.log(`✅ [LocationTask] Queued update ${i + 1}/${queue.length} sent successfully`);
        } else {
          failed.push(i);
          console.warn(`⚠️ [LocationTask] Queued update ${i + 1}/${queue.length} failed`);
        }
      } catch (error) {
        failed.push(i);
        console.warn(`⚠️ [LocationTask] Queued update ${i + 1}/${queue.length} error:`, error);
      }
    }
    
    // Remove successful items from queue
    if (successful.length > 0) {
      const remainingQueue = queue.filter((_, index) => !successful.includes(index));
      if (remainingQueue.length > 0) {
        await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(remainingQueue));
        console.log(`📦 [LocationTask] Queue updated: ${remainingQueue.length} items remaining`);
      } else {
        await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
        console.log(`✅ [LocationTask] Queue cleared (all items sent)`);
      }
    }
    
    console.log(`📊 [LocationTask] Queue flush complete: ${successful.length} sent, ${failed.length} failed`);
  } catch (error) {
    console.error(`❌ [LocationTask] Failed to flush queue:`, error);
  }
}

export { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL };
