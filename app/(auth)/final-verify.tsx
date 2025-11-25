import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, Platform } from 'react-native';
import OSMMapView, { Region, MarkerData } from '@/components/maps/OSMMapView';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
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
import { sendLocationUpdateToTMS } from '@/utils/locationApi';

/**
 * FinalVerifyScreen - Final verification/profile screen
 * User profile with location sharing and status update
 * Based on the design with map, location settings, status update, and bottom navigation
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState, updateUserLocation, setUserLocationWithoutTimestamp, clearUserLocation, clearLocationData } = useAuth();
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
      console.log('[FinalVerify] Saved ZIP to AsyncStorage:', newZip);
    } catch (error) {
      console.error('[FinalVerify] Failed to save ZIP to AsyncStorage:', error);
    }
  }, []);
  
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const [date, setDate] = useState(formatDate(new Date()));
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  
  // Load saved status, zip, and date from AsyncStorage on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        // Load status
        const savedStatus = await AsyncStorage.getItem('@user_status');
        if (savedStatus) {
          const parsedStatus = savedStatus as StatusValue;
          // Validate that the saved status is a valid StatusValue
          const validStatuses: StatusValue[] = ['available', 'available_on', 'available_off', 'loaded_enroute'];
          if (validStatuses.includes(parsedStatus)) {
            setStatus(parsedStatus);
            console.log('[FinalVerify] Loaded saved status from AsyncStorage:', parsedStatus);
          } else {
            console.warn('[FinalVerify] Invalid saved status, using default:', savedStatus);
          }
        }
        
        // Load zip
        const savedZip = await AsyncStorage.getItem('@user_zip');
        if (savedZip) {
          setZip(savedZip);
          console.log('[FinalVerify] Loaded saved ZIP from AsyncStorage:', savedZip);
        }
        
        // Load date
        const savedDate = await AsyncStorage.getItem('@user_date');
        if (savedDate) {
          setDate(savedDate);
          console.log('[FinalVerify] Loaded saved date from AsyncStorage:', savedDate);
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

  const formatAddressLabel = useCallback((info: Partial<Location.LocationGeocodedAddress>): string => {
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
      // Check current permission status first
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      
      if (foregroundStatus.status !== 'granted') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          alert('Background location updates require location permission. Please enable location access in app settings.');
          return;
        }
      }

      // Request background permissions
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        alert('To enable automatic background location updates, set Location permission to "Always".\n\nSettings → Privacy & Security → Location Services → odysseaexpo → Select "Always"');
        return;
      }

      // ALWAYS stop task first to ensure clean restart with new interval
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isRegistered) {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        if (isRunning) {
          console.log('🔄 [BackgroundTracking] Task already running, FORCE stopping...');
          try {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            // Wait longer to ensure task fully stops
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Double-check it's stopped
            const stillRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
            if (stillRunning) {
              console.warn('⚠️ [BackgroundTracking] Task still running, forcing stop again...');
              await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch {
            // Silently ignore "task not found" errors
          }
        }
      }
      
      // Start location updates with current interval setting
      const intervalInMinutes = LOCATION_UPDATE_INTERVAL / (60 * 1000);
      console.log(`📍 [BackgroundTracking] Starting with interval: ${intervalInMinutes} minutes (${LOCATION_UPDATE_INTERVAL}ms)`);
      console.log(`⏰ [BackgroundTracking] Current time: ${new Date().toLocaleTimeString()}`);
      
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        // distanceInterval: minimum distance (meters) for a new update
        // BEHAVIOR ON iOS AND ANDROID:
        // - iOS: distanceInterval=0 accepts all updates for any movement
        //   (timeInterval may be ignored by the system)
        // - Android: distanceInterval=0 behaves similarly
        //   (Android 8.0+ can throttle update frequency at OS level)
        // SOLUTION: Use 0 to accept all updates from the system,
        // then filter by time in locationTask.ts (same logic on iOS and Android)
        distanceInterval: 0, // Accept all updates; we filter by time ourselves
        foregroundService: {
          notificationTitle: 'Location Tracking',
          notificationBody: `Tracking your location every ${intervalInMinutes} minutes`,
        },
      });
      
      // Verify the task started
      const verification = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log(`✅ [BackgroundTracking] Task started: ${verification ? 'YES' : 'NO'}`);
      if (verification) {
        console.log(`✅ [BackgroundTracking] Interval set to: ${intervalInMinutes} minutes`);
      }
    } catch (error) {
      console.error('❌ [LocationTask] Failed to start background tracking:', error);
    }
  }, []);

  // Stop background location tracking
  const stopBackgroundLocationTracking = useCallback(async () => {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isRegistered) {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        if (isRunning) {
          console.log('🛑 [BackgroundTracking] Stopping task...');
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          // Clear all location update related data
          await AsyncStorage.removeItem('@last_location_update_timestamp');
          await AsyncStorage.removeItem('@pending_location_update');
          // Wait to ensure task is fully stopped
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log('✅ [BackgroundTracking] Task stopped and all update data cleared');
        } else {
          // Even if task is not running, clear pending updates
          await AsyncStorage.removeItem('@pending_location_update');
          await AsyncStorage.removeItem('@last_location_update_timestamp');
        }
      } else {
        // Clear pending updates even if task is not registered
        await AsyncStorage.removeItem('@pending_location_update');
        await AsyncStorage.removeItem('@last_location_update_timestamp');
      }
    } catch (error) {
      console.error('❌ [BackgroundTracking] Error stopping task:', error);
      // Still try to clear pending updates even if stopping fails
      try {
        await AsyncStorage.removeItem('@pending_location_update');
        await AsyncStorage.removeItem('@last_location_update_timestamp');
      } catch (clearError) {
        console.error('❌ [BackgroundTracking] Error clearing update data:', clearError);
      }
    }
  }, []);

  // Load saved location data on mount
  useEffect(() => {
    if (authState.userLocation && authState.userZipCode && !userLocation) {
      const { latitude, longitude } = authState.userLocation;
      setUserLocation({ latitude, longitude });
      setZip(authState.userZipCode);
      
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

      // Start background tracking if automatic sharing is enabled
      // Always restart to ensure correct interval is applied
      if (automaticLocationSharing) {
        console.log('🔄 [BackgroundTracking] Restarting task on mount to apply current interval');
        startBackgroundLocationTracking();
      }

      // Prepare address label for saved location
      (async () => {
        try {
          const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (geo) {
            setLocationLabel(formatAddressLabel(geo));
          }
        } catch {}
      })();
    }
  }, [authState.userLocation, authState.userZipCode, automaticLocationSharing, startBackgroundLocationTracking]); // Run when location data is available

  // Check for background location updates
  useEffect(() => {
    // Don't check for updates if automatic location sharing is disabled
    if (!automaticLocationSharing) {
      return;
    }

    const checkForLocationUpdates = async () => {
      try {
        // Double-check that automatic sharing is still enabled before processing
        if (!automaticLocationSharing) {
          return;
        }

        const pendingUpdate = await AsyncStorage.getItem('@pending_location_update');
        if (pendingUpdate) {
          const updateData = JSON.parse(pendingUpdate);
          const { latitude, longitude, zipCode, timestamp } = updateData;

          // Check if this is a NEW update (not an old one being processed again)
          const updateTime = new Date(timestamp);
          const now = Date.now();
          const timeDiff = now - timestamp;
          const timeDiffMinutes = Math.floor(timeDiff / (60 * 1000));
          
          console.log(`📥 [LocationUpdate] Found pending update from ${timeDiffMinutes} minutes ago`);

          // Update location in AuthContext if automatic sharing is enabled
          if (automaticLocationSharing) {
            // Save location without updating timestamp (timestamp will be updated after successful API call)
            await setUserLocationWithoutTimestamp(latitude, longitude, zipCode || '');
            console.log(`✅ [LocationUpdate] Location saved at ${new Date().toLocaleTimeString()}`);
            
            // Send location update to TMS API (automatic update every 10 minutes)
            // Get current status and zip from state/AsyncStorage
            // For automatic updates, use current date/time (not the date field)
            const currentStatus = status;
            const currentZip = zipCode || zip;
            
            if (currentStatus && currentZip) {
              console.log('[FinalVerify] Sending automatic location update to TMS API...');
              // For automatic updates, we pass empty string for date - sendLocationUpdate will use current date/time
              const success = await sendLocationUpdate(
                latitude,
                longitude,
                currentZip,
                currentStatus,
                '' // Empty string - function will use current date/time
              );
              
              if (success) {
                // Update lastLocationUpdate in AuthContext only after successful API call
                await updateUserLocation(latitude, longitude, currentZip);
              }
            } else {
              console.warn('[FinalVerify] Skipping automatic location update - missing required fields:', {
                status: currentStatus,
                zip: currentZip,
              });
            }
            
            // Update map and state
            const updateRegion: Region = {
              latitude,
              longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            };

            setUserLocation({ latitude, longitude });
            if (zipCode) {
              setZip(zipCode);
            }

            // Update address label from reverse geocode
            try {
              const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
              if (geo) {
                setLocationLabel(formatAddressLabel(geo));
              }
            } catch {}

            mapRef.current?.animateToRegion(updateRegion, 1000);
          }

          // Clear pending update
          await AsyncStorage.removeItem('@pending_location_update');
        }
      } catch (error) {
        console.error('❌ [FinalVerify] Failed to process location update:', error);
      }
    };

    // Check every 15 seconds for updates
    const interval = setInterval(checkForLocationUpdates, 15000);
    checkForLocationUpdates(); // Check immediately

    return () => clearInterval(interval);
  }, [automaticLocationSharing, updateUserLocation, sendLocationUpdate, status, zip, date]);

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
      const success = await sendLocationUpdate(
        currentLocation.latitude,
        currentLocation.longitude,
        zip,
        status,
        date
      );

      if (success) {
        // Update lastLocationUpdate in AuthContext
        await updateUserLocation(
          currentLocation.latitude,
          currentLocation.longitude,
          zip
        );
        
        // Show success message
        setUpdateSuccessMessage('Location data sent successfully');
        setTimeout(() => {
          setUpdateSuccessMessage(null);
        }, 3000);
      } else {
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

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      
      // Reverse geocode to get ZIP code
      let postalCode = '';
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverseGeocode && reverseGeocode.length > 0) {
          postalCode = reverseGeocode[0].postalCode || '';
          if (postalCode) {
            setZip(postalCode);
          }
          setLocationLabel(formatAddressLabel(reverseGeocode[0]));
        }
      } catch (geoError) {
        console.warn('Failed to get ZIP code from geocoding:', geoError);
      }
      
      // Save location and ZIP to AuthContext only if automatic location sharing is enabled
      // If disabled, only update local state for map display, without saving time
      if (automaticLocationSharing) {
        const finalZipCode = postalCode || zip;
        
        // Save location without updating timestamp (timestamp will be updated after successful API call)
        if (finalZipCode) {
          await setUserLocationWithoutTimestamp(latitude, longitude, finalZipCode);
        } else {
          // Save location even if ZIP code is not available
          await setUserLocationWithoutTimestamp(latitude, longitude, '');
        }
        
        // Send location update to TMS API
        if (status && finalZipCode) {
          console.log('[FinalVerify] Sending location update to TMS API after Share my location...');
          const success = await sendLocationUpdate(
            latitude,
            longitude,
            finalZipCode,
            status,
            '' // Empty string - function will use current date/time
          );
          
          if (success) {
            // Update lastLocationUpdate timestamp only after successful API call
            if (finalZipCode) {
              await updateUserLocation(latitude, longitude, finalZipCode);
            } else {
              await updateUserLocation(latitude, longitude, '');
            }
          }
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
      // Keep lastLocationUpdate to show when the last update was performed
      await stopBackgroundLocationTracking();
      await clearLocationData(); // Clears userLocation and userZipCode, but keeps lastLocationUpdate
    } else {
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

          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          currentLatitude = pos.coords.latitude;
          currentLongitude = pos.coords.longitude;
          
          // Reverse geocode to get ZIP code
          try {
            const reverseGeocode = await Location.reverseGeocodeAsync({ latitude: currentLatitude, longitude: currentLongitude });
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
      
      // Save location without updating timestamp (timestamp will be updated after successful API call)
      await setUserLocationWithoutTimestamp(currentLatitude, currentLongitude, currentZipCode);
      
      // Send location update to TMS API
      if (status && currentZipCode) {
        console.log('[FinalVerify] Sending location update to TMS API after enabling auto-sharing...');
        const success = await sendLocationUpdate(
          currentLatitude,
          currentLongitude,
          currentZipCode,
          status,
          '' // Empty string - function will use current date/time
        );
        
        if (success) {
          // Update lastLocationUpdate timestamp only after successful API call
          await updateUserLocation(currentLatitude, currentLongitude, currentZipCode);
        }
      }
      
      // Start background location tracking
      await startBackgroundLocationTracking();
    }
  };

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
          <TouchableOpacity style={styles.shareButton} onPress={handleShareLocation}>
                <Text style={styles.buttonText}>Share my location</Text>
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
     paddingBottom: 80,
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
    marginTop: rem(-16),
    marginBottom: rem(20),
    paddingLeft: rem(4),
  },
  lastUpdateText: {
    fontSize: fp(13),
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
