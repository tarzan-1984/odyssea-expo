import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/utils/secureStorage';
import { fileLogger } from '@/utils/fileLogger';
import { Platform, AppState } from 'react-native';
import {
  loadGeocodeAnchor,
  saveGeocodeAnchor,
  shouldRunBackgroundGeocodeForDriverStatus,
  saveLastSuccessfulReverseGeocodeTimestamp,
} from '@/constants/reverseGeocodeThrottle';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';
import {
  shouldSendAutomaticLocationUpdate,
  recordSuccessfulLocationApiSend,
  haversineDistanceMeters,
} from '@/constants/locationSendThrottle';
import { toTmsLocationCode } from '@/utils/tmsLocationCode';
import { toBackendStateDisplayName } from '@/utils/stateDisplayName';
import { isAllowedNorthAmericaLatLng } from '@/utils/geoFence';

const LOCATION_TASK_NAME = 'background-location-task';
// Hint for OS location updates; aligns with LOCATION_API_MIN_INTERVAL_MS in locationSendThrottle.
const LOCATION_UPDATE_INTERVAL = 60 * 1000; // 60 seconds in milliseconds
const USER_LOCATION_KEY = '@user_location';

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
  // iOS kCLErrorDomain Code=0 = locationUnknown (no fix yet: indoors, cold start). Not an app bug.
  if (error && Number(error.code) === 0) {
    if (__DEV__) {
      console.log(
        '📍 [LocationTask] Location temporarily unavailable (Core Location code 0), skipping'
      );
    }
    return;
  }

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

    // Code 1: Permission denied — expected; do not report as TASK_ERROR
    if (errorCode === 1) {
      console.warn(`⚠️ [LocationTask] Permission denied, stopping location updates`);
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (stopError) {
        // Ignore errors when stopping
      }
      return;
    }

    console.warn(`⚠️ [LocationTask] Error received (code ${errorCode}):`, errorMessage);
    fileLogger.error('LocationTask', 'TASK_ERROR', {
      errorCode,
      errorMessage,
      error: error,
      platform: Platform.OS,
      appState,
      timestamp: new Date().toISOString(),
    });

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
        // Test environment gate: when backend is in "test" mode, only one allowed driver (by externalId)
        // may send automatic background updates to the API.
        const appLocEnv = await getResolvedAppLocationSettings();
        const currentExternalId =
          (await AsyncStorage.getItem('@user_external_id').catch(() => null))?.trim() || '';
        const isTestDriver =
          !!currentExternalId &&
          !!appLocEnv.locationTestDriverExternalId &&
          currentExternalId === String(appLocEnv.locationTestDriverExternalId).trim();
        if (appLocEnv.locationEnvironmentMode === 'test') {
          const allowed = (appLocEnv.locationTestDriverExternalId || '').trim();
          if (!allowed || !currentExternalId || currentExternalId !== allowed) {
            console.log(
              `⏸️ [LocationTask] Test mode gate: skipping auto-send (current externalId="${currentExternalId || '(missing)'}", allowed="${allowed || '(missing)'}")`
            );
            return;
          }
        }

        // Geo-fence: prevent obviously wrong fixes for non-test drivers.
        if (!isTestDriver) {
          const ok = isAllowedNorthAmericaLatLng({ latitude, longitude });
          if (!ok) {
            console.warn(
              `⛔️ [LocationTask] Geo-fence blocked location send (lat=${latitude}, lng=${longitude}, externalId="${currentExternalId || ''}")`
            );
            return;
          }
        }

        const sendGate = await shouldSendAutomaticLocationUpdate(latitude, longitude);
        if (!sendGate.ok) {
          console.log(`⏸️ [LocationTask] Skipping API send: ${sendGate.reason}`);
          // activity ping removed; rely on location updates only
          return;
        }

        // Reverse geocode only for loaded_enroute & available, when moved ≥ threshold from
        // Server resolves address via PostGIS → geo_reverse_cache → HERE when fields are omitted.
        let postalCode = '';
        let city = '';
        let state = '';
        let omitAddressFieldsForServerGeocode = false;

        const savedStatusForGeocode = await AsyncStorage.getItem('@user_status');
        const statusLabel =
          savedStatusForGeocode?.trim() || '(missing in storage — edge case)';
        const geocodeAllowed =
          shouldRunBackgroundGeocodeForDriverStatus(savedStatusForGeocode);

        let shouldRunReverseGeocode = false;

        if (!geocodeAllowed) {
          console.log(
            `[LocationTask] Reverse geocode skipped (status ${statusLabel}) — only loaded_enroute & available; using cached ZIP/city/state`
          );
        } else {
          const appLoc = await getResolvedAppLocationSettings();
          const geocodeThresholdM = appLoc.reverseGeocodeMinDistanceM;
          const anchor = await loadGeocodeAnchor();
          if (!anchor) {
            shouldRunReverseGeocode = true;
            omitAddressFieldsForServerGeocode = true;
            console.log(
              `[LocationTask] Geocode: no anchor yet — server will resolve address (PostGIS → cache → HERE)`,
            );
          } else {
            const movedM = haversineDistanceMeters(
              anchor.lat,
              anchor.lon,
              latitude,
              longitude
            );
            if (movedM >= geocodeThresholdM) {
              shouldRunReverseGeocode = true;
              omitAddressFieldsForServerGeocode = true;
              console.log(
                `[LocationTask] Geocode: moved ${Math.round(movedM)}m >= ${geocodeThresholdM}m — server will resolve address`,
              );
            } else {
              console.log(
                `[LocationTask] Geocode: moved ${Math.round(movedM)}m < ${geocodeThresholdM}m — skipping reverse geocode (coords-only update)`,
              );
            }
          }
        }

        if (!shouldRunReverseGeocode) {
          console.log(
            `[LocationTask] Reverse geocode skipped (distance/status) — omit address fields; coords-only PATCH so DB city/state/zip/location unchanged`,
          );
        } else if (omitAddressFieldsForServerGeocode) {
          postalCode = '';
          city = '';
          state = '';
          console.log(
            `[LocationTask] Omitting city/state/zip — backend resolves via PostGIS → geo_reverse_cache → HERE`,
          );
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

        console.log(
          `✅ [LocationTask] Processing location update (passed distance + min-interval gates)`
        );
        
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
              
              console.log(
                `🔍 [LocationTask] Checking conditions: externalId=${!!externalId}, postalCode=${!!postalCode}, userRole=${userRole || 'not found'}`
              );

              // Single request: our backend persists + syncs to TMS for drivers. Do not send driverStatus/statusDate from background (keep DB fields).
              if (externalId) {
                  const finalPostalCode = postalCode.trim();
                  if (!finalPostalCode) {
                    console.warn(
                      `⚠️ [LocationTask] No postal code from geocoder — omitting zip (backend preserves existing ZIP)`,
                    );
                  }

                  let sendLocationUpdateToBackendUser;
                  try {
                    const locationApiModule = require('@/utils/locationApi');
                    sendLocationUpdateToBackendUser = locationApiModule.sendLocationUpdateToBackendUser;
                  } catch (importError) {
                    console.error('❌ [LocationTask] Failed to import locationApi:', importError);
                    fileLogger.error('LocationTask', 'IMPORT_LOCATION_API_ERROR', {
                      error: importError instanceof Error ? importError.message : String(importError),
                      stack: importError instanceof Error ? importError.stack : undefined,
                    });
                    throw importError;
                  }

                  console.log(`📤 [LocationTask] ========== BACKEND LOCATION SYNC ==========`);
                  console.log(`📤 [LocationTask] ZIP: "${finalPostalCode}"`);
                  console.log(`📤 [LocationTask] City: "${city || 'empty'}" State: "${state || 'empty'}"`);
                  console.log(`📤 [LocationTask] Lat/Lng: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

                  let backendUpdateSuccess = false;
                  let resolvedFromServer: { city?: string; state?: string; zip?: string } | undefined;
                  try {
                    if (sendLocationUpdateToBackendUser) {
                      const locationStr = state ? toTmsLocationCode(state) || undefined : undefined;
                      const stateForBackend = state
                        ? toBackendStateDisplayName(state) || state
                        : undefined;
                      const locResult = await sendLocationUpdateToBackendUser({
                        location: locationStr,
                        city: city.trim() ? city.trim() : undefined,
                        state: stateForBackend,
                        zip: finalPostalCode ? finalPostalCode : undefined,
                        latitude,
                        longitude,
                        lastUpdateIso: timestamp,
                        isBackgroundTaskLocationUpdate: true,
                      });
                      backendUpdateSuccess = locResult.ok;
                      resolvedFromServer = locResult.resolved;
                      if (locResult.tmsSyncFailed) {
                        console.warn(
                          `[LocationTask] Backend saved location; TMS sync failed:`,
                          locResult.tmsError
                        );
                        fileLogger.error('LocationTask', 'BACKEND_OK_TMS_FAILED', {
                          externalId,
                          latitude: latitude.toFixed(6),
                          longitude: longitude.toFixed(6),
                          tmsError: locResult.tmsError,
                        });
                      } else if (locResult.ok) {
                        console.log(`✅ [LocationTask] Backend: Location sync completed`);
                      } else {
                        fileLogger.error('LocationTask', 'BACKEND_API_REQUEST_FAILED', {
                          externalId,
                          latitude: latitude.toFixed(6),
                          longitude: longitude.toFixed(6),
                          status: locResult.status,
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
                  
                  // Save coordinates and time only after successful backend update
                  if (backendUpdateSuccess) {
                    try {
                      if (omitAddressFieldsForServerGeocode) {
                        await saveGeocodeAnchor(latitude, longitude);
                        await saveLastSuccessfulReverseGeocodeTimestamp();
                      }
                      await recordSuccessfulLocationApiSend();
                      const resolvedZip = resolvedFromServer?.zip?.trim() || '';
                      const resolvedCity = resolvedFromServer?.city?.trim() || '';
                      const resolvedState = resolvedFromServer?.state?.trim() || '';
                      const locationData = {
                        latitude,
                        longitude,
                        zipCode: resolvedZip || (finalPostalCode ? finalPostalCode : undefined),
                        city: resolvedCity || (city.trim() ? city.trim() : undefined),
                        state: resolvedState || (state.trim() ? state.trim() : undefined),
                        lastUpdate: new Date().toISOString()
                      };
                      // Save to AsyncStorage (unified storage for both foreground and background)
                      await AsyncStorage.setItem(USER_LOCATION_KEY, JSON.stringify(locationData));
                      
                      // Also save zip code separately to @user_zip for easier access
                      if (resolvedZip) {
                        await AsyncStorage.setItem('@user_zip', resolvedZip);
                      } else if (finalPostalCode) {
                        await AsyncStorage.setItem('@user_zip', finalPostalCode);
                      }
                    } catch (storageError) {
                      // Silent fail
                    }
                  }
              } else {
                const totalDuration = Date.now() - taskStartTime;
                console.warn(`⚠️ [LocationTask] Missing externalId for API call`, {
                  externalId: externalId || 'not found',
                });
                fileLogger.error('LocationTask', 'MISSING_REQUIRED_DATA', {
                  hasExternalId: !!externalId,
                  totalDuration,
                });
              }
        } catch (apiError) {
          const totalDuration = Date.now() - taskStartTime;
          if (apiError instanceof Error) {
            console.error('❌ [LocationTask] Error sending location update from background task:', apiError.message);
            fileLogger.error('LocationTask', 'TASK_EXCEPTION', {
              error: apiError.message,
              stack: apiError.stack,
              totalDuration,
              platform: Platform.OS,
            });
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
        }
        // activity ping removed; rely on location updates only
      } catch (err) {
        const totalDuration = Date.now() - taskStartTime;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isTaskNotFoundError =
          errorMessage.includes('not found') ||
          errorMessage.includes("Task 'background-location-task'");
        if (isTaskNotFoundError) {
          console.log(
            `ℹ️ [LocationTask] Task was stopped during processing (expected when location sharing is disabled)`
          );
          return;
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

export { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL };
