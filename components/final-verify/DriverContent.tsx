import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, AppState, ActivityIndicator, Linking, Animated, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OSMMapView, { Region } from '@/components/maps/OSMMapView';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import {
  reverseGeocodeAsync,
  reverseGeocodeWithDeviceFallback,
  GeocodedAddress,
  geocodeZipToAddress,
  geocodeWithPostalAsync,
  resolveCityForApi,
} from '@/utils/geocoding';
import { colors } from '@/lib/colors';
import { fonts, fp, rem, typography } from "@/lib";
import StatusSelect, { StatusValue } from '@/components/common/StatusSelect';
import ZipEditPopup from './ZipEditPopup';
import DateEditPopup from './DateEditPopup';
import CustomSwitch from '@/components/common/CustomSwitch';
import PinMapIcon from '@/icons/PinMapIcon';
import { useAuth } from '@/context/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { LOCATION_TASK_NAME } from '@/tasks/locationTask';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sendLocationUpdateToBackendUser,
  getLocalIsoString,
  formatStatusDate,
} from '@/utils/locationApi';
import { fileLogger } from '@/utils/fileLogger';
import { eventBus } from '@/services/EventBus';
import type { DriverProfileSyncPayload } from '@/utils/driverProfileSync';
import { saveLastSuccessfulReverseGeocodeTimestamp } from '@/constants/reverseGeocodeThrottle';
import { recordSuccessfulLocationApiSend } from '@/constants/locationSendThrottle';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';
import { toTmsLocationCode } from '@/utils/tmsLocationCode';
import { toBackendStateDisplayName } from '@/utils/stateDisplayName';

/** Console: same field names as JSON body to PUT /v1/users/:id/location */
function logLocationApiPayload(
  scenario: string,
  p: {
    location?: string;
    city?: string;
    state?: string;
    zip?: string;
    latitude?: number;
    longitude?: number;
    lastUpdateIso?: string;
    driverStatus?: string;
    statusDate?: string;
    isAutoupdate?: boolean;
    isBackgroundTaskLocationUpdate?: boolean;
    isManualDriverLocationAction?: boolean;
  },
) {
  console.log(
    `[DriverContent] ${scenario} → PUT /v1/users/:id/location\n` +
      JSON.stringify(
        {
          location: p.location ?? '',
          city: p.city ?? null,
          state: p.state ?? null,
          zip: p.zip ?? null,
          latitude: p.latitude,
          longitude: p.longitude,
          lastLocationUpdateAt: p.lastUpdateIso ?? null,
          driverStatus: p.driverStatus ?? null,
          statusDate: p.statusDate ?? null,
          isAutoupdate: p.isAutoupdate,
          isBackgroundTaskLocationUpdate: p.isBackgroundTaskLocationUpdate ?? false,
          isManualDriverLocationAction: p.isManualDriverLocationAction ?? false,
        },
        null,
        2,
      ),
  );
}

/**
 * DriverContent - Location tracking component for DRIVER role users
 * Contains all location-related functionality: map, status updates, location sharing
 */
export type DriverContentProps = {
  /** When set, status banner is rendered in the host (above header z-index) so text stays readable */
  onDriverBanner?: (message: string | null) => void;
};

export default function DriverContent({ onDriverBanner }: DriverContentProps) {
  const insets = useSafeAreaInsets();
  const { authState, updateUserLocation, clearUserLocation, syncLocationFromAsyncStorage } = useAuth();
  const { automaticLocationSharing, setAutomaticLocationSharing } = useAppSettings();
  const user = authState.user;
  const firstName = user?.firstName || 'User';
  const lastName = user?.lastName || '';
  const initials = `${firstName[0]}${lastName ? lastName[0] : firstName[0]}`.toUpperCase();
  const profilePhoto = user?.profilePhoto || user?.avatar || null;
  const [status, setStatus] = useState<StatusValue>('available'); // Local state for dropdown selection
  const [driverStatusFromStorage, setDriverStatusFromStorage] = useState<StatusValue | null>(null); // Status from AsyncStorage (synced with backend)
  const [isStatusDisabled, setIsStatusDisabled] = useState(false);
  const previousStatusRef = useRef<StatusValue | null>(null); // Track previous status for transitions
  const [isLocationSharingAllowed, setIsLocationSharingAllowed] = useState(true); // Control visibility of toggle
  const isInitialLoadRef = useRef(true); // Track if this is the first load
  /** Avoid re-applying status from AsyncStorage when only `user.zip` etc. changes (e.g. after Share location). */
  const driverFormHydratedUserIdRef = useRef<string | undefined>(undefined);
  /** User changed the status dropdown but has not saved — do not overwrite UI from stale server sync (e.g. after permission dialog / foreground). */
  const statusSelectDirtyRef = useRef(false);
  /** Latest select value for event handlers (avoids stale closures). */
  const statusUiRef = useRef<StatusValue>(status);
  const isUpdatingLocationSharingRef = useRef(false); // Prevent infinite loops when updating location sharing
  const [zip, setZipState] = useState('');
  
  // Wrapper function to set ZIP and save to AsyncStorage
  const setZip = useCallback(async (newZip: string) => {
    setZipState(newZip);
    // Save ZIP to AsyncStorage when set programmatically
    try {
      await AsyncStorage.setItem('@user_zip', newZip);
    } catch (error) {
      console.error('[FinalVerify] Failed to save ZIP to AsyncStorage:', error);
      fileLogger.error('FinalVerify', 'FAILED_TO_SAVE_ZIP', {
        error: error instanceof Error ? error.message : String(error),
        zip: newZip,
      });
    }
  }, []);
  
  statusUiRef.current = status;

  const formatDate = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const y = d.getFullYear().toString().slice(-2);
    return `${m}/${day}/${y}`;
  };

  /** Format as MM/DD/YY h:mm AM/PM for statusDate in DB */
  const formatDateWithTime = (d: Date) => {
    const datePart = formatDate(d);
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const m = String(minutes).padStart(2, '0');
    return `${datePart} ${h12}:${m} ${ampm}`;
  };

  /** Parse statusDate from DB (MM/DD/YY h:mm AM/PM or YYYY-MM-DD HH:mm:ss) to display string */
  const parseStatusDateForDisplay = useCallback((value: string | null | undefined): string => {
    const s = (value || '').trim();
    if (!s) return formatDate(new Date());
    // Already in display format (MM/DD/YY or MM/DD/YY h:mm AM/PM)
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s;
    // ISO-like: 2026-03-19 14:42:00
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (isoMatch) {
      const [, y, m, d, h, min] = isoMatch;
      const hh = parseInt(h!, 10);
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh % 12 || 12;
      return `${m}/${d}/${y.slice(-2)} ${h12}:${min} ${ampm}`;
    }
    return formatDate(new Date());
  }, []);
  const [date, setDate] = useState(formatDate(new Date()));
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [formCity, setFormCity] = useState<string>('');
  const [formState, setFormState] = useState<string>('');
  const [formLocation, setFormLocation] = useState<string>('');
  const [editPopupField, setEditPopupField] = useState<'zip' | 'date' | null>(null);
  const [editPopupValue, setEditPopupValue] = useState('');
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  
  const formatLastUpdate = (date: Date | null): string => {
    if (!date) return '';
    
    // Format as date and time in American format: MM/DD/YYYY HH:MM:SS
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `Last updated: ${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
  };
  const mapRef = useRef<{ animateToRegion: (region: Region, duration?: number) => void }>(null);
  // OSMMapView: MapTiler streets-v4 if EXPO_PUBLIC_MAPTILER_API_KEY is set, else CARTO Voyager (no key)
  const initialRegion: Region = {
    latitude: 39.2904, // default Baltimore
    longitude: -76.6122,
    // Start more zoomed in (MapTiler/CARTO styles look better with a closer default).
    latitudeDelta: 0.006,
    longitudeDelta: 0.006,
  };
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isLocationReady, setIsLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [internalBanner, setInternalBanner] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [locationEnvMode, setLocationEnvMode] = useState<'live' | 'test'>('live');
  const [locationTestDriverExternalId, setLocationTestDriverExternalId] =
    useState<string>('3343');
  const messageAnimation = useRef(new Animated.Value(-100)).current; // Start above screen

  const postDriverBanner = useCallback((message: string | null, autoClearMs?: number) => {
    const apply = onDriverBanner ?? ((m: string | null) => setInternalBanner(m));
    apply(message);
    if (message != null && autoClearMs != null && autoClearMs > 0) {
      setTimeout(() => {
        apply(null);
      }, autoClearMs);
    }
  }, [onDriverBanner]);

  const zipJustSetFromShareRef = useRef(false); // Prevent effects from overwriting ZIP right after Share
  const zipClearedByStatusSelectRef = useRef(false); // Prevent effects from restoring ZIP right after clearing on status select

  const formatAddressLabel = useCallback((info: Partial<GeocodedAddress>): string => {
    const city = resolveCityForApi(info);
    const regionLabel =
      toBackendStateDisplayName(info.region, info.isoCountryCode) || '';
    const postalCode = info.postalCode || '';
    const country = info.country === 'United States' ? 'USA' : (info.country || info.isoCountryCode || '');
    const parts = [city, regionLabel, postalCode, country].filter(Boolean);
    return parts.join(' ');
  }, []);

  const geocodeZipAndFillLocation = useCallback(async (zipValue: string) => {
    const trimmed = zipValue.trim();
    if (!trimmed) return;
    try {
      const addr = await geocodeZipToAddress(trimmed, 'us');
      if (addr && (addr.city || addr.state)) {
        setFormCity(addr.city || '');
        setFormState(addr.state || '');
        setFormLocation(addr.city && addr.state && trimmed
          ? `${addr.city}, ${addr.state} ${trimmed}`.trim()
          : addr.city || addr.state || '');
      }
    } catch {
      // Silently ignore geocoding errors
    }
  }, []);

  // Start background location tracking
  const startBackgroundLocationTracking = useCallback(async () => {
    try {
      // CRITICAL: Check user role - only DRIVER should start tracking
      const userRole = user?.role?.trim().toUpperCase();
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
          // Alert removed - error logged only
          return;
        }
        console.log('📍 [BackgroundTracking] ✅ Background permission granted');
      }

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
  }, [user?.role]);

  // Stop background location tracking
  const stopBackgroundLocationTracking = useCallback(async () => {
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
  }, []);

  // Auto-manage automatic location sharing based on driver status transition
  const updateLocationSharingBasedOnStatus = useCallback(async (driverStatus: StatusValue, previousStatus: StatusValue | null) => {
    // Prevent infinite loops
    if (isUpdatingLocationSharingRef.current) {
      console.log('[DriverContent] Already updating location sharing, skipping...');
      return;
    }

    // Statuses that should disable automatic location sharing and hide the toggle
    const inactiveStatuses: StatusValue[] = [
      'available_off',      // Not available
      'available_on',       // Available on (ZIP/Date set manually, no auto-tracking)
      'banned',             // Out of service
      'blocked',            // Blocked
      'on_vocation',        // On vocation
      'expired_documents',  // Expired documents
    ];

    // Statuses that should show the automatic location sharing toggle
    const activeStatuses: StatusValue[] = [
      'available',         // Available
      'loaded_enroute',    // Loaded & Enroute
    ];

    const isCurrentInactive = inactiveStatuses.includes(driverStatus);
    const isCurrentActive = activeStatuses.includes(driverStatus);
    
    // Determine previous status group
    const wasPreviousInactive = previousStatus ? inactiveStatuses.includes(previousStatus) : null;
    const wasPreviousActive = previousStatus ? activeStatuses.includes(previousStatus) : null;

    // Update visibility of toggle based on current status group
    setIsLocationSharingAllowed(isCurrentActive);

    // If this is initial load (previousStatus is null), just set the correct state
    if (previousStatus === null) {
      if (isCurrentInactive) {
        // Status is in inactive group - disable and hide
        isUpdatingLocationSharingRef.current = true;
        try {
          await setAutomaticLocationSharing(false);
          await stopBackgroundLocationTracking();
        } finally {
          isUpdatingLocationSharingRef.current = false;
        }
      }
      // If status is in active group - just show toggle, don't force enable
      // (respect user's manual choice if they disabled it)
      return;
    }

    // Check if we're transitioning between groups
    const transitioningFromActiveToInactive = wasPreviousActive && isCurrentInactive;
    const transitioningFromInactiveToActive = wasPreviousInactive && isCurrentActive;

    if (transitioningFromActiveToInactive) {
      // Transitioning from active group to inactive group - disable and hide
      console.log(`[DriverContent] Transitioning from active group ("${previousStatus}") to inactive group ("${driverStatus}") - disabling automatic location sharing`);
      // Only update if setting is currently enabled
      if (automaticLocationSharing) {
        isUpdatingLocationSharingRef.current = true;
        try {
          await setAutomaticLocationSharing(false);
          await stopBackgroundLocationTracking();
        } finally {
          isUpdatingLocationSharingRef.current = false;
        }
      }
    } else if (transitioningFromInactiveToActive) {
      // Transitioning from inactive group to active group - enable and show
      console.log(`[DriverContent] Transitioning from inactive group ("${previousStatus}") to active group ("${driverStatus}") - enabling automatic location sharing`);
      // Only update if setting is currently disabled
      if (!automaticLocationSharing) {
        isUpdatingLocationSharingRef.current = true;
        try {
          await setAutomaticLocationSharing(true);
          if (userLocation) {
            await startBackgroundLocationTracking();
          }
        } finally {
          isUpdatingLocationSharingRef.current = false;
        }
      }
    }
    // If both statuses are in the same group (active->active or inactive->inactive), don't change the setting
  }, [setAutomaticLocationSharing, stopBackgroundLocationTracking, startBackgroundLocationTracking, userLocation, automaticLocationSharing]);

  const computeNextAutoupdateForStatus = useCallback(
    (driverStatus: StatusValue): boolean => {
      const inactiveStatuses: StatusValue[] = [
        'available_off',
        'available_on',
        'banned',
        'blocked',
        'on_vocation',
        'expired_documents',
      ];
      if (inactiveStatuses.includes(driverStatus)) return false;
      // Active group should auto-enable tracking by default
      const activeStatuses: StatusValue[] = ['available', 'loaded_enroute'];
      if (activeStatuses.includes(driverStatus)) return true;

      return automaticLocationSharing;
    },
    [automaticLocationSharing],
  );

  // Load saved status, zip, and date from AsyncStorage; use user (from login) as fallback when empty
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const uid = user?.id;
        if (!uid) {
          driverFormHydratedUserIdRef.current = undefined;
          statusSelectDirtyRef.current = false;
          return;
        }

        const shouldHydrateStatusFromStorage =
          driverFormHydratedUserIdRef.current !== uid;
        if (shouldHydrateStatusFromStorage) {
          driverFormHydratedUserIdRef.current = uid;
        }

        if (shouldHydrateStatusFromStorage) {
          // Load status (only on first paint for this user or after account switch — not when user.zip changes)
          const savedStatus = await AsyncStorage.getItem('@user_status');
          if (savedStatus) {
            const parsedStatus = savedStatus as StatusValue;

            const basicStatuses: StatusValue[] = [
              'available',
              'available_on',
              'available_off',
              'loaded_enroute',
            ];
            const isBasic = basicStatuses.includes(parsedStatus);

            setStatus(parsedStatus);
            setDriverStatusFromStorage(parsedStatus);
            setIsStatusDisabled(!isBasic);
            statusSelectDirtyRef.current = false;

            previousStatusRef.current = null;

            const inactiveStatuses: StatusValue[] = [
              'available_off',
              'available_on',
              'banned',
              'blocked',
              'on_vocation',
              'expired_documents',
            ];
            const activeStatuses: StatusValue[] = ['available', 'loaded_enroute'];

            const isInactiveStatus = inactiveStatuses.includes(parsedStatus);
            const isActiveStatus = activeStatuses.includes(parsedStatus);

            setIsLocationSharingAllowed(isActiveStatus);

            if (isInitialLoadRef.current) {
              if (isInactiveStatus) {
                const currentSettings = await AsyncStorage.getItem('@odyssea_app_settings');
                if (currentSettings) {
                  const parsedSettings = JSON.parse(currentSettings);
                  if (parsedSettings.automaticLocationSharing) {
                    await setAutomaticLocationSharing(false);
                    await stopBackgroundLocationTracking();
                  }
                } else {
                  await setAutomaticLocationSharing(false);
                  await stopBackgroundLocationTracking();
                }
              }
              isInitialLoadRef.current = false;
            }

            previousStatusRef.current = parsedStatus;

            console.log(
              `[DriverContent] Loaded status from AsyncStorage: ${parsedStatus}, disabled: ${!isBasic}`,
            );
          } else {
            console.log(
              '[DriverContent] No saved status found in AsyncStorage, using default: available',
            );
            setStatus('available');
            setDriverStatusFromStorage('available');
            setIsStatusDisabled(false);
            statusSelectDirtyRef.current = false;
            previousStatusRef.current = null;
            setIsLocationSharingAllowed(true);
            if (isInitialLoadRef.current) {
              isInitialLoadRef.current = false;
            }
            previousStatusRef.current = 'available';
          }
        }

        // Load zip: from AsyncStorage first; if empty (first login), use user from authState and persist
        const savedZip = await AsyncStorage.getItem('@user_zip');
        if (savedZip) {
          setZip(savedZip);
        } else {
          const userZip = (user?.zip ?? '').trim();
          if (userZip) {
            setZip(userZip);
            await AsyncStorage.setItem('@user_zip', userZip);
          }
        }

        // Load date: from AsyncStorage first; if empty (first login), use statusDate from user and persist
        const savedDate = await AsyncStorage.getItem('@user_date');
        if (savedDate) {
          setDate(savedDate);
        } else {
          const userStatusDate = (user?.statusDate ?? '').trim();
          if (userStatusDate) {
            const displayDate = parseStatusDateForDisplay(userStatusDate);
            setDate(displayDate);
            await AsyncStorage.setItem('@user_date', displayDate);
          } else {
            setDate(formatDate(new Date()));
          }
        }
      } catch (error) {
        console.error('[DriverContent] Failed to load saved data:', error);
        fileLogger.error('DriverContent', 'FAILED_TO_LOAD_SAVED_DATA', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    
    loadSavedData();
  }, [
    user?.id,
    user?.zip,
    user?.statusDate,
    setZip,
    setAutomaticLocationSharing,
    stopBackgroundLocationTracking,
    parseStatusDateForDisplay,
  ]);

  // Listen for driver status updates from AuthContext / WebSocket
  useEffect(() => {
    const handleDriverStatusUpdate = async (data: { driverStatus: string | null }) => {
      if (data.driverStatus === undefined || data.driverStatus === null) {
        return;
      }

      const newStatus = data.driverStatus as StatusValue;
      const previousStatus = previousStatusRef.current;
      const uiStatus = statusUiRef.current;
      const skipDueToUnsavedSelect =
        statusSelectDirtyRef.current && newStatus !== uiStatus;

      if (skipDueToUnsavedSelect) {
        return;
      }
      if (statusSelectDirtyRef.current && newStatus === uiStatus) {
        statusSelectDirtyRef.current = false;
      }

      // Check if status is a basic (selectable) status
      const basicStatuses: StatusValue[] = ['available', 'available_on', 'available_off', 'loaded_enroute'];
      const isBasic = basicStatuses.includes(newStatus);
      
      setStatus(newStatus);
      setDriverStatusFromStorage(newStatus); // Update status from AsyncStorage for marker
      setIsStatusDisabled(!isBasic);
      
      console.log(
        `[DriverContent] Driver status updated from backend: ${newStatus}, disabled: ${!isBasic}`,
      );

      // Auto-manage location sharing based on status transition
      await updateLocationSharingBasedOnStatus(newStatus, previousStatus);
      
      // Update previous status ref
      previousStatusRef.current = newStatus;
    };

    const unsubscribe = eventBus.on('DRIVER_STATUS_UPDATED', handleDriverStatusUpdate);

    return () => {
      unsubscribe();
    };
  }, [updateLocationSharingBasedOnStatus]);

  // Full profile from backend (webhook / GET driver-status) — zip, date, status
  useEffect(() => {
    const applyProfile = async (p: DriverProfileSyncPayload) => {
      let skippedConflictingStatus = false;
      if (p.driverStatus !== undefined && p.driverStatus !== null) {
        const newStatus = p.driverStatus as StatusValue;
        const previousStatus = previousStatusRef.current;
        const basicStatuses: StatusValue[] = ['available', 'available_on', 'available_off', 'loaded_enroute'];
        const isBasic = basicStatuses.includes(newStatus);
        const uiStatus = statusUiRef.current;
        skippedConflictingStatus =
          statusSelectDirtyRef.current && newStatus !== uiStatus;
        if (!skippedConflictingStatus) {
          if (statusSelectDirtyRef.current && newStatus === uiStatus) {
            statusSelectDirtyRef.current = false;
          }
          setStatus(newStatus);
          setDriverStatusFromStorage(newStatus);
          setIsStatusDisabled(!isBasic);
          await updateLocationSharingBasedOnStatus(newStatus, previousStatus);
          previousStatusRef.current = newStatus;
        }
      }
      if (p.zip !== null) {
        const z = (p.zip || '').trim();
        if (z) setZip(z);
      }
      if (p.statusDate !== null && p.statusDate !== '') {
        setDate(parseStatusDateForDisplay(p.statusDate));
      }

      if (p.isAutoupdate !== null && !skippedConflictingStatus) {
        // Prevent status-based automation from fighting server value during sync
        isUpdatingLocationSharingRef.current = true;
        try {
          await setAutomaticLocationSharing(!!p.isAutoupdate);
        } finally {
          isUpdatingLocationSharingRef.current = false;
        }
      }
    };

    const unsubscribe = eventBus.on('DRIVER_PROFILE_SYNCED', applyProfile);
    return () => unsubscribe();
  }, [parseStatusDateForDisplay, updateLocationSharingBasedOnStatus]);

  // Restart native background tracking when server app_settings change (same sync path as driver profile).
  useEffect(() => {
    const unsub = eventBus.on('APP_LOCATION_SETTINGS_SYNCED', () => {
      if (!automaticLocationSharing) return;
      void startBackgroundLocationTracking();
    });
    return () => unsub();
  }, [automaticLocationSharing, startBackgroundLocationTracking]);

  // Show "test mode" hint under the auto-sharing toggle. Keep it in sync with backend app_settings.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const s = await getResolvedAppLocationSettings();
      if (!mounted) return;
      setLocationEnvMode(s.locationEnvironmentMode);
      setLocationTestDriverExternalId(s.locationTestDriverExternalId);
    };
    void load();
    const unsub = eventBus.on('APP_LOCATION_SETTINGS_SYNCED', (payload: any) => {
      // payload shape matches AppLocationSettingsStored
      if (!payload || typeof payload !== 'object') return;
      const mode = payload.locationEnvironmentMode;
      const extId = payload.locationTestDriverExternalId;
      if (mode === 'live' || mode === 'test') setLocationEnvMode(mode);
      if (typeof extId === 'string' && extId.trim() !== '') {
        setLocationTestDriverExternalId(extId.trim());
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Animate in-app banner only when host does not render it
  useEffect(() => {
    if (onDriverBanner) return;
    if (internalBanner) {
      Animated.spring(messageAnimation, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(messageAnimation, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [internalBanner, messageAnimation, onDriverBanner]);

  // Load saved location data on mount
  useEffect(() => {
    // Always load coordinates if they exist in authState, even if userLocation is already set
    // This ensures coordinates are displayed on map after app restart
    if (authState.userLocation) {
      const { latitude, longitude } = authState.userLocation;
      
      // Update local state if not already set or if coordinates changed
      if (!userLocation || userLocation.latitude !== latitude || userLocation.longitude !== longitude) {
        setUserLocation({ latitude, longitude });
      }

      // Don't auto-fill ZIP only for available_on (user sets manually). For available/loaded_enroute: show last ZIP, allow auto-update
      const skipZipRestore = status === 'available_on';
      const skipDueToShare = zipJustSetFromShareRef.current;
      const skipDueToStatusSelectClear = zipClearedByStatusSelectRef.current;
      if (!skipZipRestore && !skipDueToShare && !skipDueToStatusSelectClear && authState.userZipCode && authState.userZipCode !== zip) {
        setZip(authState.userZipCode);
      }
      
      // Center map on saved location
      const savedRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      
      // Use setTimeout to ensure map is ready
      setTimeout(() => {
        mapRef.current?.animateToRegion(savedRegion, 500);
        setIsLocationReady(true);
      }, 500);

      // Don't auto-start tracking here - tracking should only start when user clicks "Share my location"
      // with automatic sharing enabled

      // Prepare address label and form fields for saved location
      (async () => {
        try {
          const reverseGeocode = await reverseGeocodeAsync({ latitude, longitude });
          const geo = reverseGeocode && reverseGeocode.length > 0 ? reverseGeocode[0] : null;
          if (geo) {
            setLocationLabel(formatAddressLabel(geo));
            const c = resolveCityForApi(geo);
            const s =
              toBackendStateDisplayName(geo.region, geo.isoCountryCode) || '';
            const zipVal = authState.userZipCode || zip;
            if (c) setFormCity(c);
            if (s) setFormState(s);
            if (c && s && zipVal) setFormLocation(`${c}, ${s} ${zipVal}`.trim());
          }
        } catch {}
      })();
    }
  }, [authState.userLocation, authState.userZipCode, automaticLocationSharing, startBackgroundLocationTracking, formatAddressLabel, setZip, status]); // Run when location data is available

  // Check for location updates from AsyncStorage (when app opens or returns from background)
  const checkForLocationUpdates = useCallback(async () => {
    try {
      // Sync lastLocationUpdate from AsyncStorage to AuthContext
      await syncLocationFromAsyncStorage();
      
      // Load location from AsyncStorage (updated by background task or manual updates)
      const locationJson = await AsyncStorage.getItem('@user_location');
      if (locationJson) {
        const locationData = JSON.parse(locationJson);
        const { latitude, longitude, zipCode } = locationData;
        
        // Update local state and map if coordinates exist
        if (latitude && longitude) {
          setUserLocation({ latitude, longitude });
          // Don't auto-fill ZIP only for available_on (user sets manually). For available/loaded_enroute: show last ZIP, allow auto-update
          const skipZipRestore = status === 'available_on';
          const skipDueToShare = zipJustSetFromShareRef.current;
          const skipDueToStatusSelectClear = zipClearedByStatusSelectRef.current;
          if (zipCode && !skipZipRestore && !skipDueToShare && !skipDueToStatusSelectClear) {
            setZip(zipCode);
          }
          
          // Update map
          const updateRegion: Region = {
            latitude,
            longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          };
          
          mapRef.current?.animateToRegion(updateRegion, 1000);
          
          // Update address label and form fields
          try {
            const reverseGeocode = await reverseGeocodeAsync({ latitude, longitude });
            const geo = reverseGeocode && reverseGeocode.length > 0 ? reverseGeocode[0] : null;
            if (geo) {
              setLocationLabel(formatAddressLabel(geo));
              const c = resolveCityForApi(geo);
              const s =
                toBackendStateDisplayName(geo.region, geo.isoCountryCode) || '';
              if (c) setFormCity(c);
              if (s) setFormState(s);
              if (c && s && zipCode) setFormLocation(`${c}, ${s} ${zipCode}`.trim());
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('❌ [FinalVerify] Failed to check location updates:', error);
      fileLogger.error('FinalVerify', 'FAILED_TO_CHECK_LOCATION_UPDATES', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }, [syncLocationFromAsyncStorage, setZip, formatAddressLabel, status]);

  useEffect(() => {
    // Always sync once on mount
    checkForLocationUpdates();

    // When automatic sharing is enabled, periodically sync to catch background updates
    if (!automaticLocationSharing) {
      return;
    }

    const syncInterval = setInterval(() => {
      checkForLocationUpdates();
      console.log('===========update location============');
    }, 20000); // Check every 20 seconds
    
    return () => clearInterval(syncInterval);
  }, [automaticLocationSharing, checkForLocationUpdates]);

  // Additionally, sync when app returns from background to active state
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkForLocationUpdates();
      }
    });

    return () => {
      sub.remove();
    };
  }, [checkForLocationUpdates]);

  // Stop background tracking when automatic sharing is disabled
  useEffect(() => {
    if (!automaticLocationSharing) {
      stopBackgroundLocationTracking();
    }
    
    // Cleanup on unmount
    return () => {
      // Note: We don't stop tracking on unmount if automatic sharing is enabled,
      // as it should continue in the background
    };
  }, [automaticLocationSharing, stopBackgroundLocationTracking]);

  // Ensure background tracking is running when app starts and automatic sharing is enabled.
  // This covers the case when user previously enabled automatic sharing, fully closed the app,
  // and then opened it again.
  useEffect(() => {
    if (!automaticLocationSharing) {
      return;
    }

    // Start background tracking when automatic sharing is enabled
    // Use a small delay to ensure app is fully initialized
    const timer = setTimeout(() => {
      console.log('📍 [DriverContent] Automatic sharing enabled, starting background tracking...');
      startBackgroundLocationTracking();
    }, 500);

    return () => clearTimeout(timer);
  }, [automaticLocationSharing, startBackgroundLocationTracking]);

  // Periodically verify that background tracking is still running
  useEffect(() => {
    if (!automaticLocationSharing) {
      return;
    }

    const checkTaskStatus = async () => {
      try {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        if (!isRunning) {
          console.warn('⚠️ [DriverContent] Background task is not running! Restarting...');
          await startBackgroundLocationTracking();
        } else {
          console.log('✅ [DriverContent] Background task is running correctly');
        }
      } catch (error) {
        console.error('❌ [DriverContent] Error checking task status:', error);
      }
    };

    // Check immediately
    checkTaskStatus();

    // Then check every 30 seconds
    const statusInterval = setInterval(checkTaskStatus, 30000);

    return () => clearInterval(statusInterval);
  }, [automaticLocationSharing, startBackgroundLocationTracking]);

  // Add debug logging to check if task is actually being called
  useEffect(() => {
    if (Platform.OS !== 'ios' || !automaticLocationSharing) {
      return;
    }

    const checkTaskExecution = async () => {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      console.log('🔍 [Debug] Task running status:', isRunning);
      
      // Check if we can get current location
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        console.log('🔍 [Debug] Can get current location:', !!pos, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null);
      } catch (error) {
        console.warn('🔍 [Debug] Cannot get current location:', error);
      }
    };

    checkTaskExecution();
    const interval = setInterval(checkTaskExecution, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [automaticLocationSharing]);

  const handleUpdateStatus = async () => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      // Validate that all fields are filled
      if (!status) {
        postDriverBanner('Status is required');
        setTimeout(() => postDriverBanner(null), 3000);
        return;
      }
      const isNotAvailable = status === 'available_off';
      const useCurrentDateTime = status === 'available' || status === 'loaded_enroute';
      let zipToSend = zip;
      let dateToSend = date;
      if (isNotAvailable) {
        const savedZip = await AsyncStorage.getItem('@user_zip');
        zipToSend = (savedZip || zip || '').trim();
        dateToSend = formatDateWithTime(new Date());
      } else if (useCurrentDateTime) {
        // available, loaded_enroute - use current date/time (date field is hidden)
        dateToSend = formatDateWithTime(new Date());
        if (!zip || zip.trim() === '') {
          postDriverBanner('ZIP code is required');
          setTimeout(() => postDriverBanner(null), 3000);
          return;
        }
      } else {
        // available_on - use date from form (user can edit)
        if (!zip || zip.trim() === '') {
          postDriverBanner('ZIP code is required');
          setTimeout(() => postDriverBanner(null), 3000);
          return;
        }
        if (!date || date.trim() === '') {
          postDriverBanner('Date is required');
          setTimeout(() => postDriverBanner(null), 3000);
          return;
        }
        // date already has time (MM/DD/YY h:mm AM/PM) or date only - formatStatusDate handles both
        dateToSend = date.trim();
      }

      // Check if we have location data
      let currentLocation = authState.userLocation || userLocation;
      /** For API sync — for available_on filled from ZIP geocode + reverse, not device GPS/form leftovers */
      let cityForApi = formCity || undefined;
      let stateForApi = formState || undefined;
      let locationLineForApi =
        formLocation ||
        (formCity && formState
          ? `${formCity}, ${formState}${zipToSend ? ` ${zipToSend}` : ''}`.trim()
          : undefined) ||
        undefined;

      // available_on: always use coordinates + address from the entered ZIP (Nominatim), not current GPS/cached city
      if (status === 'available_on' && zipToSend?.trim()) {
        try {
          const geoResult = await geocodeWithPostalAsync(zipToSend.trim(), 'us');
          if (!geoResult) {
            postDriverBanner('Failed to determine location from ZIP code');
            setTimeout(() => postDriverBanner(null), 3000);
            return;
          }
          currentLocation = {
            latitude: geoResult.latitude,
            longitude: geoResult.longitude,
          };
          setUserLocation({ latitude: geoResult.latitude, longitude: geoResult.longitude });

          const rev = await reverseGeocodeAsync({
            latitude: geoResult.latitude,
            longitude: geoResult.longitude,
          });
          const g = rev[0];
          if (g) {
            const c = resolveCityForApi(g);
            const regionRaw = g.region ? String(g.region).trim() : '';
            const displayState =
              toBackendStateDisplayName(regionRaw, g.isoCountryCode) ||
              undefined;
            cityForApi = c.trim() || undefined;
            stateForApi = displayState;
            locationLineForApi =
              c && displayState
                ? `${c}, ${displayState}${zipToSend ? ` ${zipToSend}` : ''}`.trim()
                : locationLineForApi;
            setFormCity(c);
            if (displayState) setFormState(displayState);
            if (locationLineForApi) {
              setFormLocation(locationLineForApi);
            }
          }
        } catch {
          postDriverBanner('Failed to determine location from ZIP code');
          setTimeout(() => postDriverBanner(null), 3000);
          return;
        }
      }

      if (!currentLocation) {
        postDriverBanner('Location data is required. Please share your location first.');
        setTimeout(() => postDriverBanner(null), 3000);
        return;
      }

      const previousStatus = previousStatusRef.current;

      const locationForApi =
        toTmsLocationCode(stateForApi, locationLineForApi) || undefined;

      const stateForBackend =
        toBackendStateDisplayName(stateForApi, undefined) || stateForApi;

      const statusUpdatePayload = {
        location: locationForApi,
        city: cityForApi,
        state: stateForBackend,
        zip: zipToSend,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        lastUpdateIso: getLocalIsoString(),
        driverStatus: status,
        statusDate: dateToSend,
        isAutoupdate: computeNextAutoupdateForStatus(status),
        isManualDriverLocationAction: true as const,
      };
      logLocationApiPayload('Status update (save status)', statusUpdatePayload);

      // Single request: backend persists + TMS for drivers
      const syncResult = await sendLocationUpdateToBackendUser(statusUpdatePayload);

      if (syncResult.ok) {
        if (syncResult.tmsSyncFailed) {
          console.warn('[DriverContent] Location/status saved; TMS sync failed:', syncResult.tmsError);
          fileLogger.error('DriverContent', 'TMS_SYNC_FAILED_AFTER_SAVE', {
            tmsError: syncResult.tmsError,
          });
        }
        await recordSuccessfulLocationApiSend();
        await AsyncStorage.multiSet([
          ['@user_status', status],
          ['@user_zip', zipToSend],
          ['@user_date', dateToSend],
        ]);
        setDriverStatusFromStorage(status);
        statusSelectDirtyRef.current = false;
        previousStatusRef.current = status;
        await updateLocationSharingBasedOnStatus(status, previousStatus);
        await updateUserLocation(
          currentLocation.latitude,
          currentLocation.longitude,
          zipToSend
        );
        postDriverBanner('Successful status update');
        setTimeout(() => {
          postDriverBanner(null);
        }, 3000);
      } else {
        fileLogger.error('DriverContent', 'BACKEND_LOCATION_SYNC_FAILED', {
          status: syncResult.status,
        });
        postDriverBanner('Something went wrong. Please try updating the status later.');
        setTimeout(() => {
          postDriverBanner(null);
        }, 3000);
      }
    } catch (error) {
      console.error('[DriverContent] Failed to save status update:', error);
      postDriverBanner('Something went wrong. Please try updating the status later.');
      setTimeout(() => {
        postDriverBanner(null);
      }, 3000);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleShareLocation = async () => {
    if (isSharingLocation) {
      return;
    }

    console.warn('[DriverContent] Share location button pressed');
    setIsSharingLocation(true);
    try {
      // Check and request location permission
      if (hasLocationPermission === null || hasLocationPermission === false) {
        console.warn('[DriverContent] Requesting location permission');
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        setHasLocationPermission(granted);
        if (!granted) {
          fileLogger.error('DriverContent', 'Location permission not granted', { status });
          console.warn('[DriverContent] Location permission not granted:', status);
          postDriverBanner('Something went wrong. Please try updating the status later.');
          setTimeout(() => {
            postDriverBanner(null);
          }, 3000);
          return;
        }
        console.warn('[DriverContent] Location permission granted');
      }

      // Check if location services are enabled
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        fileLogger.error('DriverContent', 'Location services are disabled');
        console.warn('[DriverContent] Location services are disabled');
        postDriverBanner('Something went wrong. Please try updating the status later.');
        setTimeout(() => {
          postDriverBanner(null);
        }, 3000);
        return;
      }

      console.warn('[DriverContent] Getting current location');
      let pos;
      const tryGetLocation = async (accuracy: number) => {
        return Location.getCurrentPositionAsync({ accuracy });
      };
      try {
        // Try lower accuracy first (quicker fix, more likely to succeed indoors or in simulator)
        try {
          pos = await tryGetLocation(Location.Accuracy.Lowest);
        } catch {
          pos = await tryGetLocation(Location.Accuracy.Balanced);
        }
      } catch (locationError: any) {
        const errCode = locationError?.code;
        const errMsg = locationError instanceof Error ? locationError.message : String(locationError);
        fileLogger.error('DriverContent', 'Failed to get current location', {
          error: errMsg,
          code: errCode,
        });
        console.error('[DriverContent] Failed to get current location:', locationError);
        
        let errorMessage = 'Failed to get your location. ';
        if (
          errCode === 0 ||
          errCode === 'ERR_LOCATION_UNAVAILABLE' ||
          (typeof errMsg === 'string' && (errMsg.includes('KCLErrorDomain') || errMsg.includes('location unavailable')))
        ) {
          errorMessage += 'Please ensure location services are enabled, go outdoors or near a window for better signal, and try again.';
        } else if (errMsg && String(errMsg).toLowerCase().includes('permission')) {
          errorMessage += 'Location permission is required. Please enable it in settings.';
        } else {
          errorMessage += 'Please try again.';
        }
        
        postDriverBanner(errorMessage);
        setTimeout(() => {
          postDriverBanner(null);
        }, 5000);
        return;
      }
      
      if (!pos || !pos.coords) {
        fileLogger.error('DriverContent', 'Invalid location data received');
        console.warn('[DriverContent] Invalid location data received');
        postDriverBanner('Something went wrong. Please try updating the status later.');
        setTimeout(() => {
          postDriverBanner(null);
        }, 3000);
        return;
      }
      const { latitude, longitude } = pos.coords;
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      
      // Reverse geocode to get ZIP code and human-readable address
      let postalCode = '';
      let city: string | undefined;
      let locationString: string | undefined;
      let stateDisplayForApi: string | undefined;
      try {
        const reverseGeocode = await reverseGeocodeWithDeviceFallback({ latitude, longitude });
        if (reverseGeocode && reverseGeocode.length > 0) {
          const geo = reverseGeocode[0];
          await saveLastSuccessfulReverseGeocodeTimestamp();
          postalCode = (geo.postalCode || '').trim();
          city = resolveCityForApi(geo) || undefined;
          const regionRaw = geo.region ? String(geo.region).trim() : '';
          stateDisplayForApi = toBackendStateDisplayName(
            regionRaw,
            geo.isoCountryCode
          );
          if (postalCode) {
            zipJustSetFromShareRef.current = true;
            setZip(postalCode);
            setTimeout(() => {
              zipJustSetFromShareRef.current = false;
            }, 6000);
          }
          if (city) setFormCity(city);
          if (stateDisplayForApi) setFormState(stateDisplayForApi);
          const locStr = city && stateDisplayForApi && postalCode
            ? `${city}, ${stateDisplayForApi} ${postalCode}`.trim()
            : formatAddressLabel(geo);
          setFormLocation(locStr);
          locationString =
            toTmsLocationCode(regionRaw, locStr) || undefined;
          setLocationLabel(formatAddressLabel(geo));
        }
      } catch (geoError) {
        fileLogger.error('DriverContent', 'Reverse geocoding failed', { error: geoError instanceof Error ? geoError.message : String(geoError) });
        console.warn('Failed to get ZIP code from geocoding:', geoError);
      }

      const storedStatusForTms = (await AsyncStorage.getItem('@user_status'))?.trim() ?? '';
      // Use the status shown in the select (user may have changed it before Share; storage still lags until "Update status").
      const basicShareStatuses: StatusValue[] = [
        'available',
        'available_on',
        'available_off',
        'loaded_enroute',
      ];
      const driverStatusForShare = basicShareStatuses.includes(status)
        ? status
        : (storedStatusForTms as StatusValue) || 'available_off';

      // Save location and ZIP to AuthContext only if automatic location sharing is enabled
      if (automaticLocationSharing) {
        const finalZipCode = postalCode || zip;

        console.log(
          `[DriverContent] Sync location to backend after Share (driver_status: "${driverStatusForShare}", storage was: "${storedStatusForTms || '(empty)'}")...`,
        );
        const sharePayload = {
          location: locationString,
          city,
          state: stateDisplayForApi,
          zip: finalZipCode,
          latitude,
          longitude,
          lastUpdateIso: getLocalIsoString(),
          driverStatus: driverStatusForShare,
          statusDate: formatStatusDate(''),
          isAutoupdate: automaticLocationSharing,
          isManualDriverLocationAction: true as const,
        };
        logLocationApiPayload('Manual share location', sharePayload);
        console.log(
          '[Share my location] Payload sent to PUT /v1/users/:id/location:',
          JSON.stringify(
            {
              selectStatusUi: status,
              asyncStorageUserStatus: storedStatusForTms || null,
              driverStatusInBody: sharePayload.driverStatus,
              location: sharePayload.location ?? '',
              city: sharePayload.city ?? null,
              state: sharePayload.state ?? null,
              zip: sharePayload.zip ?? null,
              latitude: sharePayload.latitude,
              longitude: sharePayload.longitude,
              lastUpdateIso: sharePayload.lastUpdateIso,
              statusDate: sharePayload.statusDate,
              isAutoupdate: sharePayload.isAutoupdate,
              isManualDriverLocationAction: sharePayload.isManualDriverLocationAction,
            },
            null,
            2,
          ),
        );
        const shareSync = await sendLocationUpdateToBackendUser(sharePayload);

        if (shareSync.ok) {
          if (shareSync.tmsSyncFailed) {
            console.warn('[DriverContent] Share: saved; TMS failed:', shareSync.tmsError);
            fileLogger.error('DriverContent', 'TMS_SYNC_FAILED_AFTER_SHARE', {
              tmsError: shareSync.tmsError,
            });
          }
          await recordSuccessfulLocationApiSend();
          await updateUserLocation(latitude, longitude, finalZipCode);
        } else {
          fileLogger.error('DriverContent', 'BACKEND_SYNC_FAILED_AFTER_SHARE', {
            status: shareSync.status,
          });
        }

        await startBackgroundLocationTracking();
      } else {
        console.log(
          '[Share my location] No HTTP request (automaticLocationSharing is false). Context:',
          JSON.stringify(
            {
              selectStatusUi: status,
              asyncStorageUserStatus: storedStatusForTms || null,
              driverStatusWouldBe: driverStatusForShare,
              latitude,
              longitude,
              postalCodeFromGeocode: postalCode || null,
              zipState: zip,
            },
            null,
            2,
          ),
        );
        // Just update local state for map display, don't save to context
        if (postalCode) {
          zipJustSetFromShareRef.current = true;
          setZip(postalCode);
          setTimeout(() => {
            zipJustSetFromShareRef.current = false;
          }, 6000);
        }
      }
      
      // Animate to user's location
      mapRef.current?.animateToRegion(nextRegion, 1000);
      setUserLocation({ latitude, longitude });
      setIsLocationReady(true);
      
      if (postalCode) {
        postDriverBanner('Location obtained successfully');
        setTimeout(() => {
          postDriverBanner(null);
        }, 2000);
      } else {
        postDriverBanner(
          'Location found, but postal code was not detected. Move outdoors for better GPS, try again, or choose “Available on” to enter ZIP manually.'
        );
        setTimeout(() => {
          postDriverBanner(null);
        }, 6000);
      }
    } catch (e: any) {
      fileLogger.error('DriverContent', 'Unexpected error in handleShareLocation', {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      console.error('[DriverContent] Failed to get location:', e);
      
      let errorMessage = 'An error occurred while getting your location. ';
      if (e?.message) {
        errorMessage += e.message;
      } else {
        errorMessage += 'Please try again.';
      }
      
      postDriverBanner(errorMessage);
      setTimeout(() => {
        postDriverBanner(null);
      }, 4000);
    } finally {
      setIsSharingLocation(false);
    }
  };

  const handleStatusChange = async (newStatus: StatusValue) => {
    setStatus(newStatus);
    statusSelectDirtyRef.current = newStatus !== driverStatusFromStorage;

    if (newStatus === driverStatusFromStorage) {
      // User selected the status they're actually in - restore zip and date from AsyncStorage
      try {
        const savedZip = await AsyncStorage.getItem('@user_zip');
        const savedDate = await AsyncStorage.getItem('@user_date');
        if (savedZip) setZip(savedZip);
        if (savedDate) setDate(savedDate);
        if (savedZip) await geocodeZipAndFillLocation(savedZip);
      } catch {
        // Ignore
      }
    } else if (newStatus === 'available_on') {
      // Switching TO available_on from another status - clear fields (user enters zip and date via popups)
      setZipState('');
      setDate('');
      setFormCity('');
      setFormState('');
      setFormLocation('');
      setLocationLabel(null);
    } else if (newStatus === 'available' || newStatus === 'loaded_enroute') {
      // When "Available" or "Loaded & Enroute" is selected, clear ZIP - coords will come from GPS
      zipClearedByStatusSelectRef.current = true;
      setZipState('');
      setFormCity('');
      setFormState('');
      setFormLocation('');
      setLocationLabel(null);
      setTimeout(() => { zipClearedByStatusSelectRef.current = false; }, 2000);
    }
    // Don't auto-fill date when selecting any status - user enters via popup when available_on
    
    // Check if new status is basic (selectable)
    const basicStatuses: StatusValue[] = ['available', 'available_on', 'available_off', 'loaded_enroute'];
    const isBasic = basicStatuses.includes(newStatus);
    setIsStatusDisabled(!isBasic);
    
    // Don't update isLocationSharingAllowed here - it should be determined from AsyncStorage status (synced with backend)
    // Don't save to AsyncStorage here - it will be saved after successful API update
    // Don't call updateLocationSharingBasedOnStatus here - it will be called after successful API update or via WebSocket
  };

  const handleLocationToggleChange = async (value: boolean) => {
    await setAutomaticLocationSharing(value);
    
    if (!value) {
      // Stop background tracking and clear saved location data
      // Stop background tracking when automatic sharing is disabled
      await stopBackgroundLocationTracking();
      // Note: We keep coordinates and lastLocationUpdate in AsyncStorage to display on map

      // Persist toggle state to backend (DB + server-side TMS sync if applicable)
      try {
        const loc = authState.userLocation || userLocation;
        if (loc?.latitude && loc?.longitude && user?.driverStatus) {
          const disableAutoPayload = {
            latitude: loc.latitude,
            longitude: loc.longitude,
            zip: authState.userZipCode || zip,
            lastUpdateIso: getLocalIsoString(),
            driverStatus: user.driverStatus,
            statusDate: formatStatusDate(''),
            isAutoupdate: false,
          };
          logLocationApiPayload(
            'Disable automatic location sharing',
            disableAutoPayload,
          );
          const res = await sendLocationUpdateToBackendUser(disableAutoPayload);
          if (res.ok && res.tmsSyncFailed) {
            fileLogger.error('DriverContent', 'TMS_SYNC_FAILED_DISABLE_AUTO', {
              tmsError: res.tmsError,
            });
          }
        }
      } catch (e) {
        fileLogger.error('DriverContent', 'BACKEND_SYNC_FAILED_DISABLE_AUTO', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      // When enabling automatic location sharing, start background tracking
      console.log('📍 [DriverContent] Automatic location sharing enabled, starting background tracking...');
      
      // When enabling automatic location sharing:
      // 1. Get current location if not available
      // 2. Send location update to API
      // 3. Start automatic tracking
      
      let currentLatitude: number;
      let currentLongitude: number;
      let currentZipCode: string = zip;
      let geoCity: string | undefined;
      let geoState: string | undefined;
      
      // If location is not available, get it
      if (!userLocation) {
        try {
          if (hasLocationPermission === null) {
            const { status } = await Location.requestForegroundPermissionsAsync();
            const granted = status === 'granted';
            setHasLocationPermission(granted);
            if (!granted) {
              console.warn('Location permission not granted');
              return;
            }
          }

          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          currentLatitude = pos.coords.latitude;
          currentLongitude = pos.coords.longitude;
          
          // Reverse geocode to get ZIP code
          try {
            const reverseGeocode = await reverseGeocodeAsync({ latitude: currentLatitude, longitude: currentLongitude });
            if (reverseGeocode && reverseGeocode.length > 0) {
              const geo = reverseGeocode[0];
              const postalCode = geo.postalCode || '';
              geoCity = resolveCityForApi(geo) || undefined;
              const regionRaw = geo.region ? String(geo.region).trim() : '';
              geoState = regionRaw
                ? toBackendStateDisplayName(regionRaw, geo.isoCountryCode) ||
                  undefined
                : undefined;
              if (postalCode) {
                currentZipCode = postalCode;
                if (status !== 'available_on') {
                  await setZip(postalCode);
                }
              }
              if (geoCity) setFormCity(geoCity);
              if (geoState) setFormState(geoState);
              if (geoCity && geoState && currentZipCode) {
                setFormLocation(`${geoCity}, ${geoState} ${currentZipCode}`.trim());
              }
              setLocationLabel(formatAddressLabel(geo));
            }
          } catch (geoError) {
            console.warn('Failed to get ZIP code from geocoding:', geoError);
          }
          
          // Update map
          const nextRegion: Region = {
            latitude: currentLatitude,
            longitude: currentLongitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          };
          mapRef.current?.animateToRegion(nextRegion, 1000);
          setUserLocation({ latitude: currentLatitude, longitude: currentLongitude });
          setIsLocationReady(true);
        } catch (e) {
          console.error('Failed to get location:', e);
          return;
        }
      } else {
        currentLatitude = userLocation.latitude;
        currentLongitude = userLocation.longitude;
      }
      
      if (status && currentZipCode) {
        console.log('[DriverContent] Sync location to backend after enabling auto-sharing...');
        const cityToSend = geoCity ?? (formCity || undefined);
        const stateToSend = geoState ?? (formState || undefined);
        const locStr = cityToSend && stateToSend ? `${cityToSend}, ${stateToSend} ${currentZipCode}`.trim() : undefined;
        const locationCode = toTmsLocationCode(stateToSend, locStr) || undefined;
        const stateForBackend =
          toBackendStateDisplayName(stateToSend) || stateToSend;
        const togglePayload = {
          location: locationCode,
          city: cityToSend,
          state: stateForBackend,
          zip: currentZipCode,
          latitude: currentLatitude,
          longitude: currentLongitude,
          lastUpdateIso: getLocalIsoString(),
          driverStatus: status,
          statusDate: formatStatusDate(''),
          isAutoupdate: value,
        };
        logLocationApiPayload(
          'Enable automatic location sharing',
          togglePayload,
        );
        const toggleSync = await sendLocationUpdateToBackendUser(togglePayload);

        if (toggleSync.ok) {
          if (toggleSync.tmsSyncFailed) {
            console.warn('[DriverContent] Auto-sharing: saved; TMS failed:', toggleSync.tmsError);
            fileLogger.error('DriverContent', 'TMS_SYNC_FAILED_AUTO_SHARING', {
              tmsError: toggleSync.tmsError,
            });
          }
          await recordSuccessfulLocationApiSend();
          await updateUserLocation(currentLatitude, currentLongitude, currentZipCode);
        } else {
          fileLogger.error('DriverContent', 'BACKEND_SYNC_FAILED_AUTO_SHARING', {
            status: toggleSync.status,
          });
        }
      }

      await startBackgroundLocationTracking();
    }
  };

  return (
    <View style={styles.contentWrapper}>
      {/* Animated success/error message from top */}
      {!onDriverBanner && internalBanner && (
        <Animated.View
          style={[
            styles.topMessageContainer,
            (internalBanner === 'Successful status update' || internalBanner.includes('successfully'))
              ? styles.topMessageContainerSuccess
              : styles.topMessageContainerError,
            {
              transform: [{ translateY: messageAnimation }],
            },
          ]}
        >
          <Text 
            style={[
              styles.topMessageText,
              (internalBanner === 'Successful status update' || internalBanner.includes('successfully'))
                ? styles.topMessageTextSuccess
                : styles.topMessageTextError,
            ]}
          >
            {internalBanner}
          </Text>
        </Animated.View>
      )}
          {/* Map section */}
          <View style={styles.mapContainer}>
              <OSMMapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={initialRegion}
                markers={userLocation ? [{
                  coordinate: userLocation,
                  anchor: { x: 0.5, y: 1.0 }, // Anchor at bottom point of teardrop pin
                  driverStatus: driverStatusFromStorage || user?.driverStatus || null // Use status from AsyncStorage (synced with backend)
                }] : []}
                showsUserLocation={false}
                showsMyLocationButton={false}
                scrollEnabled
                zoomEnabled
                rotateEnabled
                pitchEnabled
                showsCompass
              />
              {/* Until location is ready, show center overlay with blur */}
              {!isLocationReady && (
                <>
                  <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={styles.mapPin} pointerEvents="none">
                    <PinMapIcon />
                  </View>
                </>
              )}
              
              {/* Address label overlay */}
              {userLocation && locationLabel && (
                <View style={styles.addressBadge} pointerEvents="none">
                  <Text style={styles.addressText} numberOfLines={1}>
                    {locationLabel}
                  </Text>
              </View>
              )}
          </View>
          
            {/* Settings section */}
            <View style={styles.settingsSection}>
          <TouchableOpacity
            style={[
              styles.shareButton,
              (status === 'available_on' || status === 'available_off') && { opacity: 0, pointerEvents: 'none' as const },
            ]}
            onPress={handleShareLocation}
            disabled={isSharingLocation}
          >
            {isSharingLocation ? (
              <ActivityIndicator color={colors.neutral.white} size="small" />
            ) : (
              <Text style={styles.buttonText}>Share my location</Text>
            )}
          </TouchableOpacity>
          
          {/* Expired documents message */}
          {status === 'expired_documents' && (
            <View style={styles.expiredDocumentsMessage}>
              <Text style={styles.expiredDocumentsText}>
                Some of your documents have been outdated in our system, please contact{' '}
                <Text 
                  style={styles.expiredDocumentsEmail}
                  onPress={() => {
                    Linking.openURL('mailto:HR@odysseia.one').catch((err) => {
                      console.error('Failed to open email:', err);
                    });
                  }}
                >
                  HR@odysseia.one
                </Text>
              </Text>
            </View>
          )}
          
          {/* Location toggle - only show for active status group */}
          {isLocationSharingAllowed && (
            <View style={styles.switchBlock}>
              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Turn on automatic location sharing</Text>
                <View style={{ flexShrink: 0 }}>
                  <CustomSwitch
                    value={automaticLocationSharing}
                    onValueChange={handleLocationToggleChange}
                  />
                </View>
              </View>
              {locationEnvMode === 'test' ? (
                <Text style={styles.testModeHint}>
                  Test mode is enabled. Automatic background location updates are disabled.
                </Text>
              ) : null}
            </View>
          )}
              
              {/* Last update time */}
              {authState.lastLocationUpdate && (
                <View style={[
                  styles.lastUpdateContainer,
                  !isLocationSharingAllowed && styles.lastUpdateContainerWithMargin
                ]}>
                  <Text style={styles.lastUpdateText}>
                    {formatLastUpdate(authState.lastLocationUpdate)}
                  </Text>
                </View>
              )}
          
          {/* Status dropdown */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>Your status</Text>
                <StatusSelect value={status} onChange={handleStatusChange} disabled={isStatusDisabled} />
          </View>
          
          {/* ZIP - hidden when not available; when available_on: tappable; otherwise read-only */}
              <View style={[styles.settingsWrap, status === 'available_off' && { opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }]} pointerEvents={status === 'available_off' ? 'none' : 'auto'}>
                <Text style={styles.settingsLabel}>ZIP</Text>
                {status === 'available_on' ? (
                  <TouchableOpacity
                    style={[styles.input, styles.textInput]}
                    onPress={() => {
                      setEditPopupValue(zip);
                      setEditPopupField('zip');
                    }}
                    accessibilityLabel="ZIP code"
                    accessibilityHint="Tap to enter ZIP code"
                  >
                    <Text style={[styles.textInput, !zip && { color: colors.primary.blue }]}>
                      {zip || 'Enter ZIP'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.input}>
                    <Text style={styles.textInput}>{zip || '—'}</Text>
                  </View>
                )}
          </View>
          
          {/* Date - hidden for available_off, available, loaded_enroute; always tappable when shown (pick date and time) */}
              <View style={[styles.settingsWrap, (status === 'available_off' || status === 'available' || status === 'loaded_enroute') && { opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }]} pointerEvents={(status === 'available_off' || status === 'available' || status === 'loaded_enroute') ? 'none' : 'auto'}>
                <Text style={styles.settingsLabel}>Date</Text>
                <TouchableOpacity
                  style={[styles.input, styles.textInput]}
                  onPress={() => {
                    setEditPopupValue(date);
                    setEditPopupField('date');
                  }}
                  accessibilityLabel="Date"
                  accessibilityHint="Tap to select date and time"
                >
                  <Text style={[styles.textInput, !date && { color: colors.primary.blue }]}>
                    {date || 'MM/DD/YY h:mm AM/PM'}
                  </Text>
                </TouchableOpacity>
          </View>
              
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}></Text>
          
          <TouchableOpacity 
            style={[styles.updateButton, (isStatusDisabled || isUpdatingStatus) && styles.updateButtonDisabled]} 
            onPress={handleUpdateStatus}
            disabled={isStatusDisabled || isUpdatingStatus}
          >
            {isUpdatingStatus ? (
              <ActivityIndicator color={colors.neutral.white} size="small" />
            ) : (
              <Text style={[styles.updateButtonText, isStatusDisabled && styles.updateButtonTextDisabled]}>
                Update status
              </Text>
            )}
          </TouchableOpacity>
              </View>
            </View>

      {/* ZIP edit popup with map */}
      <ZipEditPopup
        visible={editPopupField === 'zip'}
        initialValue={zip}
        onClose={() => setEditPopupField(null)}
        onSet={(value) => {
          setZip(value);
          setEditPopupField(null);
          geocodeZipAndFillLocation(value);
        }}
      />

      <DateEditPopup
        visible={editPopupField === 'date'}
        initialValue={editPopupValue || date}
        onClose={() => setEditPopupField(null)}
        onSet={(value) => {
          setDate(value);
          setEditPopupField(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: "relative",
    zIndex: 5,
    marginTop: -20,
  },
  settingsLabel: {
     fontSize: fp(13),
     width: `25%`,
     color: colors.primary.blue,
     fontFamily: fonts["600"],
   },
   settingsWrap: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: rem(15),
     marginBottom: rem(9),
   },
   shareButton: {
     ...typography.buttonGreen,
     marginTop: -27,
     marginBottom: rem(20),
   },
   buttonText: {
     ...typography.button,
   },
  mapContainer: {
    flex: 1,
    position: "relative",
    zIndex: 5,
    overflow: 'hidden',
    minHeight: 0,
  },
   settingsSection: {
     boxShadow: "40px 4px 60px 0px rgba(0, 0, 0, 0.25)",
     paddingHorizontal: 26,
     backgroundColor: colors.neutral.white,
     borderTopRightRadius: rem(20),
     borderTopLeftRadius: rem(20),
     position: "relative",
     paddingBottom: rem(60),
     marginTop: -20,
     zIndex: 50,
  },
  mapPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    zIndex: 3,
    transform: [{ translateX: -46 }, { translateY: -46 }],
  },
  addressBadge: {
    position: 'absolute',
    bottom: rem(60),
    left: '50%',
    transform: [{ translateX: -150 }],
    maxWidth: rem(300),
    paddingHorizontal: rem(17),
    paddingVertical: rem(5),
    backgroundColor: 'rgba(41, 41, 102, 0.8)',
    borderRadius: 5,
    zIndex: 10,
  },
  addressText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts["400"],
  },
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: rem(16),
  },
  mapPlaceholderTitle: {
    fontFamily: fonts['700'],
    fontSize: fp(16),
    color: colors.primary.blue,
    marginBottom: rem(6),
  },
  mapPlaceholderText: {
    fontFamily: fonts['400'],
    fontSize: fp(13),
    color: colors.primary.blue,
    textAlign: 'center',
    opacity: 0.75,
  },
  pulseRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#34C759',
    opacity: 0.6,
    zIndex: 2,
  },
  pulseRing2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#34C759',
    opacity: 0.3,
    zIndex: 1,
  },
  locationText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginBottom: rem(24),
  },
  switchBlock: {
    marginBottom: rem(24),
  },
  switchLabel: {
    fontSize: fp(14),
    color: colors.primary.blue,
    fontFamily: fonts["500"],
    flex: 1,
    flexShrink: 1,
    flexGrow: 1,
    lineHeight: fp(18),
    paddingRight: rem(12),
    // allow wrapping to next line if text doesn't fit
    flexWrap: 'wrap',
  },
  testModeHint: {
    marginTop: rem(-18),
    fontSize: fp(12),
    lineHeight: fp(16),
    color: '#8E8E93',
    fontFamily: fonts["400"],
  },
  lastUpdateContainer: {
    marginTop: rem(-20),
    marginBottom: rem(15),
    paddingLeft: rem(4),
  },
  lastUpdateText: {
    fontSize: fp(12),
    color: '#8E8E93',
    fontFamily: fonts["400"],
  },
  statusDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8F8F8',
  },
  statusText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#8E8E93',
  },
  input: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: rem(16),
    height: rem(44),
    backgroundColor: 'rgba(232, 234, 253, 1)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: "center",
  },
  textInput: {
    color: colors.primary.blue,
    fontSize: fp(13),
    lineHeight: fp(16),
    fontFamily: fonts["400"],
    flex: 1,
    // Prevent text clipping on Android
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false as any,
  },
  updateButton: {
     marginTop: rem(12),
    flex: 1,
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    height: rem(45),
    alignItems: 'center',
    marginBottom: 30,
    boxShadow: '0px 4px 8px rgba(52, 199, 89, 0.3)',
    justifyContent: "center",
  },
  updateButtonDisabled: {
    backgroundColor: '#CCCCCC',
    boxShadow: 'none',
    opacity: 0.6,
  },
  updateButtonText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts["500"],
  },
  updateButtonTextDisabled: {
    color: '#999999',
  },
  topMessageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? rem(50) : rem(20),
    paddingHorizontal: rem(20),
    paddingBottom: rem(12),
    backgroundColor: colors.neutral.white,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  topMessageContainerSuccess: {
    borderBottomColor: '#34C759',
  },
  topMessageContainerError: {
    borderBottomColor: '#FF3B30',
  },
  topMessageText: {
    fontSize: fp(14),
    fontFamily: fonts["600"],
    textAlign: 'center',
  },
  topMessageTextSuccess: {
    color: '#34C759',
  },
  topMessageTextError: {
    color: '#FF3B30',
  },
  expiredDocumentsMessage: {
    margin: rem(0),
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: rem(8),
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  expiredDocumentsText: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    lineHeight: fp(20),
    textAlign: 'center',
  },
  expiredDocumentsEmail: {
    color: colors.primary.blue,
    fontFamily: fonts['600'],
    textDecorationLine: 'underline',
  },
  lastUpdateContainerWithMargin: {
    marginTop: rem(15), // Add margin when toggle is hidden
  },
});
