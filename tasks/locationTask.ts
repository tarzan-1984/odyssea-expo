import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/utils/secureStorage';
import { fileLogger } from '@/utils/fileLogger';
import { Platform, AppState } from 'react-native';
import {
  LAST_SUCCESSFUL_REVERSE_GEOCODE_UNIX_KEY,
  getReverseGeocodeIntervalSecondsForDriverStatus,
  saveLastSuccessfulReverseGeocodeTimestamp,
} from '@/constants/reverseGeocodeThrottle';

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
console.log('📍 [LocationTask] Platform:', Platform.OS);
console.log('📍 [LocationTask] App State:', AppState.currentState);

// Check if task is already registered (should be false on first import)
TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).then((isRegistered) => {
  console.log('📍 [LocationTask] Task already registered before defineTask?', isRegistered);
}).catch((err) => {
  console.warn('📍 [LocationTask] Error checking registration before defineTask:', err);
});

try {
  console.log('📍 [LocationTask] Calling TaskManager.defineTask...');
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
      // CRITICAL: Check if automatic location sharing is enabled BEFORE processing location
      // This prevents errors when task is stopped while async operations are running
      const settings = await AsyncStorage.getItem('@odyssea_app_settings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        if (!parsedSettings.automaticLocationSharing) {
          console.log(`⏸️ [LocationTask] Automatic location sharing is disabled, stopping background tracking...`);
          try {
            // Check if task is still running before trying to stop
            const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
            if (isRunning) {
              await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
              console.log(`✅ [LocationTask] Background tracking stopped`);
            } else {
              console.log(`ℹ️ [LocationTask] Background tracking already stopped`);
            }
          } catch (stopError) {
            // Ignore errors when stopping - task may already be stopped
            console.log(`ℹ️ [LocationTask] Task may already be stopped, ignoring stop error`);
          }
          return; // Exit early - don't process location
        }
      } else {
        // If settings not found, assume disabled and stop tracking
        console.warn(`⚠️ [LocationTask] App settings not found in AsyncStorage, stopping tracking for safety`);
        try {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
          if (isRunning) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log(`✅ [LocationTask] Background tracking stopped (settings not found)`);
          }
        } catch (stopError) {
          // Ignore errors
        }
        return; // Exit early
      }

      const location = locations[locations.length - 1];
      const { latitude, longitude } = location.coords;
      // Local device time string without timezone suffix (exactly what user sees)
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
      const timestamp = local.toISOString().replace(/Z$/, '');
      
      console.log(`📍 [LocationTask] Processing location update...`);
      
      try {
        // Nominatim in background only for loaded_enroute & available (throttled).
        // Coordinates still update every tick; other statuses use cached ZIP/city/state.
        let postalCode = '';
        let city = '';
        let state = '';

        const savedStatusForGeocode = await AsyncStorage.getItem('@user_status');
        const intervalSec =
          getReverseGeocodeIntervalSecondsForDriverStatus(savedStatusForGeocode);
        const nowUnix = Math.floor(Date.now() / 1000);
        let shouldRunReverseGeocode = false;

        const statusLabel =
          savedStatusForGeocode?.trim() || '(missing in storage — edge case)';

        if (intervalSec === null) {
          console.log(
            `[LocationTask] Nominatim skipped (status ${statusLabel}) — background reverse geocode only for loaded_enroute & available; using cached ZIP/city/state`
          );
        } else {
          const lastStr = await AsyncStorage.getItem(
            LAST_SUCCESSFUL_REVERSE_GEOCODE_UNIX_KEY
          );
          const lastUnix = lastStr ? parseInt(lastStr, 10) : NaN;
          if (!Number.isFinite(lastUnix)) {
            shouldRunReverseGeocode = true;
            console.log(
              `[LocationTask] Nominatim: no prior success timestamp — running reverse geocode`
            );
          } else if (nowUnix - lastUnix >= intervalSec) {
            shouldRunReverseGeocode = true;
            console.log(
              `[LocationTask] Nominatim: interval elapsed (${nowUnix - lastUnix}s >= ${intervalSec}s for ${statusLabel})`
            );
          } else {
            console.log(
              `[LocationTask] Nominatim throttled (${nowUnix - lastUnix}s < ${intervalSec}s for ${statusLabel}) — using cache`
            );
          }
        }

        const loadZipCityStateFromCache = async () => {
          const z = await AsyncStorage.getItem('@user_zip');
          if (z) postalCode = z;
          try {
            const locJson = await AsyncStorage.getItem(USER_LOCATION_KEY);
            if (locJson) {
              const loc = JSON.parse(locJson) as {
                zipCode?: string;
                city?: string;
                state?: string;
              };
              if (loc.zipCode && !postalCode) postalCode = loc.zipCode;
              if (loc.city) city = loc.city;
              if (loc.state) state = loc.state;
            }
          } catch {
            // ignore
          }
        };

        if (!shouldRunReverseGeocode) {
          await loadZipCityStateFromCache();
        } else {
          try {
            const reverseGeocodePromise = (async () => {
              try {
                const reverseGeocodeModule = require('@/utils/geocoding');
                const reverseGeocodeAsync = reverseGeocodeModule.reverseGeocodeAsync;
                if (!reverseGeocodeAsync) {
                  return [];
                }
                return await reverseGeocodeAsync({ latitude, longitude });
              } catch {
                return [];
              }
            })();

            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Geocoding timeout')), 3000);
            });

            const reverseGeocode = await Promise.race([
              reverseGeocodePromise,
              timeoutPromise,
            ]).catch(() => [] as Awaited<typeof reverseGeocodePromise>);

            if (reverseGeocode && reverseGeocode.length > 0) {
              const geo = reverseGeocode[0];
              postalCode = geo.postalCode || '';
              city = geo.city || geo.subregion || geo.district || '';
              state = geo.region ? geo.region.split(' ')[0] : '';
              await saveLastSuccessfulReverseGeocodeTimestamp();
            } else {
              await loadZipCityStateFromCache();
            }
          } catch (geoError) {
            fileLogger.error('LocationTask', 'GEOCODING_ERROR', {
              error:
                geoError instanceof Error ? geoError.message : String(geoError),
            });
            await loadZipCityStateFromCache();
          }
        }

        // Double-check if automatic location sharing is still enabled (user might have disabled it during geocoding)
        const settingsCheck = await AsyncStorage.getItem('@odyssea_app_settings');
        if (settingsCheck) {
          const parsedSettingsCheck = JSON.parse(settingsCheck);
          if (!parsedSettingsCheck.automaticLocationSharing) {
            console.log(`⏸️ [LocationTask] Automatic location sharing was disabled during processing, stopping...`);
            try {
              const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
              if (isRunning) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
                console.log(`✅ [LocationTask] Background tracking stopped`);
              }
            } catch (stopError) {
              // Ignore errors
            }
            return; // Exit early - don't send location update
          }
        } else {
          // Settings not found - stop tracking
          console.warn(`⚠️ [LocationTask] App settings not found during processing, stopping tracking`);
          try {
            const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
            if (isRunning) {
              await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            }
          } catch (stopError) {
            // Ignore errors
          }
          return; // Exit early
        }

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
                        const duration = Date.now() - externalIdStartTime;
                        console.log(`✅ [LocationTask] External ID retrieved from secureStorage and cached (${duration}ms): ${externalId}`);
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
              
              // Get user role from AsyncStorage (cached when app is active)
              let userRole: string | null = null;
              try {
                const cachedRole = await AsyncStorage.getItem('@user_role');
                if (cachedRole) {
                  userRole = cachedRole;
                  console.log(`📋 [LocationTask] User role retrieved from cache: ${userRole}`);
                } else {
                  // Fallback: try secureStorage (may fail in background on iOS)
                  try {
                    const userJson = await secureStorage.getItemAsync('user');
                    if (userJson) {
                      const user = JSON.parse(userJson);
                      userRole = user?.role || null;
                      if (userRole) {
                        await AsyncStorage.setItem('@user_role', userRole);
                        console.log(`📋 [LocationTask] User role retrieved from secureStorage and cached: ${userRole}`);
                      }
                    }
                  } catch (secureStorageError) {
                    console.warn(`⚠️ [LocationTask] SecureStorage not available for role in background:`, secureStorageError);
                    fileLogger.error('LocationTask', 'USER_ROLE_SECURE_STORAGE_ERROR', {
                      error: secureStorageError instanceof Error ? secureStorageError.message : String(secureStorageError),
                    });
                  }
                }
              } catch (cacheError) {
                console.warn(`⚠️ [LocationTask] Failed to read user role from AsyncStorage:`, cacheError);
                fileLogger.error('LocationTask', 'USER_ROLE_ASYNC_STORAGE_ERROR', {
                  error: cacheError instanceof Error ? cacheError.message : String(cacheError),
                });
              }
              
              // CRITICAL: Only DRIVER role should send to TMS
              // Normalize role: trim whitespace and convert to uppercase for comparison
              const normalizedRole = userRole ? userRole.trim().toUpperCase() : null;
              const isDriver = normalizedRole === 'DRIVER';
              
              console.log(`🔍 [LocationTask] Checking conditions: externalId=${!!externalId}, postalCode=${!!postalCode}, userRole=${userRole || 'not found'}, isDriver=${isDriver}`);
              console.log(`🔍 [LocationTask] Role check: userRole="${userRole}", isDriver=${isDriver}, will send to TMS: ${isDriver}`);
              
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
                    fileLogger.error('LocationTask', 'IMPORT_LOCATION_API_ERROR', {
                      error: importError instanceof Error ? importError.message : String(importError),
                      stack: importError instanceof Error ? importError.stack : undefined,
                    });
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
                  
                  // Send location update to TMS API (only for DRIVER role)
                  let tmsSuccess = false;
                  let tmsError: any = null;
                  const tmsApiStartTime = Date.now();
                  
                  if (isDriver) {
                    // Double-check role before sending (safety check)
                    if (normalizedRole !== 'DRIVER') {
                      console.error(`❌ [LocationTask] CRITICAL: isDriver is true but normalizedRole is not DRIVER!`);
                      console.error(`❌ [LocationTask] normalizedRole: "${normalizedRole}", userRole: "${userRole}"`);
                      fileLogger.error('LocationTask', 'ROLE_MISMATCH', {
                        userRole,
                        normalizedRole,
                        isDriver,
                      });
                      // Don't send to TMS if role doesn't match
                      console.log(`ℹ️ [LocationTask] Skipping TMS API call due to role mismatch`);
                    } else {
                      // IMPORTANT: In headless JS, fetch/XMLHttpRequest may not work
                      // Use native HTTP client (OkHttp) - it works reliably in headless JS
                      try {
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
                      fileLogger.error('LocationTask', 'TMS_API_REQUEST_EXCEPTION', {
                        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
                        stack: fetchError instanceof Error ? fetchError.stack : undefined,
                        externalId,
                        latitude: latitude.toFixed(6),
                        longitude: longitude.toFixed(6),
                        userRole,
                        isDriver,
                      });
                      tmsSuccess = false;
                    }
                    
                    if (tmsSuccess) {
                      console.log(`✅ [LocationTask] TMS API: Location update sent successfully`);
                      
                      // If successful, try to flush any pending queue items
                      try {
                        await flushLocationQueue();
                      } catch (flushError) {
                        fileLogger.error('LocationTask', 'QUEUE_FLUSH_ERROR', {
                          error: flushError instanceof Error ? flushError.message : String(flushError),
                        });
                      }
                    } else {
                      fileLogger.error('LocationTask', 'TMS_API_REQUEST_FAILED', {
                        externalId,
                        error: tmsError ? (tmsError instanceof Error ? tmsError.message : String(tmsError)) : 'Unknown error',
                        latitude: latitude.toFixed(6),
                        longitude: longitude.toFixed(6),
                        postalCode: finalPostalCode || 'empty',
                        userRole,
                        isDriver,
                      });
                      console.error(`❌ [LocationTask] TMS API: Failed to send location update`);
                      
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
                      } catch (queueError) {
                        fileLogger.error('LocationTask', 'TMS_QUEUE_ADD_ERROR', {
                          error: queueError instanceof Error ? queueError.message : String(queueError),
                        });
                      }
                    }
                    } // End of else block for normalizedRole === 'DRIVER' check
                  }

              // Send location update to our backend (for ALL users, independent of TMS API and user role)
              // This request is completely independent - TMS success/failure and user role do not affect it
              let backendUpdateSuccess = false;
              
              if (externalId) {
                try {
                  if (sendLocationUpdateToBackendUser) {
                    const locationStr = city && state ? `${city}, ${state}${finalPostalCode ? ` ${finalPostalCode}` : ''}`.trim() : undefined;
                    backendUpdateSuccess = await sendLocationUpdateToBackendUser({
                      location: locationStr,
                      city: city || undefined,
                      state: state || undefined,
                      zip: finalPostalCode,
                      latitude,
                      longitude,
                      lastUpdateIso: timestamp,
                    });
                    
                    if (backendUpdateSuccess) {
                      console.log(`✅ [LocationTask] Backend: Location update sent successfully`);
                    } else {
                      fileLogger.error('LocationTask', 'BACKEND_API_REQUEST_FAILED', {
                        externalId,
                        latitude: latitude.toFixed(6),
                        longitude: longitude.toFixed(6),
                      });
                      console.error(`❌ [LocationTask] Backend: Failed to send location update`);
                    }
                  } else {
                    fileLogger.error('LocationTask', 'BACKEND_API_FUNCTION_NOT_AVAILABLE', {
                      externalId,
                    });
                  }
                } catch (backendError) {
                  fileLogger.error('LocationTask', 'BACKEND_API_REQUEST_EXCEPTION', {
                    error: backendError instanceof Error ? backendError.message : String(backendError),
                    stack: backendError instanceof Error ? backendError.stack : undefined,
                    externalId,
                    latitude: latitude.toFixed(6),
                    longitude: longitude.toFixed(6),
                    userRole: userRole || 'not found',
                  });
                  console.error(`❌ [LocationTask] Backend: Error sending location update`);
                  backendUpdateSuccess = false;
                }
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
                      // Save to AsyncStorage (unified storage for both foreground and background)
                      await AsyncStorage.setItem(USER_LOCATION_KEY, JSON.stringify(locationData));
                      
                      // Also save zip code separately to @user_zip for easier access
                      if (finalPostalCode) {
                        await AsyncStorage.setItem('@user_zip', finalPostalCode);
                      }
                    } catch (storageError) {
                      // Silent fail
                    }
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
              } catch (err) {
                const totalDuration = Date.now() - taskStartTime;
                
                // Check if error is due to task being stopped (expected when user disables location sharing)
                const errorMessage = err instanceof Error ? err.message : String(err);
                const isTaskNotFoundError = errorMessage.includes("not found") || errorMessage.includes("Task 'background-location-task'");
                
                if (isTaskNotFoundError) {
                  // This is expected when task is stopped - don't log as error
                  console.log(`ℹ️ [LocationTask] Task was stopped during processing (expected when location sharing is disabled)`);
                  return; // Exit silently
                }
                
                console.error('❌ [LocationTask] Failed to process location:', err);
                fileLogger.error('LocationTask', 'PROCESS_LOCATION_ERROR', {
                  error: errorMessage,
                  stack: err instanceof Error ? err.stack : undefined,
                  totalDuration,
                  platform: Platform.OS,
                });
              }
            } else {
              console.warn(`⚠️ [LocationTask] No locations in data payload`);
            }
          }
          
          const totalDuration = Date.now() - taskStartTime;
  });
  
  console.log('📍 [LocationTask] ✅ TaskManager.defineTask completed without error');
  
  // Verify registration immediately after defineTask
  TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).then((isRegistered) => {
    if (isRegistered) {
      console.log('📍 [LocationTask] ✅✅✅ Task successfully registered and verified ✅✅✅');
    } else {
      console.warn('📍 [LocationTask] ⚠️ Task defined but not yet registered (may need time to propagate)');
    }
  }).catch((err) => {
    console.warn('📍 [LocationTask] ⚠️ Error verifying registration after defineTask:', err);
  });
} catch (defineError) {
  console.error('❌ [LocationTask] ❌❌❌ ERROR REGISTERING TASK ❌❌❌');
  console.error('❌ [LocationTask] Error:', defineError);
  fileLogger.error('LocationTask', 'TASK_REGISTRATION_FAILED', {
    error: defineError instanceof Error ? defineError.message : String(defineError),
    stack: defineError instanceof Error ? defineError.stack : undefined,
    errorType: typeof defineError,
    platform: Platform.OS,
  });
  if (defineError instanceof Error) {
    console.error('❌ [LocationTask] Error message:', defineError.message);
    console.error('❌ [LocationTask] Error stack:', defineError.stack);
  }
  // Don't throw - allow app to continue even if task registration fails
  // The task may still work on some devices
  console.error('❌ [LocationTask] Task registration failed, but continuing app initialization...');
}

// Log task registration (synchronous check)
console.log('📍 [LocationTask] Task definition completed, name:', LOCATION_TASK_NAME);
console.log('📍 [LocationTask] ========== END OF TASK REGISTRATION ==========');

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
    fileLogger.error('LocationTask', 'FAILED_TO_ADD_TO_QUEUE', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Flush location queue - try to send all pending updates to TMS
 * IMPORTANT: Only sends to TMS if user role is DRIVER
 */
export async function flushLocationQueue(): Promise<void> {
  try {
    
    // Check user role first - only DRIVER role should send to TMS
    let userRole: string | null = null;
    try {
      const cachedRole = await AsyncStorage.getItem('@user_role');
      if (cachedRole) {
        userRole = cachedRole;
        console.log(`📋 [LocationTask] Queue flush: User role retrieved from cache: ${userRole}`);
      } else {
        // Fallback: try secureStorage
        try {
          const { secureStorage } = require('@/utils/secureStorage');
          const userJson = await secureStorage.getItemAsync('user');
          if (userJson) {
            const user = JSON.parse(userJson);
            userRole = user?.role || null;
            if (userRole) {
              await AsyncStorage.setItem('@user_role', userRole);
              console.log(`📋 [LocationTask] Queue flush: User role retrieved from secureStorage and cached: ${userRole}`);
            }
          }
        } catch (secureStorageError) {
          console.warn(`⚠️ [LocationTask] Queue flush: SecureStorage not available:`, secureStorageError);
        }
      }
    } catch (cacheError) {
      console.warn(`⚠️ [LocationTask] Queue flush: Failed to read user role:`, cacheError);
    }
    
    // Normalize role: trim whitespace and convert to uppercase for comparison
    const normalizedRole = userRole ? userRole.trim().toUpperCase() : null;
    const isDriver = normalizedRole === 'DRIVER';
    console.log(`🔍 [LocationTask] Queue flush: userRole="${userRole || 'not found'}" (normalized: "${normalizedRole || 'null'}"), isDriver=${isDriver}`);
    
    // If user is not DRIVER, clear the queue (don't send to TMS)
    if (!isDriver) {
      console.log(`ℹ️ [LocationTask] Queue flush: User is not DRIVER (role: ${userRole || 'not found'}), clearing TMS queue`);
      await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
      return;
    }
    
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
    
    console.log(`🔄 [LocationTask] Flushing TMS queue (${queue.length} items) for DRIVER role...`);
    
    // Import location API
    const locationApiModule = require('@/utils/locationApi');
    const sendLocationUpdateToTMS = locationApiModule.sendLocationUpdateToTMS;
    
    const successful: number[] = [];
    const failed: number[] = [];
    
    // Try to send each queued update to TMS (only for DRIVER role)
    for (let i = 0; i < queue.length; i++) {
      const update = queue[i];
      try {
        console.log(`📤 [LocationTask] TMS Queue: Sending item ${i + 1}/${queue.length} to TMS API (user is DRIVER)...`);
        
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
        console.log(`📦 [LocationTask] TMS Queue: Updated - ${remainingQueue.length} items remaining, ${successful.length} sent successfully`);
      } else {
        await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
        console.log(`✅ [LocationTask] TMS Queue: Cleared - all ${successful.length} items sent successfully`);
      }
    }
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
