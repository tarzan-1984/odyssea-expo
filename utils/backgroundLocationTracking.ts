import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCATION_TASK_NAME } from '@/tasks/locationTask';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';
import { fileLogger } from '@/utils/fileLogger';
import { sendLocationUpdateToBackendUser, getLocalIsoString } from '@/utils/locationApi';
import { recordSuccessfulLocationApiSend } from '@/constants/locationSendThrottle';
import { isAllowedNorthAmericaLatLng } from '@/utils/geoFence';
import { reverseGeocodeAsync, resolveCityForApi } from '@/utils/geocoding';
import { toTmsLocationCode } from '@/utils/tmsLocationCode';
import { toBackendStateDisplayName } from '@/utils/stateDisplayName';

const USER_LOCATION_KEY = '@user_location';

export type StartBackgroundTrackingOptions = {
  /** When true, skip stop/restart if updates are already running (foreground heal). */
  onlyStartIfNotRunning?: boolean;
};

export async function isBackgroundLocationTrackingRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
}

/**
 * One immediate PUT after (re)starting background tracking — bypasses distance/time throttle.
 * Later pings still go through LocationTask gates.
 */
export async function sendImmediateBackgroundLocationPing(): Promise<void> {
  try {
    const settingsStr = await AsyncStorage.getItem('@odyssea_app_settings');
    if (!settingsStr) {
      return;
    }
    const settings = JSON.parse(settingsStr) as { automaticLocationSharing?: boolean };
    if (!settings.automaticLocationSharing) {
      return;
    }

    const appLoc = await getResolvedAppLocationSettings();
    const currentExternalId =
      (await AsyncStorage.getItem('@user_external_id').catch(() => null))?.trim() || '';
    const isTestDriver =
      !!currentExternalId &&
      !!appLoc.locationTestDriverExternalId &&
      currentExternalId === String(appLoc.locationTestDriverExternalId).trim();
    if (appLoc.locationEnvironmentMode === 'test' && !isTestDriver) {
      return;
    }

    let pos: Location.LocationObject;
    try {
      pos = await Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'ios' ? Location.Accuracy.Balanced : Location.Accuracy.Balanced,
      });
    } catch (gpsError) {
      fileLogger.error('BackgroundTracking', 'IMMEDIATE_PING_GPS_FAILED', {
        error: gpsError instanceof Error ? gpsError.message : String(gpsError),
      });
      return;
    }

    const { latitude, longitude } = pos.coords;
    if (!isTestDriver && !isAllowedNorthAmericaLatLng({ latitude, longitude })) {
      console.warn(
        `⛔️ [BackgroundTracking] Immediate ping blocked by geo-fence (lat=${latitude}, lng=${longitude})`,
      );
      return;
    }

    let zip =
      (await AsyncStorage.getItem('@user_zip').catch(() => null))?.trim() || '';
    let city = '';
    let state = '';
    try {
      const locJson = await AsyncStorage.getItem(USER_LOCATION_KEY);
      if (locJson) {
        const loc = JSON.parse(locJson) as {
          zipCode?: string;
          city?: string;
          state?: string;
        };
        if (!zip && loc.zipCode) zip = String(loc.zipCode).trim();
        if (loc.city) city = String(loc.city).trim();
        if (loc.state) state = String(loc.state).trim();
      }
    } catch {
      // ignore
    }

    try {
      const reverse = await reverseGeocodeAsync({ latitude, longitude });
      const geo = reverse?.[0];
      if (geo) {
        const c = resolveCityForApi(geo);
        const regionRaw = geo.region ? String(geo.region).trim() : '';
        const s = toBackendStateDisplayName(regionRaw, geo.isoCountryCode) || regionRaw;
        if (c) city = c;
        if (s) state = s;
        if (geo.postalCode?.trim()) zip = geo.postalCode.trim();
      }
    } catch {
      // coords-only is fine
    }

    const locationStr = state ? toTmsLocationCode(state) || undefined : undefined;
    const timestamp = getLocalIsoString();

    console.log(
      '📤 [BackgroundTracking] Immediate location ping after (re)start of background task',
    );

    const result = await sendLocationUpdateToBackendUser({
      location: locationStr,
      city: city || undefined,
      state: state ? toBackendStateDisplayName(state) || state : undefined,
      zip: zip || undefined,
      latitude,
      longitude,
      lastUpdateIso: timestamp,
      isAutoupdate: true,
      isBackgroundTaskLocationUpdate: true,
    });

    if (result.ok) {
      await recordSuccessfulLocationApiSend();
      try {
        await AsyncStorage.setItem(
          USER_LOCATION_KEY,
          JSON.stringify({
            latitude,
            longitude,
            zipCode: zip || undefined,
            city: city || undefined,
            state: state || undefined,
            lastUpdate: new Date().toISOString(),
          }),
        );
        if (zip) {
          await AsyncStorage.setItem('@user_zip', zip);
        }
      } catch {
        // ignore
      }
      console.log('✅ [BackgroundTracking] Immediate location ping sent successfully');
    } else {
      fileLogger.error('BackgroundTracking', 'IMMEDIATE_PING_BACKEND_FAILED', {
        status: result.status,
        tmsError: result.tmsError,
      });
    }
  } catch (error) {
    fileLogger.error('BackgroundTracking', 'IMMEDIATE_PING_EXCEPTION', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function startBackgroundLocationTracking(
  options?: StartBackgroundTrackingOptions,
): Promise<void> {
  try {
    // CRITICAL: Check user role - only DRIVER should start tracking
    const userRole = (await AsyncStorage.getItem('@user_role'))?.trim().toUpperCase();
    if (userRole !== 'DRIVER') {
      console.log('⏸️ [BackgroundTracking] User is not DRIVER, skipping background tracking...');
      return;
    }

    // CRITICAL: Check if automatic location sharing is enabled BEFORE starting tracking
    const settings = await AsyncStorage.getItem('@odyssea_app_settings');
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      if (!parsedSettings.automaticLocationSharing) {
        console.log('⏸️ [BackgroundTracking] Automatic location sharing is disabled, skipping start...');
        // Ensure task is stopped if it's running
        try {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
          if (isRunning) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log('✅ [BackgroundTracking] Background tracking stopped (automatic sharing disabled)');
          }
        } catch (stopError) {
          // Ignore errors when stopping
        }
        return; // Exit early - don't start tracking
      }
    } else {
      // If settings not found, don't start tracking
      console.log('⏸️ [BackgroundTracking] Settings not found, skipping start...');
      return; // Exit early
    }
    
    console.log('📍 [BackgroundTracking] ========== STARTING BACKGROUND TRACKING ==========');

    const appLoc = await getResolvedAppLocationSettings();
    const { locationMinIntervalMs, locationMinDistanceM } = appLoc;

    if (options?.onlyStartIfNotRunning) {
      const alreadyRunning = await isBackgroundLocationTrackingRunning();
      if (alreadyRunning) {
        console.log(
          '📍 [BackgroundTracking] Task already running (onlyStartIfNotRunning)',
        );
        return;
      }
    }

    // Environment gate: in test mode, only the allowed externalId may run background auto-updates.
    if (appLoc.locationEnvironmentMode === 'test') {
      const allowed = (appLoc.locationTestDriverExternalId || '').trim();
      const currentExternalId =
        (await AsyncStorage.getItem('@user_external_id').catch(() => null))?.trim() || '';
      if (!allowed || !currentExternalId || currentExternalId !== allowed) {
        console.log(
          `⏸️ [BackgroundTracking] Test mode gate: not starting background tracking (current externalId="${currentExternalId || '(missing)'}", allowed="${allowed || '(missing)'}")`,
        );
        await stopBackgroundLocationTracking();
        return;
      }
    }
    
    // IMPORTANT: On Android 12+, we need notification permission for foreground service
    if (Platform.OS === 'android') {
      const { status: notificationStatus } = await Notifications.getPermissionsAsync();
      if (notificationStatus !== 'granted') {
        console.log('📍 [BackgroundTracking] Requesting notification permission for foreground service...');
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('📍 [BackgroundTracking] Notification permission not granted - foreground service notification may not appear');
          // Continue anyway - some Android versions allow foreground service without notification permission
        } else {
          console.log('📍 [BackgroundTracking] ✅ Notification permission granted');
        }
      }
    }
    
    // Check current permission status first
    const foregroundStatus = await Location.getForegroundPermissionsAsync();
    console.log('📍 [BackgroundTracking] Foreground permission status:', foregroundStatus.status);
    
    if (foregroundStatus.status !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('📍 [BackgroundTracking] Foreground permission not granted');
        // Alert removed - error logged only
        return;
      }
      console.log('📍 [BackgroundTracking] ✅ Foreground permission granted');
    }

    // Request background permissions
    const backgroundStatusResult = await Location.getBackgroundPermissionsAsync();
    console.log('📍 [BackgroundTracking] Background permission status:', backgroundStatusResult.status);
    
    if (backgroundStatusResult.status !== 'granted') {
      console.log('📍 [BackgroundTracking] Requesting background permission...');
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.warn('📍 [BackgroundTracking] Background permission not granted');
        return;
      }
      console.log('📍 [BackgroundTracking] ✅ Background permission granted');
    }

    if (!options?.onlyStartIfNotRunning) {
    // ALWAYS stop task first to ensure clean restart with new interval (defensive)
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    console.log('📍 [BackgroundTracking] Task registered:', isRegistered);
    
    if (isRegistered) {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      console.log('📍 [BackgroundTracking] Task currently running:', isRunning);
      
      if (isRunning) {
        try {
          console.log('📍 [BackgroundTracking] Stopping existing task before restart...');
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          // Wait longer to ensure task fully stops
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Double-check it's stopped
          const stillRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
          if (stillRunning) {
            console.warn('⚠️ [BackgroundTracking] Task still running, forcing stop again...');
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log('📍 [BackgroundTracking] ✅ Task stopped successfully');
          }
        } catch (stopError) {
          console.warn('⚠️ [BackgroundTracking] Error stopping task:', stopError);
          // Continue anyway - try to start
        }
      }
    }
    }

    // Start location updates with server/cached thresholds (AsyncStorage, synced from GET /v1/app-settings)
    const intervalInMinutes = locationMinIntervalMs / (60 * 1000);
    const osTimeIntervalMs =
      locationMinIntervalMs <= 0 ? 0 : locationMinIntervalMs;
    
    console.log('📍 [BackgroundTracking] Starting location updates with interval:', intervalInMinutes, 'minutes');
    console.log('📍 [BackgroundTracking] Platform:', Platform.OS);
    console.log('📍 [BackgroundTracking] App state:', AppState.currentState);
    
    // iOS requires distanceInterval > 0. If admin sets 0 (no distance gate for API throttle), use 1 m for OS callbacks.
    const nativeDistanceIntervalM = Math.max(1, locationMinDistanceM);
    const locationOptions: Location.LocationTaskOptions = {
      accuracy: Platform.OS === 'ios' ? Location.Accuracy.Highest : Location.Accuracy.Balanced, // Higher accuracy for iOS to ensure updates
      timeInterval: osTimeIntervalMs,
      distanceInterval: nativeDistanceIntervalM,
      ...(Platform.OS === 'android'
        ? {
            foregroundService: {
              notificationTitle: 'Location Tracking Active',
              notificationBody:
                locationMinIntervalMs <= 0
                  ? 'Location tracking (min interval off — test mode)'
                  : `Tracking your location every ${intervalInMinutes} minute${intervalInMinutes !== 1 ? 's' : ''}`,
              notificationColor: '#292966', // App primary color
            },
          }
        : {}),
      // iOS-specific settings to ensure background updates work
      ...(Platform.OS === 'ios' && {
        pausesUpdatesAutomatically: false, // Don't pause updates automatically
        activityType: Location.ActivityType.AutomotiveNavigation, // Use automotive navigation for drivers/couriers (better for vehicle tracking)
        showsBackgroundLocationIndicator: true, // Show location indicator in status bar
      }),
    };
    
    console.log('📍 [BackgroundTracking] Location options:', {
      accuracy: locationOptions.accuracy,
      timeInterval: locationOptions.timeInterval,
      distanceInterval: locationOptions.distanceInterval,
      hasForegroundService: !!locationOptions.foregroundService,
    });
    
    // Double-check all permissions one more time
    const finalForegroundCheck = await Location.getForegroundPermissionsAsync();
    const finalBackgroundCheck = await Location.getBackgroundPermissionsAsync();
    console.log('📍 [BackgroundTracking] Final permission check:');
    console.log('📍 [BackgroundTracking] - Foreground:', finalForegroundCheck.status);
    console.log('📍 [BackgroundTracking] - Background:', finalBackgroundCheck.status);
    
    if (finalForegroundCheck.status !== 'granted') {
      console.error('❌ [BackgroundTracking] Foreground permission not granted:', finalForegroundCheck.status);
      fileLogger.error('BackgroundTracking', 'FOREGROUND_PERMISSION_NOT_GRANTED', {
        status: finalForegroundCheck.status,
        platform: Platform.OS,
      });
      return;
    }
    
    if (finalBackgroundCheck.status !== 'granted') {
      console.error('❌ [BackgroundTracking] Background permission not granted:', finalBackgroundCheck.status);
      console.error('❌ [BackgroundTracking] Background location requires "Always" permission on Android');
      fileLogger.error('BackgroundTracking', 'BACKGROUND_PERMISSION_NOT_GRANTED', {
        status: finalBackgroundCheck.status,
        platform: Platform.OS,
      });
      return;
    }
    
    console.log('📍 [BackgroundTracking] ✅ All permissions verified before starting location updates');
    
    // Check location services are enabled
    const providerStatus = await Location.getProviderStatusAsync();
    console.log('📍 [BackgroundTracking] Location services enabled:', providerStatus.locationServicesEnabled);
    if (!providerStatus.locationServicesEnabled) {
      console.log('❌ [BackgroundTracking] Location services are disabled!');
      return;
    }
    
    // CRITICAL: Check if task is registered BEFORE starting
    // On Android, task registration might take a moment, so we'll retry a few times
    let taskRegistered = false;
    console.log('📍 [BackgroundTracking] Checking if task is registered...');
    console.log('📍 [BackgroundTracking] TaskManager available:', typeof TaskManager !== 'undefined');
    console.log('📍 [BackgroundTracking] TaskManager.isTaskRegisteredAsync available:', typeof TaskManager.isTaskRegisteredAsync !== 'undefined');
    
    for (let attempt = 1; attempt <= 5; attempt++) {
      taskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      console.log(`📍 [BackgroundTracking] Registration check attempt ${attempt}/5:`, taskRegistered);
      
      if (taskRegistered) {
        console.log(`📍 [BackgroundTracking] ✅ Task is registered (attempt ${attempt}/5)`);
        break;
      }
      
      if (attempt < 5) {
        console.log(`📍 [BackgroundTracking] ⏳ Task not registered yet, waiting 500ms before retry ${attempt + 1}/5...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // IMPORTANT: On both Android and iOS, isTaskRegisteredAsync may return false even if task is defined
    // The task will be registered dynamically when Location.startLocationUpdatesAsync is called
    // So we should try to start even if isTaskRegisteredAsync returns false
    // If task is truly not registered, startLocationUpdatesAsync will throw an error which we'll handle
    if (!taskRegistered) {
      console.warn('⚠️ [BackgroundTracking] isTaskRegisteredAsync returned false after 5 attempts');
      console.warn('⚠️ [BackgroundTracking] Task name:', LOCATION_TASK_NAME);
      console.warn('⚠️ [BackgroundTracking] Platform:', Platform.OS);
      
      if (Platform.OS === 'android') {
        console.warn('⚠️ [BackgroundTracking] On Android, isTaskRegisteredAsync may return false even if task is defined.');
        console.warn('⚠️ [BackgroundTracking] Task will be registered dynamically when startLocationUpdatesAsync is called.');
        console.warn('⚠️ [BackgroundTracking] Proceeding with startLocationUpdatesAsync anyway...');
      } else {
        // On iOS, this can also be a false negative - task may be defined but not yet visible
        console.warn('⚠️ [BackgroundTracking] On iOS, isTaskRegisteredAsync may return false even if task is defined.');
        console.warn('⚠️ [BackgroundTracking] Task may be registered but not yet visible to isTaskRegisteredAsync.');
        console.warn('⚠️ [BackgroundTracking] Proceeding with startLocationUpdatesAsync - will handle error if task is truly not registered...');
      }
      // Don't return for either platform - continue to try starting location updates
      // If task is truly not registered, startLocationUpdatesAsync will throw an error
    } else {
      console.log('📍 [BackgroundTracking] ✅ Task is registered, proceeding with start...');
    }
    
    // CRITICAL: On Android 12+, verify notification permission is granted
    if (Platform.OS === 'android') {
      const androidVersion = Platform.Version;
      if (androidVersion >= 31) { // Android 12+
        const notificationStatus = await Notifications.getPermissionsAsync();
        if (notificationStatus.status !== 'granted') {
          console.error('❌ [BackgroundTracking] Android 12+ requires notification permission for foreground service!');
          console.error('❌ [BackgroundTracking] Current notification status:', notificationStatus.status);
          fileLogger.error('BackgroundTracking', 'NOTIFICATION_PERMISSION_REQUIRED', {
            androidVersion,
            notificationStatus: notificationStatus.status,
          });
          // Alert removed - error logged only
          return;
        }
        console.log('📍 [BackgroundTracking] ✅ Notification permission verified for Android 12+');
      }
    }
    
    // Start location updates
    // NOTE: On both Android and iOS, even if isTaskRegisteredAsync returns false, 
    // startLocationUpdatesAsync may still work if task was defined via TaskManager.defineTask
    console.log('📍 [BackgroundTracking] Calling startLocationUpdatesAsync...');
    console.log('📍 [BackgroundTracking] Task registration status before start:', taskRegistered);
    console.log('📍 [BackgroundTracking] If false, task will be registered dynamically (or error will be thrown if truly not registered)');
    
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, locationOptions);
      console.log('📍 [BackgroundTracking] ✅✅✅ startLocationUpdatesAsync completed successfully!');
      console.log('📍 [BackgroundTracking] Location tracking has been started');
      
      // Verify task is now registered (should be true after start on both platforms)
      const nowRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      console.log('📍 [BackgroundTracking] Task registration status after start:', nowRegistered);
      if (nowRegistered && !taskRegistered) {
        console.log('📍 [BackgroundTracking] ✅ Task was registered dynamically during start');
      }
    } catch (startError) {
      console.error('❌ [BackgroundTracking] startLocationUpdatesAsync threw an error:', startError);
      console.error('❌ [BackgroundTracking] Error type:', typeof startError);
      console.error('❌ [BackgroundTracking] Error instanceof Error:', startError instanceof Error);
      
      // Re-check permissions to see if they're actually granted
      const recheckForeground = await Location.getForegroundPermissionsAsync();
      const recheckBackground = await Location.getBackgroundPermissionsAsync();
      
      if (startError instanceof Error) {
        console.error('❌ [BackgroundTracking] Error message:', startError.message);
        console.error('❌ [BackgroundTracking] Error stack:', startError.stack);
      } else {
        console.error('❌ [BackgroundTracking] Error (not Error instance):', JSON.stringify(startError));
      }
      
      console.error('❌ [BackgroundTracking] Permission re-check after error:');
      console.error('❌ [BackgroundTracking] - Foreground:', recheckForeground.status);
      console.error('❌ [BackgroundTracking] - Background:', recheckBackground.status);
      
      // More detailed error handling for Android
      if (Platform.OS === 'android' && startError instanceof Error) {
        const errorMessage = startError.message.toLowerCase();
        console.error('❌ [BackgroundTracking] Error message (lowercase):', errorMessage);
        
        if (errorMessage.includes('notification') || errorMessage.includes('foreground')) {
          console.error('❌ [BackgroundTracking] Foreground service notification error - check notification permission');
          fileLogger.error('BackgroundTracking', 'FOREGROUND_SERVICE_NOTIFICATION_ERROR', {
            error: startError.message,
            androidVersion: Platform.Version,
            foregroundPermission: recheckForeground.status,
            backgroundPermission: recheckBackground.status,
          });
          // Alert removed - error logged only
        } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
          console.error('❌ [BackgroundTracking] Location permission error');
          console.error('❌ [BackgroundTracking] Current permissions - Foreground:', recheckForeground.status, 'Background:', recheckBackground.status);
          fileLogger.error('BackgroundTracking', 'LOCATION_PERMISSION_ERROR', {
            error: startError.message,
            foregroundPermission: recheckForeground.status,
            backgroundPermission: recheckBackground.status,
          });
          // Alert removed - error logged only
        } else if (errorMessage.includes('task') || errorMessage.includes('registered') || errorMessage.includes('not found') || errorMessage.includes('undefined')) {
          console.error('❌ [BackgroundTracking] Task registration error - task is truly not registered');
          console.error('❌ [BackgroundTracking] This means TaskManager.defineTask was not executed or failed');
          fileLogger.error('BackgroundTracking', 'TASK_REGISTRATION_ERROR', {
            error: startError.message,
            taskName: LOCATION_TASK_NAME,
            foregroundPermission: recheckForeground.status,
            backgroundPermission: recheckBackground.status,
          });
          // Alert removed - error logged only
        } else {
          console.error('❌ [BackgroundTracking] Unknown error:', errorMessage);
          fileLogger.error('BackgroundTracking', 'UNKNOWN_START_ERROR', {
            error: startError.message,
            stack: startError.stack,
            foregroundPermission: recheckForeground.status,
            backgroundPermission: recheckBackground.status,
          });
          // Alert removed - error logged only
        }
      } else if (startError instanceof Error) {
        // iOS error handling
        const errorMessage = startError.message.toLowerCase();
        if (errorMessage.includes('task') || errorMessage.includes('registered') || errorMessage.includes('not found') || errorMessage.includes('undefined')) {
          console.error('❌ [BackgroundTracking] Task registration error on iOS - task is truly not registered');
          fileLogger.error('BackgroundTracking', 'TASK_REGISTRATION_ERROR_IOS', {
            error: startError.message,
            platform: Platform.OS,
          });
          // Alert removed - error logged only
        } else {
          console.error('❌ [BackgroundTracking] Unknown error:', errorMessage);
          fileLogger.error('BackgroundTracking', 'UNKNOWN_START_ERROR', {
            error: startError.message,
            platform: Platform.OS,
          });
          // Alert removed - error logged only
        }
      } else {
        // Non-Error instance
        console.error('❌ [BackgroundTracking] Unknown error type:', typeof startError);
        fileLogger.error('BackgroundTracking', 'UNKNOWN_START_ERROR_TYPE', {
          error: String(startError),
          errorType: typeof startError,
        });
        // Alert removed - error logged only
      }
      
      throw startError; // Re-throw to be caught by outer catch
    }
    
    // Wait longer for the service to start (Android may need more time)
    console.log('📍 [BackgroundTracking] Waiting for service to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
    
    // Verify the task started - try multiple times with delays
    let verification = false;
    if (Platform.OS === 'ios') {
      // On iOS dev-client builds, hasStartedLocationUpdatesAsync may lag / return false even when the native service started.
      // Treat successful startLocationUpdatesAsync as success to avoid false-negative spam.
      verification = true;
    } else {
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`📍 [BackgroundTracking] Verification attempt ${attempt}/3...`);
        verification = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (verification) {
          console.log(`📍 [BackgroundTracking] ✅ Verification successful on attempt ${attempt}`);
          break;
        }
        if (attempt < 3) {
          console.log(`📍 [BackgroundTracking] ⏳ Waiting 2 seconds before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    console.log('📍 [BackgroundTracking] ========== TASK START RESULT ==========');
    console.log('📍 [BackgroundTracking] hasStartedLocationUpdatesAsync =', verification);
    console.log('📍 [BackgroundTracking] interval(min) =', intervalInMinutes);
    console.log('📍 [BackgroundTracking] =========================================');
    
    if (verification) {
      console.log('📍 [BackgroundTracking] ✅✅✅ TASK STARTED SUCCESSFULLY! ✅✅✅');
      console.log('📍 [BackgroundTracking] Foreground service notification should appear in notification tray');
      void sendImmediateBackgroundLocationPing();
    } else {
      console.error('❌ [BackgroundTracking] ❌❌❌ TASK FAILED TO START ❌❌❌');
      console.error('❌ [BackgroundTracking] Verification returned false after 3 attempts');
      console.error('❌ [BackgroundTracking] Possible causes:');
      console.error('❌ [BackgroundTracking] 1. Permissions not granted (check above logs)');
      console.error('❌ [BackgroundTracking] 2. Task not registered (check above logs)');
      console.error('❌ [BackgroundTracking] 3. Android system restrictions');
      console.error('❌ [BackgroundTracking] 4. Foreground service notification permission issue');
      fileLogger.error('BackgroundTracking', 'TASK_VERIFICATION_FAILED', {
        platform: Platform.OS,
        androidVersion: Platform.OS === 'android' ? Platform.Version : null,
      });
    }
  } catch (error) {
    console.error('❌ [BackgroundTracking] ========== ERROR STARTING TASK ==========');
    console.error('❌ [BackgroundTracking] Failed to start background tracking:', error);
    
    if (error instanceof Error) {
      console.error('❌ [BackgroundTracking] Error message:', error.message);
      console.error('❌ [BackgroundTracking] Error stack:', error.stack);
      console.error('❌ [BackgroundTracking] Error name:', error.name);
      
      // Log specific error details for debugging
      const errorDetails = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        platform: Platform.OS,
        androidVersion: Platform.OS === 'android' ? Platform.Version : null,
      };
      console.error('❌ [BackgroundTracking] Full error details:', JSON.stringify(errorDetails, null, 2));
      
      // Try to provide user-friendly error message
      let userMessage = 'Failed to start background location tracking.';
      if (error.message.includes('notification')) {
        userMessage = 'Notification permission is required. Please enable notifications in app settings.';
      } else if (error.message.includes('permission')) {
        userMessage = 'Location permission is required. Please grant location permission in app settings.';
      } else if (error.message.includes('task') || error.message.includes('registered')) {
        userMessage = 'Location tracking service is not initialized. Please restart the app.';
      }
      
      // Log to file for debugging
      fileLogger.error('BackgroundTracking', 'START_FAILED', {
        error: error.message,
        stack: error.stack,
        name: error.name,
        platform: Platform.OS,
        androidVersion: Platform.OS === 'android' ? Platform.Version : null,
      });
      
      // Alert removed - error logged only
    } else {
      console.error('❌ [BackgroundTracking] Unknown error type:', typeof error, error);
      fileLogger.error('BackgroundTracking', 'START_FAILED_UNKNOWN', {
        errorType: typeof error,
        error: String(error),
        platform: Platform.OS,
      });
    }
    
    console.error('❌ [BackgroundTracking] =========================================');
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    console.log('📍 [BackgroundTracking] Stopping background tracking...');
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        // Wait to ensure task is fully stopped
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    console.log('📍 [BackgroundTracking] Stop request completed');
  } catch (error) {
    console.error('❌ [BackgroundTracking] Error stopping task:', error);
    fileLogger.error('BackgroundTracking', 'ERROR_STOPPING_TASK', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      platform: Platform.OS,
    });
  }
}

export async function ensureBackgroundLocationTrackingForAutoupdate(
  isAutoupdate: boolean | null,
): Promise<void> {
  const role = (await AsyncStorage.getItem('@user_role'))?.trim().toUpperCase();
  if (role !== 'DRIVER') {
    return;
  }

  if (isAutoupdate === false) {
    console.log(
      '📍 [BackgroundTracking] Server isAutoupdate=false — stopping background location task',
    );
    await stopBackgroundLocationTracking();
    return;
  }

  if (isAutoupdate !== true) {
    return;
  }

  const isRunning = await isBackgroundLocationTrackingRunning();
  if (isRunning) {
    console.log(
      '📍 [BackgroundTracking] Foreground ensure: background task already running, no action',
    );
    return;
  }

  console.log(
    '📍 [BackgroundTracking] Foreground ensure: isAutoupdate=true but task not running — starting',
  );
  await startBackgroundLocationTracking({ onlyStartIfNotRunning: true });
}
