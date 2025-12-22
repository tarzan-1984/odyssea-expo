import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, Platform, AppState, ActivityIndicator } from 'react-native';
import OSMMapView, { Region, MarkerData } from '@/components/maps/OSMMapView';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { reverseGeocodeAsync, GeocodedAddress } from '@/utils/geocoding';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem, typography } from "@/lib";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import StatusSelect, { StatusValue } from '@/components/common/StatusSelect';
import CustomSwitch from '@/components/common/CustomSwitch';
import PinMapIcon from '@/icons/PinMapIcon';
import { useAuth } from '@/context/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL } from '@/tasks/locationTask';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendLocationUpdateToTMS, sendLocationUpdateToBackendUser, getLocalIsoString } from '@/utils/locationApi';
import PermissionsAssistant from '@/components/PermissionsAssistant';
import { fileLogger } from '@/utils/fileLogger';

/**
 * FinalVerifyScreen - Final verification/profile screen
 * User profile with location sharing and status update
 * Based on the design with map, location settings, status update, and bottom navigation
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState, updateUserLocation, clearUserLocation, syncLocationFromAsyncStorage } = useAuth();
  const { automaticLocationSharing, setAutomaticLocationSharing } = useAppSettings();
  const user = authState.user;
  const firstName = user?.firstName || 'User';
  const lastName = user?.lastName || '';
  const initials = `${firstName[0]}${lastName ? lastName[0] : firstName[0]}`.toUpperCase();
  const profilePhoto = user?.profilePhoto || user?.avatar || null;
  const [status, setStatus] = useState<StatusValue>('available');
  const [zip, setZipState] = useState('');
  
  // Wrapper function to set ZIP and save to AsyncStorage
  const setZip = useCallback(async (newZip: string) => {
    setZipState(newZip);
    // Save ZIP to AsyncStorage when set programmatically
    try {
      await AsyncStorage.setItem('@user_zip', newZip);
    } catch (error) {
      console.error('[FinalVerify] Failed to save ZIP to AsyncStorage:', error);
    }
  }, []);
  
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const [date, setDate] = useState(formatDate(new Date()));
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [showPermissionsAssistant, setShowPermissionsAssistant] = useState(false);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  
  // Load saved status, zip, and date from AsyncStorage on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        // Check if this is the first launch of the app
        const firstLaunch = await AsyncStorage.getItem('@app_first_launch');
        
        if (!firstLaunch) {
          // First launch - clear all old data that might cause issues
          console.log('[FinalVerify] First app launch detected, clearing old data...');
          
          // Clear all keys that might cause problems from previous installation
          const keysToClear = [
            '@permissions_onboarding_completed',
            '@odyssea_app_settings',
            '@user_location',
            '@location_update_queue',
          ];
          
          try {
            await AsyncStorage.multiRemove(keysToClear);
            console.log('[FinalVerify] ✅ Cleared old data:', keysToClear);
          } catch (clearError) {
            console.warn('[FinalVerify] Failed to clear some old data:', clearError);
          }
          
          // Mark as launched AFTER clearing data
          await AsyncStorage.setItem('@app_first_launch', 'true');
          console.log('[FinalVerify] ✅ App marked as launched');
          
          // Show permissions assistant
          setShowPermissionsAssistant(true);
        } else {
          // Not first launch - check if permissions were completed
          const permissionsCompleted = await AsyncStorage.getItem('@permissions_onboarding_completed');
          if (permissionsCompleted !== 'true') {
            console.log('[FinalVerify] Permissions not completed, showing permissions assistant');
            setShowPermissionsAssistant(true);
          } else {
            console.log('[FinalVerify] Permissions already completed, skipping permissions assistant');
          }
        }

        // Load status
        const savedStatus = await AsyncStorage.getItem('@user_status');
        if (savedStatus) {
          const parsedStatus = savedStatus as StatusValue;
          // Validate that the saved status is a valid StatusValue
          const validStatuses: StatusValue[] = ['available', 'available_on', 'available_off', 'loaded_enroute'];
          if (validStatuses.includes(parsedStatus)) {
            setStatus(parsedStatus);
          } else {
            console.warn('[FinalVerify] Invalid saved status, using default:', savedStatus);
          }
        }
        
        // Load zip
        const savedZip = await AsyncStorage.getItem('@user_zip');
        if (savedZip) {
          setZip(savedZip);
        }
        
        // Load date
        const savedDate = await AsyncStorage.getItem('@user_date');
        if (savedDate) {
          setDate(savedDate);
        }
      } catch (error) {
        console.error('[FinalVerify] Failed to load saved data:', error);
      }
    };
    
    loadSavedData();
  }, []);
  
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
  // OSMMapView uses OpenStreetMap which is completely free and doesn't require API keys
  const initialRegion: Region = {
    latitude: 39.2904, // default Baltimore
    longitude: -76.6122,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isLocationReady, setIsLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<string | null>(null);

  const formatAddressLabel = useCallback((info: Partial<GeocodedAddress>): string => {
    const city = info.city || info.subregion || info.district || '';
    const regionCode = (info.region || '').split(' ')[0];
    const postalCode = info.postalCode || '';
    const country = info.country === 'United States' ? 'USA' : (info.country || info.isoCountryCode || '');
    const parts = [city, regionCode, postalCode, country].filter(Boolean);
    return parts.join(' ');
  }, []);

  // Wrapper function to send location update using helper
  const sendLocationUpdate = useCallback(async (
    latitude: number,
    longitude: number,
    zipCode: string,
    statusValue: StatusValue,
    statusDate: string
  ): Promise<boolean> => {
    const externalId = user?.externalId;
    if (!externalId) {
      console.error('[FinalVerify] No externalId found for user');
      return false;
    }
    
    return await sendLocationUpdateToTMS(
      externalId,
      latitude,
      longitude,
      zipCode,
      statusValue,
      statusDate
    );
  }, [user?.externalId]);

  // Start background location tracking
  const startBackgroundLocationTracking = useCallback(async () => {
    try {
      console.log('📍 [BackgroundTracking] ========== STARTING BACKGROUND TRACKING ==========');
      
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
          alert('Background location updates require location permission. Please enable location access in app settings.');
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
          alert('To enable automatic background location updates, set Location permission to "Always".\n\nSettings → Privacy & Security → Location Services → odysseaexpo → Select "Always"');
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
      
      // Start location updates with current interval setting
      const intervalInMinutes = LOCATION_UPDATE_INTERVAL / (60 * 1000);
      
      console.log('📍 [BackgroundTracking] Starting location updates with interval:', intervalInMinutes, 'minutes');
      console.log('📍 [BackgroundTracking] Platform:', Platform.OS);
      console.log('📍 [BackgroundTracking] App state:', AppState.currentState);
      
      // CRITICAL FOR iOS BACKGROUND UPDATES:
      // iOS requires distanceInterval to be set (not 0) for background location updates
      // iOS will NOT call the task in background if distanceInterval is 0
      // Also, iOS may ignore timeInterval in background, so we rely on distanceInterval
      const locationOptions: Location.LocationTaskOptions = {
        accuracy: Platform.OS === 'ios' ? Location.Accuracy.Highest : Location.Accuracy.Balanced, // Higher accuracy for iOS to ensure updates
        timeInterval: LOCATION_UPDATE_INTERVAL, // Request updates every 1 minute
        // CRITICAL: iOS requires distanceInterval > 0 for background updates
        // Use 10 meters for iOS - smaller values may cause iOS to pause updates if device is stationary
        // Android can use 0 to accept all updates
        distanceInterval: Platform.OS === 'ios' ? 10 : 0, // iOS needs distanceInterval > 0, use 10m for more reliable background updates
        foregroundService: {
          notificationTitle: 'Location Tracking Active',
          notificationBody: `Tracking your location every ${intervalInMinutes} minute${intervalInMinutes !== 1 ? 's' : ''}`,
          notificationColor: '#292966', // App primary color
        },
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
      
      if (finalForegroundCheck.status !== 'granted' || finalBackgroundCheck.status !== 'granted') {
        console.error('❌ [BackgroundTracking] Permissions not fully granted!');
        console.error('❌ [BackgroundTracking] Foreground:', finalForegroundCheck.status);
        console.error('❌ [BackgroundTracking] Background:', finalBackgroundCheck.status);
        return;
      }
      
      // Check location services are enabled
      const providerStatus = await Location.getProviderStatusAsync();
      console.log('📍 [BackgroundTracking] Location services enabled:', providerStatus.locationServicesEnabled);
      if (!providerStatus.locationServicesEnabled) {
        console.log('❌ [BackgroundTracking] Location services are disabled!');
        return;
      }
      
      // Start location updates
      console.log('📍 [BackgroundTracking] Calling startLocationUpdatesAsync...');
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, locationOptions);
        console.log('📍 [BackgroundTracking] startLocationUpdatesAsync completed without error');
      } catch (startError) {
        console.error('❌ [BackgroundTracking] startLocationUpdatesAsync threw an error:', startError);
        throw startError; // Re-throw to be caught by outer catch
      }
      
      // Wait longer for the service to start (Android may need more time)
      console.log('📍 [BackgroundTracking] Waiting for service to initialize...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
      
      // Verify the task started - try multiple times with delays
      let verification = false;
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
      }
    } catch (error) {
      console.error('❌ [BackgroundTracking] ========== ERROR STARTING TASK ==========');
      console.error('❌ [BackgroundTracking] Failed to start background tracking:', error);
      if (error instanceof Error) {
        console.error('❌ [BackgroundTracking] Error message:', error.message);
        console.error('❌ [BackgroundTracking] Error stack:', error.stack);
      }
      console.error('❌ [BackgroundTracking] =========================================');
    }
  }, []);

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
    }
  }, []);

  // Load saved location data on mount
  useEffect(() => {
    // Don't load location data if permissions assistant is still open
    if (showPermissionsAssistant) {
      return;
    }

    // Always load coordinates if they exist in authState, even if userLocation is already set
    // This ensures coordinates are displayed on map after app restart
    if (authState.userLocation) {
      const { latitude, longitude } = authState.userLocation;
      
      // Update local state if not already set or if coordinates changed
      if (!userLocation || userLocation.latitude !== latitude || userLocation.longitude !== longitude) {
        setUserLocation({ latitude, longitude });
      }
      
      // Update ZIP if available
      if (authState.userZipCode && authState.userZipCode !== zip) {
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

      // Prepare address label for saved location
      (async () => {
        try {
          const reverseGeocode = await reverseGeocodeAsync({ latitude, longitude });
          const geo = reverseGeocode && reverseGeocode.length > 0 ? reverseGeocode[0] : null;
          if (geo) {
            setLocationLabel(formatAddressLabel(geo));
          }
        } catch {}
      })();
    }
  }, [authState.userLocation, authState.userZipCode, automaticLocationSharing, startBackgroundLocationTracking, showPermissionsAssistant]); // Run when location data is available

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
          if (zipCode) {
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
          
          // Update address label
          try {
            const reverseGeocode = await reverseGeocodeAsync({ latitude, longitude });
          const geo = reverseGeocode && reverseGeocode.length > 0 ? reverseGeocode[0] : null;
            if (geo) {
              setLocationLabel(formatAddressLabel(geo));
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('❌ [FinalVerify] Failed to check location updates:', error);
    }
  }, [syncLocationFromAsyncStorage, setZip, formatAddressLabel]);

  useEffect(() => {
    // Don't start location tracking if permissions assistant is still open
    if (showPermissionsAssistant) {
      return;
    }

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
  }, [automaticLocationSharing, checkForLocationUpdates, showPermissionsAssistant]);

  // Additionally, sync when app returns from background to active state
  useEffect(() => {
    // Don't sync if permissions assistant is still open
    if (showPermissionsAssistant) {
      return;
    }

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && !showPermissionsAssistant) {
        checkForLocationUpdates();
      }
    });

    return () => {
      sub.remove();
    };
  }, [checkForLocationUpdates, showPermissionsAssistant]);

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
    // Don't start tracking if permissions assistant is still open
    if (showPermissionsAssistant) {
      return;
    }

    if (!automaticLocationSharing) {
      return;
    }

    // Start background tracking when automatic sharing is enabled
    // Use a small delay to ensure app is fully initialized
    const timer = setTimeout(() => {
      console.log('📍 [FinalVerify] Automatic sharing enabled, starting background tracking...');
      startBackgroundLocationTracking();
    }, 500);

    return () => clearTimeout(timer);
  }, [automaticLocationSharing, startBackgroundLocationTracking, showPermissionsAssistant]);

  // Periodically verify that background tracking is still running
  useEffect(() => {
    // Don't check if permissions assistant is still open
    if (showPermissionsAssistant) {
      return;
    }

    if (!automaticLocationSharing) {
      return;
    }

    const checkTaskStatus = async () => {
      try {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        if (!isRunning) {
          console.warn('⚠️ [FinalVerify] Background task is not running! Restarting...');
          await startBackgroundLocationTracking();
        } else {
          console.log('✅ [FinalVerify] Background task is running correctly');
        }
      } catch (error) {
        console.error('❌ [FinalVerify] Error checking task status:', error);
      }
    };

    // Check immediately
    checkTaskStatus();

    // Then check every 30 seconds
    const statusInterval = setInterval(checkTaskStatus, 30000);

    return () => clearInterval(statusInterval);
  }, [automaticLocationSharing, startBackgroundLocationTracking, showPermissionsAssistant]);

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
    try {
      // Validate that all fields are filled
      if (!status) {
        console.warn('[FinalVerify] Status is required');
        return;
      }
      if (!zip || zip.trim() === '') {
        console.warn('[FinalVerify] ZIP code is required');
        return;
      }
      if (!date || date.trim() === '') {
        console.warn('[FinalVerify] Date is required');
        return;
      }

      // Check if we have location data
      const currentLocation = authState.userLocation || userLocation;
      if (!currentLocation) {
        console.warn('[FinalVerify] Location data is required. Please share your location first.');
        return;
      }

      // Save status, zip, and date to AsyncStorage
      await AsyncStorage.multiSet([
        ['@user_status', status],
        ['@user_zip', zip],
        ['@user_date', date],
      ]);
      console.log('[FinalVerify] Updated status saved to AsyncStorage:', { status, zip, date });
      
      // Send location update to TMS API
      let tmsSuccess = false;
      try {
        tmsSuccess = await sendLocationUpdate(
          currentLocation.latitude,
          currentLocation.longitude,
          zip,
          status,
          date
        );
      } catch (tmsError) {
        console.warn('[FinalVerify] TMS API request failed:', tmsError);
        tmsSuccess = false;
      }

      // Send location update to our backend (independent of TMS API)
      fileLogger.warn('FinalVerify', 'Sending location update to backend in handleUpdateStatus', {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        zip,
      });
      
      const backendSuccess = await sendLocationUpdateToBackendUser({
        location: undefined,
        city: undefined,
        state: undefined,
        zip: zip,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        lastUpdateIso: getLocalIsoString(),
      });

      if (backendSuccess) {
        fileLogger.warn('FinalVerify', 'Backend update successful in handleUpdateStatus, saving location data');
        // Update lastLocationUpdate in AuthContext only after successful backend update
        await updateUserLocation(
          currentLocation.latitude,
          currentLocation.longitude,
          zip
        );
        fileLogger.warn('FinalVerify', 'Location data saved to app in handleUpdateStatus', {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          zip,
        });
        
        // Show success message
        setUpdateSuccessMessage('Location data sent successfully');
        setTimeout(() => {
          setUpdateSuccessMessage(null);
        }, 3000);
      } else {
        fileLogger.error('FinalVerify', 'Backend update failed in handleUpdateStatus');
        setUpdateSuccessMessage('Failed to send location data. Please try again.');
        setTimeout(() => {
          setUpdateSuccessMessage(null);
        }, 3000);
      }
    } catch (error) {
      console.error('[FinalVerify] Failed to save status update:', error);
      setUpdateSuccessMessage('Error updating status. Please try again.');
      setTimeout(() => {
        setUpdateSuccessMessage(null);
      }, 3000);
    }
  };

  const handleShareLocation = async () => {
    if (isSharingLocation) {
      return;
    }

    fileLogger.warn('FinalVerify', 'Share location button pressed');
    setIsSharingLocation(true);
    try {
      if (hasLocationPermission === null) {
        fileLogger.warn('FinalVerify', 'Requesting location permission');
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        setHasLocationPermission(granted);
        if (!granted) {
          fileLogger.error('FinalVerify', 'Location permission not granted');
          console.warn('Location permission not granted');
          return;
        }
        fileLogger.warn('FinalVerify', 'Location permission granted');
      }

      fileLogger.warn('FinalVerify', 'Getting current location');
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!pos) {
        fileLogger.error('FinalVerify', 'Failed to get current location');
        console.warn('Failed to get current location');
        return;
      }
      const { latitude, longitude } = pos.coords;
      fileLogger.warn('FinalVerify', 'Location obtained', { latitude, longitude });
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      
      // Reverse geocode to get ZIP code and human-readable address
      fileLogger.warn('FinalVerify', 'Starting reverse geocoding', { latitude, longitude });
      let postalCode = '';
      let city: string | undefined;
      let state: string | undefined;
      let locationString: string | undefined;
      try {
        const reverseGeocode = await reverseGeocodeAsync({ latitude, longitude });
        if (reverseGeocode && reverseGeocode.length > 0) {
          const geo = reverseGeocode[0];
          postalCode = geo.postalCode || '';
          city = geo.city || geo.subregion || geo.district || undefined;
          state = geo.region ? geo.region.split(' ')[0] : undefined;
          if (postalCode) {
            setZip(postalCode);
          }
          locationString = formatAddressLabel(geo);
          setLocationLabel(locationString);
          fileLogger.warn('FinalVerify', 'Reverse geocoding successful', { postalCode, city, state });
        } else {
          fileLogger.warn('FinalVerify', 'Reverse geocoding returned empty results');
        }
      } catch (geoError) {
        fileLogger.error('FinalVerify', 'Reverse geocoding failed', { error: geoError instanceof Error ? geoError.message : String(geoError) });
        console.warn('Failed to get ZIP code from geocoding:', geoError);
      }
      
      // Save location and ZIP to AuthContext only if automatic location sharing is enabled
      if (automaticLocationSharing) {
        const finalZipCode = postalCode || zip;
        
        // Send location update to TMS API
        let tmsSuccess = false;
        if (status && finalZipCode) {
          console.log('[FinalVerify] Sending location update to TMS API after Share my location...');
          tmsSuccess = await sendLocationUpdate(
            latitude,
            longitude,
            finalZipCode,
            status,
            '' // Empty string - function will use current date/time
          );
        }
        
        // Send location update to our backend (independent of TMS API)
        if (status && finalZipCode) {
          fileLogger.warn('FinalVerify', 'Sending location update to backend after Share my location', {
            latitude,
            longitude,
            zip: finalZipCode,
            city,
            state,
          });
          console.log('[FinalVerify] Sending location update to backend after Share my location...');
          
          const backendSuccess = await sendLocationUpdateToBackendUser({
            location: locationString,
            city,
            state,
            zip: finalZipCode,
            latitude,
            longitude,
            lastUpdateIso: getLocalIsoString(),
          });
          
          if (backendSuccess) {
            fileLogger.warn('FinalVerify', 'Backend update successful, saving location data to app');
            // Update coordinates and time only after successful backend update
            await updateUserLocation(latitude, longitude, finalZipCode);
            fileLogger.warn('FinalVerify', 'Location data saved to app', { latitude, longitude, zip: finalZipCode });
          } else {
            fileLogger.error('FinalVerify', 'Backend update failed');
          }
        } else {
          fileLogger.warn('FinalVerify', 'Skipping backend update - missing status or zip', { hasStatus: !!status, hasZip: !!finalZipCode });
        }
        
        // Start background location tracking
        await startBackgroundLocationTracking();
      } else {
        // Just update local state for map display, don't save to context
        if (postalCode) {
          setZip(postalCode);
        }
      }
      
      // Animate to user's location
      mapRef.current?.animateToRegion(nextRegion, 1000);
      setUserLocation({ latitude, longitude });
      setIsLocationReady(true);
    } catch (e) {
      console.error('Failed to get location:', e);
    } finally {
      setIsSharingLocation(false);
    }
  };

  const handleStatusChange = async (newStatus: StatusValue) => {
    setStatus(newStatus);
    // Save status to AsyncStorage immediately when changed
    try {
      await AsyncStorage.setItem('@user_status', newStatus);
    } catch (error) {
      console.error('[FinalVerify] Failed to save status to AsyncStorage:', error);
    }
  };

  const handleLocationToggleChange = async (value: boolean) => {
    await setAutomaticLocationSharing(value);
    
    if (!value) {
      // Stop background tracking and clear saved location data
      // Stop background tracking when automatic sharing is disabled
      await stopBackgroundLocationTracking();
      // Note: We keep coordinates and lastLocationUpdate in AsyncStorage to display on map
    } else {
      // When enabling automatic location sharing, start background tracking
      console.log('📍 [FinalVerify] Automatic location sharing enabled, starting background tracking...');
      
      // When enabling automatic location sharing:
      // 1. Get current location if not available
      // 2. Send location update to API
      // 3. Start automatic tracking
      
      let currentLatitude: number;
      let currentLongitude: number;
      let currentZipCode: string = zip;
      
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
              const postalCode = reverseGeocode[0].postalCode || '';
              if (postalCode) {
                currentZipCode = postalCode;
                await setZip(postalCode);
              }
              setLocationLabel(formatAddressLabel(reverseGeocode[0]));
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
      
      // Send location update to TMS API
      let tmsSuccess = false;
      if (status && currentZipCode) {
        console.log('[FinalVerify] Sending location update to TMS API after enabling auto-sharing...');
        try {
          tmsSuccess = await sendLocationUpdateToTMS(
            user?.externalId || '',
            currentLatitude,
            currentLongitude,
            currentZipCode,
            status,
            ''
          );
        } catch (tmsError) {
          console.warn('[FinalVerify] TMS API request failed:', tmsError);
          tmsSuccess = false;
        }
      }

      // Send location update to our backend (independent of TMS API)
      if (status && currentZipCode) {
        console.log('[FinalVerify] Sending location update to backend after enabling auto-sharing...');
        
        const backendSuccess = await sendLocationUpdateToBackendUser({
          location: undefined,
          city: undefined,
          state: undefined,
          zip: currentZipCode,
          latitude: currentLatitude,
          longitude: currentLongitude,
          lastUpdateIso: getLocalIsoString(),
        });
        
        // Update coordinates and time only after successful backend update
        if (backendSuccess) {
          await updateUserLocation(currentLatitude, currentLongitude, currentZipCode);
        }
      }
      
      // Start background location tracking (only once, not twice)
      await startBackgroundLocationTracking();
    }
  };

  if (showPermissionsAssistant) {
    return (
      <View style={styles.screenWrap}>
        <PermissionsAssistant
          onComplete={async () => {
            try {
              await AsyncStorage.setItem('@permissions_onboarding_completed', 'true');
            } catch (e) {
              console.warn('[FinalVerify] Failed to save permissions onboarding flag', e);
            }
            setShowPermissionsAssistant(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        {/* Paint status bar area exactly to safe inset height */}
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <View style={styles.container}>
          
        {/* Header with time and profile */}
        <View style={styles.header}>
            <Text style={styles.welcome} numberOfLines={2}>
              Welcome to application, {firstName}
            </Text>
            
            <TouchableOpacity
              style={styles.profileIcon}
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : (
                 <Text style={styles.profileText}>{initials}</Text>
               )}
            </TouchableOpacity>
          </View>
          
          <View style={styles.contentWrapper}>
          {/* Map section */}
          <View style={styles.mapContainer}>
              <OSMMapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={initialRegion}
                markers={userLocation ? [{
                  coordinate: userLocation,
                  anchor: { x: 0.5, y: 0.5 }
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
            style={styles.shareButton}
            onPress={handleShareLocation}
            disabled={isSharingLocation}
          >
            {isSharingLocation ? (
              <ActivityIndicator color={colors.neutral.white} size="small" />
            ) : (
              <Text style={styles.buttonText}>Share my location</Text>
            )}
          </TouchableOpacity>
          
          {/* Location toggle */}
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Turn on automatic location sharing</Text>
                <View style={{ flexShrink: 0 }}>
                  <CustomSwitch
                    value={automaticLocationSharing}
                    onValueChange={handleLocationToggleChange}
            />
          </View>
              </View>
              
              {/* Last update time */}
              {authState.lastLocationUpdate && (
                <View style={styles.lastUpdateContainer}>
                  <Text style={styles.lastUpdateText}>
                    {formatLastUpdate(authState.lastLocationUpdate)}
                  </Text>
                </View>
              )}
          
          {/* Status dropdown */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>Your status</Text>
                <StatusSelect value={status} onChange={handleStatusChange} />
          </View>
          
          {/* ZIP input */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>ZIP</Text>
                <TextInput
                  style={[styles.input, styles.textInput]}
                  value={zip}
                  editable={false}
                  keyboardType="number-pad"
                  placeholder="Enter ZIP"
                  placeholderTextColor={colors.primary.blue}
                  accessibilityLabel="ZIP code"
                  accessibilityHint="ZIP code is automatically filled from your location"
                />
          </View>
          
          {/* Date input */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>Date</Text>
            <View style={styles.input}>
                  <Text style={styles.textInput}>{date}</Text>
            </View>
          </View>
              
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}></Text>
          
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdateStatus}>
            <Text style={styles.updateButtonText}>Update status</Text>
          </TouchableOpacity>
              </View>
              
              {/* Success/Error message */}
              {updateSuccessMessage && (
                <View style={styles.messageContainer}>
                  <Text style={styles.successMessage}>{updateSuccessMessage}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        
        {/* Bottom Navigation */}
        <BottomNavigation />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
   screenContent: {
     flex: 1,
     position: "relative"
   },
   screenWrap: {
     flex: 1,
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
  wrapper: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: rem(25),
    paddingBottom: rem(34),
    borderBottomLeftRadius: rem(20),
    borderBottomRightRadius: rem(20),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
  },
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: "relative",
    zIndex: 5,
    marginTop: -20,
  },
  profileIcon: {
    width: rem(56),
    height: rem(56),
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.blue,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.full,
  },
  profileText: {
    color: colors.neutral.white,
    fontSize: fp(22),
    fontFamily: fonts["700"],
  },
  scrollView: {
    flex: 1,
    marginTop: -20,
  },
  welcome: {
    fontSize: fp(20),
    fontFamily: fonts["700"],
    lineHeight: fp(20),
    color: colors.neutral.white,
    flex: 1,
    flexShrink: 1,
    flexGrow: 1,
    flexWrap: 'wrap',
    marginRight: rem(12),
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
  updateButtonText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts["500"],
  },
  messageContainer: {
    marginTop: rem(12),
    paddingHorizontal: rem(16),
    paddingVertical: rem(8),
    borderRadius: 8,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  successMessage: {
    color: '#34C759',
    fontSize: fp(13),
    fontFamily: fonts["500"],
    textAlign: 'center',
  },
});
