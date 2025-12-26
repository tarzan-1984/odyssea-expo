import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/utils/secureStorage';
import { fileLogger } from '@/utils/fileLogger';
import { Platform, AppState } from 'react-native';

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
  const appState = AppState.currentState;
  const taskStartTime = Date.now();
  
  console.log(`📍 [LocationTask] ========== TASK TRIGGERED ==========`);
  console.log(`📍 [LocationTask] Time: ${triggerTime}`);
  console.log(`📍 [LocationTask] App State: ${appState} (active=foreground, background/inactive=background)`);
  console.log(`📍 [LocationTask] hasError: ${!!error}`);
  console.log(`📍 [LocationTask] hasData: ${!!data}`);
  console.log(`📍 [LocationTask] Platform: ${Platform.OS}`);
  
  fileLogger.warn('LocationTask', 'TASK_TRIGGERED', {
    time: triggerTime,
    appState,
    hasError: !!error,
    hasData: !!data,
    platform: Platform.OS,
    timestamp: new Date().toISOString(),
  });
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
    fileLogger.error('LocationTask', 'TASK_ERROR', {
      errorCode,
      errorMessage,
      error: error,
      platform: Platform.OS,
      appState,
      timestamp: new Date().toISOString(),
    });
    
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
      
      fileLogger.warn('LocationTask', 'LOCATION_RECEIVED', {
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
        accuracy: location.coords.accuracy,
        timestamp,
        platform: Platform.OS,
        appState,
      });

      try {
        // Perform reverse geocoding to get zip, city, state from new coordinates
        // Uses XMLHttpRequest (works in headless JS on Android) - same as locationApi.ts
        // IMPORTANT: Add timeout to prevent blocking - if geocoding fails, continue with saved values
        let postalCode = '';
        let city = '';
        let state = '';
        
        // Try reverse geocoding with timeout (3 seconds max) to prevent blocking
        const geocodingStartTime = Date.now();
        try {
          console.log(`🌍 [LocationTask] Attempting reverse geocoding for coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          fileLogger.warn('LocationTask', 'GEOCODING_START', {
            latitude: latitude.toFixed(6),
            longitude: longitude.toFixed(6),
          });
          
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
            
            const geocodingDuration = Date.now() - geocodingStartTime;
            console.log(`✅ [LocationTask] Reverse geocoding successful (${geocodingDuration}ms):`, {
              postalCode: postalCode || 'not found',
              city: city || 'not found',
              state: state || 'not found',
            });
            
            fileLogger.warn('LocationTask', 'GEOCODING_SUCCESS', {
              postalCode: postalCode || 'empty',
              city: city || 'empty',
              state: state || 'empty',
              duration: geocodingDuration,
            });
          } else {
            const geocodingDuration = Date.now() - geocodingStartTime;
            console.warn(`⚠️ [LocationTask] Reverse geocoding returned no results (${geocodingDuration}ms)`);
            fileLogger.warn('LocationTask', 'GEOCODING_NO_RESULTS', {
              duration: geocodingDuration,
            });
          }
        } catch (geoError) {
          const geocodingDuration = Date.now() - geocodingStartTime;
          console.warn(`⚠️ [LocationTask] Reverse geocoding failed (${geocodingDuration}ms):`, geoError);
          fileLogger.error('LocationTask', 'GEOCODING_ERROR', {
            error: geoError instanceof Error ? geoError.message : String(geoError),
            duration: geocodingDuration,
          });
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
            // No time interval check - process all location updates for smooth map display
            // Both iOS and Android will send updates as frequently as the system allows
            console.log(`✅ [LocationTask] Processing location update (no time restrictions)`);
            
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
              const externalIdStartTime = Date.now();
              try {
                const cachedExternalId = await AsyncStorage.getItem('@user_external_id');
                if (cachedExternalId) {
                  externalId = cachedExternalId;
                  const duration = Date.now() - externalIdStartTime;
                  console.log(`✅ [LocationTask] External ID retrieved from cache (${duration}ms): ${externalId}`);
                  fileLogger.warn('LocationTask', 'EXTERNAL_ID_FOUND', {
                    source: 'AsyncStorage',
                    externalId,
                    duration,
                  });
                } else {
                  console.warn(`⚠️ [LocationTask] External ID not found in cache, trying secureStorage as fallback...`);
                  fileLogger.warn('LocationTask', 'EXTERNAL_ID_NOT_IN_CACHE', {
                    source: 'AsyncStorage',
                  });
                  
                  // Fallback: try secureStorage (may fail in background on iOS)
                  try {
                    const userJson = await secureStorage.getItemAsync('user');
                    if (userJson) {
                      const user = JSON.parse(userJson);
                      externalId = user?.externalId || null;
                      // Cache it for next time
                      if (externalId) {
                        await AsyncStorage.setItem('@user_external_id', externalId);
                        const duration = Date.now() - externalIdStartTime;
                        console.log(`✅ [LocationTask] External ID retrieved from secureStorage and cached (${duration}ms): ${externalId}`);
                        fileLogger.warn('LocationTask', 'EXTERNAL_ID_FOUND', {
                          source: 'secureStorage',
                          externalId,
                          duration,
                        });
                      }
                    }
                  } catch (secureStorageError) {
                    const duration = Date.now() - externalIdStartTime;
                    console.warn(`⚠️ [LocationTask] SecureStorage not available in background (${duration}ms):`, secureStorageError);
                    fileLogger.error('LocationTask', 'EXTERNAL_ID_SECURE_STORAGE_ERROR', {
                      error: secureStorageError instanceof Error ? secureStorageError.message : String(secureStorageError),
                      duration,
                    });
                  }
                }
              } catch (cacheError) {
                const duration = Date.now() - externalIdStartTime;
                console.warn(`⚠️ [LocationTask] Failed to read from AsyncStorage (${duration}ms):`, cacheError);
                fileLogger.error('LocationTask', 'EXTERNAL_ID_ASYNC_STORAGE_ERROR', {
                  error: cacheError instanceof Error ? cacheError.message : String(cacheError),
                  duration,
                });
              }
              
              // Get status from AsyncStorage
              const savedStatus = await AsyncStorage.getItem('@user_status');
              const statusValue = savedStatus || 'available'; // Default to 'available' if not set
              console.log(`📋 [LocationTask] User status: ${statusValue}`);
              
              console.log(`🔍 [LocationTask] Checking conditions: externalId=${!!externalId}, postalCode=${!!postalCode}`);
              fileLogger.warn('LocationTask', 'CHECKING_CONDITIONS', {
                hasExternalId: !!externalId,
                hasPostalCode: !!postalCode,
                externalId: externalId || 'missing',
                postalCode: postalCode || 'empty',
              });
              
                // IMPORTANT: Allow sending even without postalCode if we have externalId
                // The API might accept empty postal code or we can use a default value
                if (externalId) {
                  fileLogger.warn('LocationTask', 'CONDITIONS_MET', {
                    externalId,
                    postalCode: postalCode || 'empty',
                    city: city || 'empty',
                    state: state || 'empty',
                  });
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
                  console.log(`📤 [LocationTask] Sending location update to TMS API using native HTTP client...`);
                  const tmsApiStartTime = Date.now();
                  
                  // Try to send to TMS using native HTTP client
                  let tmsSuccess = false;
                  let tmsError: any = null;
                  try {
                    fileLogger.warn('LocationTask', 'TMS_API_REQUEST_START', {
                      externalId,
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                      postalCode: finalPostalCode,
                      status: statusValue,
                      timestamp: new Date().toISOString(),
                    });
                    console.log(`📤 [LocationTask] TMS API request started for externalId: ${externalId}`);
                    
                    tmsSuccess = await sendLocationUpdateToTMS(
                      externalId,
                      latitude,
                      longitude,
                      finalPostalCode,
                      statusValue as any,
                      ''
                    );
                  } catch (fetchError) {
                    tmsError = fetchError;
                    const tmsDuration = Date.now() - tmsApiStartTime;
                    console.warn(`⚠️ [LocationTask] TMS API request exception (took ${tmsDuration}ms):`, fetchError);
                    fileLogger.error('LocationTask', 'TMS_API_REQUEST_EXCEPTION', {
                      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
                      stack: fetchError instanceof Error ? fetchError.stack : undefined,
                      duration: tmsDuration,
                      externalId,
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                    });
                    tmsSuccess = false;
                  }
                  
                  const tmsApiDuration = Date.now() - tmsApiStartTime;
                  
                  if (tmsSuccess) {
                    console.log(`✅ [LocationTask] ✅✅✅ TMS API REQUEST SUCCESSFUL ✅✅✅ (took ${tmsApiDuration}ms)`);
                    console.log(`✅ [LocationTask] TMS API: Location update sent successfully to WordPress TMS`);
                    console.log(`✅ [LocationTask] TMS API: externalId=${externalId}, lat=${latitude.toFixed(6)}, lng=${longitude.toFixed(6)}, zip=${finalPostalCode || 'empty'}`);
                    fileLogger.warn('LocationTask', 'TMS_API_REQUEST_SUCCESS', {
                      duration: tmsApiDuration,
                      externalId,
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                      postalCode: finalPostalCode || 'empty',
                    });
                    
                    // If successful, try to flush any pending queue items
                    try {
                      await flushLocationQueue();
                    } catch (flushError) {
                      console.warn(`⚠️ [LocationTask] Failed to flush queue:`, flushError);
                      fileLogger.error('LocationTask', 'QUEUE_FLUSH_ERROR', {
                        error: flushError instanceof Error ? flushError.message : String(flushError),
                      });
                    }
                  } else {
                    console.warn(`⚠️ [LocationTask] TMS API request failed (took ${tmsApiDuration}ms), adding to queue`);
                    console.warn(`⚠️ [LocationTask] TMS API: Failed to send location update to WordPress TMS`);
                    fileLogger.error('LocationTask', 'TMS_API_REQUEST_FAILED', {
                      duration: tmsApiDuration,
                      externalId,
                      error: tmsError ? (tmsError instanceof Error ? tmsError.message : String(tmsError)) : 'Unknown error',
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                      postalCode: finalPostalCode || 'empty',
                    });
                    
                    // Add to queue for retry later
                    try {
                      await addToLocationQueue({
                        externalId,
                        latitude,
                        longitude,
                        postalCode: finalPostalCode,
                        status: statusValue,
                        timestamp: new Date().toISOString(),
                      });
                      fileLogger.warn('LocationTask', 'TMS_ADDED_TO_QUEUE', {
                        externalId,
                      });
                      console.log(`📦 [LocationTask] TMS API: Added failed request to queue for retry`);
                    } catch (queueError) {
                      fileLogger.error('LocationTask', 'TMS_QUEUE_ADD_ERROR', {
                        error: queueError instanceof Error ? queueError.message : String(queueError),
                      });
                      console.error(`❌ [LocationTask] TMS API: Failed to add to queue:`, queueError);
                    }
                  }

              // Send location update to our backend (independent of TMS API)
              // This request is completely independent - TMS success/failure does not affect it
              let backendUpdateSuccess = false;
              const backendStartTime = Date.now();
              try {
                fileLogger.warn('LocationTask', 'BACKEND_API_REQUEST_START', {
                  externalId,
                  latitude: latitude.toFixed(6),
                  longitude: longitude.toFixed(6),
                  zip: finalPostalCode,
                  city: city || 'empty',
                  state: state || 'empty',
                  tmsSuccess: tmsSuccess, // Log TMS status for reference, but don't depend on it
                });
                console.log(`📤 [LocationTask] Sending location update to our backend API (independent of TMS)...`);
                console.log(`📤 [LocationTask] Backend API: TMS status=${tmsSuccess ? 'SUCCESS' : 'FAILED'} (does not affect this request)`);
                
                if (sendLocationUpdateToBackendUser) {
                  backendUpdateSuccess = await sendLocationUpdateToBackendUser({
                    location: undefined, // Skip location string in background
                    city: city || undefined,
                    state: state || undefined,
                    zip: finalPostalCode,
                    latitude,
                    longitude,
                    lastUpdateIso: timestamp,
                  });
                  
                  const backendDuration = Date.now() - backendStartTime;
                  
                  if (backendUpdateSuccess) {
                    fileLogger.warn('LocationTask', 'BACKEND_API_REQUEST_SUCCESS', {
                      duration: backendDuration,
                      externalId,
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                    });
                    console.log(`✅ [LocationTask] ✅✅✅ BACKEND API REQUEST SUCCESSFUL ✅✅✅ (took ${backendDuration}ms)`);
                    console.log(`✅ [LocationTask] Backend API: Location update sent successfully to our database`);
                    console.log(`✅ [LocationTask] Backend API: externalId=${externalId}, lat=${latitude.toFixed(6)}, lng=${longitude.toFixed(6)}, zip=${finalPostalCode || 'empty'}`);
                  } else {
                    fileLogger.error('LocationTask', 'BACKEND_API_REQUEST_FAILED', {
                      duration: backendDuration,
                      externalId,
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                    });
                    console.warn(`⚠️ [LocationTask] Backend API request failed (took ${backendDuration}ms)`);
                    console.warn(`⚠️ [LocationTask] Backend API: Failed to send location update to our database`);
                  }
                } else {
                  fileLogger.error('LocationTask', 'BACKEND_API_FUNCTION_NOT_AVAILABLE', {
                    externalId,
                  });
                  console.warn('⚠️ [LocationTask] Backend API: sendLocationUpdateToBackendUser function not available');
                }
              } catch (backendError) {
                const backendDuration = Date.now() - backendStartTime;
                fileLogger.error('LocationTask', 'BACKEND_API_REQUEST_EXCEPTION', {
                  error: backendError instanceof Error ? backendError.message : String(backendError),
                  stack: backendError instanceof Error ? backendError.stack : undefined,
                  duration: backendDuration,
                  externalId,
                  latitude: latitude.toFixed(6),
                  longitude: longitude.toFixed(6),
                });
                console.warn(`⚠️ [LocationTask] Backend API request exception (took ${backendDuration}ms):`, backendError);
                console.warn('⚠️ [LocationTask] Backend API: Exception while sending location update to our database');
                backendUpdateSuccess = false;
              }
                  
                  // Save coordinates and time only after successful backend update
                  if (backendUpdateSuccess) {
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
                    console.warn(`⚠️ [LocationTask] Skipping AsyncStorage save - backend update was not successful`);
                  }
                        } else {
                          const totalDuration = Date.now() - taskStartTime;
                          console.warn(`⚠️ [LocationTask] Missing required data for API call:`, {
                            hasExternalId: !!externalId,
                            hasPostalCode: !!postalCode,
                            externalId: externalId || 'not found',
                            postalCode: postalCode || 'not found'
                          });
                          fileLogger.error('LocationTask', 'MISSING_REQUIRED_DATA', {
                            hasExternalId: !!externalId,
                            hasPostalCode: !!postalCode,
                            externalId: externalId || 'missing',
                            postalCode: postalCode || 'missing',
                            totalDuration,
                          });
                        }
                    } catch (apiError) {
                      const totalDuration = Date.now() - taskStartTime;
                      // Handle different types of errors
                      if (apiError instanceof Error) {
                        console.error('❌ [LocationTask] Error sending location update from background task:', apiError.message);
                        fileLogger.error('LocationTask', 'TASK_EXCEPTION', {
                          error: apiError.message,
                          stack: apiError.stack,
                          totalDuration,
                          platform: Platform.OS,
                        });
                        // Log stack trace only in development
                        if (__DEV__) {
                          console.error('❌ [LocationTask] Stack trace:', apiError.stack);
                        }
                      } else {
                        console.error('❌ [LocationTask] Unknown error sending location update:', apiError);
                        fileLogger.error('LocationTask', 'TASK_EXCEPTION_UNKNOWN', {
                          error: String(apiError),
                          totalDuration,
                          platform: Platform.OS,
                        });
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
                const totalDuration = Date.now() - taskStartTime;
                console.error('❌ [LocationTask] Failed to process location:', err);
                fileLogger.error('LocationTask', 'PROCESS_LOCATION_ERROR', {
                  error: err instanceof Error ? err.message : String(err),
                  stack: err instanceof Error ? err.stack : undefined,
                  totalDuration,
                  platform: Platform.OS,
                });
              }
            } else {
              console.warn(`⚠️ [LocationTask] No locations in data payload`);
              fileLogger.warn('LocationTask', 'NO_LOCATIONS_IN_PAYLOAD', {
                hasData: !!data,
                dataKeys: data ? Object.keys(data) : [],
              });
            }
          }
          
          const totalDuration = Date.now() - taskStartTime;
          fileLogger.warn('LocationTask', 'TASK_COMPLETED', {
            totalDuration,
            platform: Platform.OS,
            appState,
          });
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
 * Flush location queue - try to send all pending updates to TMS
 */
export async function flushLocationQueue(): Promise<void> {
  try {
    fileLogger.warn('LocationTask', 'QUEUE_FLUSH_START');
    
    const queueJson = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
    if (!queueJson) {
      fileLogger.warn('LocationTask', 'QUEUE_FLUSH_NO_QUEUE');
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
      fileLogger.warn('LocationTask', 'QUEUE_FLUSH_EMPTY');
      return; // Empty queue
    }
    
    console.log(`🔄 [LocationTask] Flushing TMS queue (${queue.length} items)...`);
    fileLogger.warn('LocationTask', 'QUEUE_FLUSH_PROCESSING', {
      queueSize: queue.length,
    });
    
    // Import location API
    const locationApiModule = require('@/utils/locationApi');
    const sendLocationUpdateToTMS = locationApiModule.sendLocationUpdateToTMS;
    
    const successful: number[] = [];
    const failed: number[] = [];
    
    // Try to send each queued update to TMS
    for (let i = 0; i < queue.length; i++) {
      const update = queue[i];
      try {
        fileLogger.warn('LocationTask', 'QUEUE_ITEM_SENDING', {
          index: i + 1,
          total: queue.length,
          externalId: update.externalId,
          latitude: update.latitude.toFixed(6),
          longitude: update.longitude.toFixed(6),
        });
        console.log(`📤 [LocationTask] TMS Queue: Sending item ${i + 1}/${queue.length} to TMS API...`);
        
        const itemStartTime = Date.now();
        const success = await sendLocationUpdateToTMS(
          update.externalId,
          update.latitude,
          update.longitude,
          update.postalCode,
          update.status as any,
          ''
        );
        const itemDuration = Date.now() - itemStartTime;
        
        if (success) {
          successful.push(i);
          fileLogger.warn('LocationTask', 'QUEUE_ITEM_SUCCESS', {
            index: i + 1,
            total: queue.length,
            duration: itemDuration,
            externalId: update.externalId,
          });
          console.log(`✅ [LocationTask] ✅✅✅ TMS Queue: Item ${i + 1}/${queue.length} sent successfully to TMS API ✅✅✅ (took ${itemDuration}ms)`);
          console.log(`✅ [LocationTask] TMS Queue: externalId=${update.externalId}, lat=${update.latitude.toFixed(6)}, lng=${update.longitude.toFixed(6)}`);
        } else {
          failed.push(i);
          fileLogger.error('LocationTask', 'QUEUE_ITEM_FAILED', {
            index: i + 1,
            total: queue.length,
            duration: itemDuration,
            externalId: update.externalId,
          });
          console.warn(`⚠️ [LocationTask] TMS Queue: Item ${i + 1}/${queue.length} failed (took ${itemDuration}ms)`);
        }
      } catch (error) {
        failed.push(i);
        fileLogger.error('LocationTask', 'QUEUE_ITEM_EXCEPTION', {
          index: i + 1,
          total: queue.length,
          externalId: update.externalId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        console.warn(`⚠️ [LocationTask] TMS Queue: Item ${i + 1}/${queue.length} error:`, error);
      }
    }
    
    // Remove successful items from queue
    if (successful.length > 0) {
      const remainingQueue = queue.filter((_, index) => !successful.includes(index));
      if (remainingQueue.length > 0) {
        await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(remainingQueue));
        fileLogger.warn('LocationTask', 'QUEUE_FLUSH_UPDATED', {
          remaining: remainingQueue.length,
          sent: successful.length,
        });
        console.log(`📦 [LocationTask] TMS Queue: Updated - ${remainingQueue.length} items remaining, ${successful.length} sent successfully`);
      } else {
        await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
        fileLogger.warn('LocationTask', 'QUEUE_FLUSH_CLEARED', {
          sent: successful.length,
        });
        console.log(`✅ [LocationTask] TMS Queue: Cleared - all ${successful.length} items sent successfully`);
      }
    }
    
    fileLogger.warn('LocationTask', 'QUEUE_FLUSH_COMPLETE', {
      successful: successful.length,
      failed: failed.length,
      total: queue.length,
    });
    console.log(`📊 [LocationTask] TMS Queue flush complete: ${successful.length} sent successfully, ${failed.length} failed, ${queue.length} total`);
  } catch (error) {
    fileLogger.error('LocationTask', 'QUEUE_FLUSH_EXCEPTION', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error(`❌ [LocationTask] TMS Queue: Failed to flush queue:`, error);
  }
}

export { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL };
