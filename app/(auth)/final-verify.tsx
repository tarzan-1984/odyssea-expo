import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, TextInput, Image } from 'react-native';
import MapView, { Region, Marker } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem, typography } from "@/lib";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import StatusSelect, { StatusValue } from '@/components/common/StatusSelect';
import PinMapIcon from '@/icons/PinMapIcon';
import CarMapMarker from '@/icons/CarMapMarker';
import { useAuth } from '@/context/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL } from '@/tasks/locationTask';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * FinalVerifyScreen - Final verification/profile screen
 * User profile with location sharing and status update
 * Based on the design with map, location settings, status update, and bottom navigation
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState, updateUserLocation, clearUserLocation } = useAuth();
  const { automaticLocationSharing, setAutomaticLocationSharing } = useAppSettings();
  const user = authState.user;
  const firstName = user?.firstName || 'User';
  const lastName = user?.lastName || '';
  const initials = `${firstName[0]}${lastName ? lastName[0] : firstName[0]}`.toUpperCase();
  const profilePhoto = user?.profilePhoto || user?.avatar || null;
  const [status, setStatus] = useState<StatusValue>('available');
  const [zip, setZip] = useState('');
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const [date, setDate] = useState(formatDate(new Date()));
  
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
  const mapRef = useRef<MapView>(null);
  const initialRegion: Region = {
    latitude: 39.2904, // default Baltimore
    longitude: -76.6122,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isLocationReady, setIsLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Start background location tracking
  const startBackgroundLocationTracking = useCallback(async () => {
    try {
      // Check current permission status first
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      
      if (foregroundStatus.status !== 'granted') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          alert('Для работы автоматического обновления локации нужно разрешить использование геолокации в настройках приложения.');
          return;
        }
      }

      // Request background permissions
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        alert('Для автоматического обновления локации нужно разрешить "Всегда" использовать геолокацию.\n\nНастройки → Конфиденциальность → Службы геолокации → odysseaexpo → Выберите "Всегда"');
        return;
      }

      // ALWAYS stop task first to ensure clean restart with new interval
      const isTaskDefined = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isTaskDefined) {
        console.log('🔄 [BackgroundTracking] Task already running, FORCE stopping...');
        try {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          // Wait longer to ensure task fully stops
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Double-check it's stopped
          const stillRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (stillRunning) {
            console.warn('⚠️ [BackgroundTracking] Task still running, forcing stop again...');
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (stopError) {
          console.error('❌ [BackgroundTracking] Error stopping task:', stopError);
        }
      }
      
      // Start location updates with current interval setting
      const intervalInMinutes = LOCATION_UPDATE_INTERVAL / (60 * 1000);
      console.log(`📍 [BackgroundTracking] Starting with interval: ${intervalInMinutes} minutes (${LOCATION_UPDATE_INTERVAL}ms)`);
      console.log(`⏰ [BackgroundTracking] Current time: ${new Date().toLocaleTimeString()}`);
      
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        // distanceInterval: минимальное расстояние (в метрах) для нового обновления
        // ПОВЕДЕНИЕ НА iOS И Android:
        // - iOS: distanceInterval=0 позволяет получать обновления при любом движении
        //   (но timeInterval может игнорироваться системой)
        // - Android: distanceInterval=0 работает аналогично
        //   (но Android 8.0+ ограничивает частоту обновлений системой)
        // РЕШЕНИЕ: Используем 0 для получения всех обновлений от системы,
        // но фильтруем их по времени вручную в locationTask.ts (одинаково на iOS и Android)
        distanceInterval: 0, // Принимаем все обновления, фильтруем по времени сами
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
      const isTaskDefined = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isTaskDefined) {
        console.log('🛑 [BackgroundTracking] Stopping task...');
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        // Clear last update timestamp
        await AsyncStorage.removeItem('@last_location_update_timestamp');
        // Wait to ensure task is fully stopped
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ [BackgroundTracking] Task stopped');
      }
    } catch (error) {
      console.error('❌ [LocationTask] Failed to stop background tracking:', error);
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
    }
  }, [authState.userLocation, authState.userZipCode, automaticLocationSharing, startBackgroundLocationTracking]); // Run when location data is available

  // Check for background location updates
  useEffect(() => {
    const checkForLocationUpdates = async () => {
      try {
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
            await updateUserLocation(latitude, longitude, zipCode || '');
            console.log(`✅ [LocationUpdate] Location updated at ${new Date().toLocaleTimeString()}`);
            
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
  }, [automaticLocationSharing, updateUserLocation]);

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

  const handleUpdateStatus = () => {
    // TODO: Implement status update
    console.log('Update status:', { status, zip, date });
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
        }
      } catch (geoError) {
        console.warn('Failed to get ZIP code from geocoding:', geoError);
      }
      
      // Save location and ZIP to AuthContext only if automatic location sharing is enabled
      // If disabled, only update local state for map display, without saving time
      if (automaticLocationSharing) {
        if (postalCode) {
          await updateUserLocation(latitude, longitude, postalCode);
        } else {
          // Save location even if ZIP code is not available
          await updateUserLocation(latitude, longitude, '');
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

  const handleStatusChange = (newStatus: StatusValue) => {
    setStatus(newStatus);
  };

  const handleLocationToggleChange = async (value: boolean) => {
    await setAutomaticLocationSharing(value);
    
    if (!value) {
      // Stop background tracking and clear saved location data
      // This also clears lastLocationUpdate and all location-related data
      await stopBackgroundLocationTracking();
      await clearUserLocation(); // Clears userLocation, userZipCode, and lastLocationUpdate
    } else {
      // Start background tracking if location is already available
      if (userLocation) {
        await startBackgroundLocationTracking();
      }
    }
  };

  return (
    <View style={styles.screenWrap}>
      {/* Paint status bar area exactly to safe inset height */}
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <View style={styles.container}>
        
        {/* Header with time and profile */}
        <View style={styles.header}>
          <Text style={styles.welcome} numberOfLines={2}>
            Welcome to application, {firstName}
          </Text>
          
          <View style={styles.profileIcon}>
            {profilePhoto ? (
              <Image 
                source={{ uri: profilePhoto }} 
                style={styles.profileImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.profileText}>{initials}</Text>
            )}
          </View>
        </View>
        
        <View style={styles.contentWrapper}>
            {/* Map section */}
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={initialRegion}
                showsUserLocation={false}
                showsMyLocationButton={false}
                scrollEnabled
                zoomEnabled
                rotateEnabled
                pitchEnabled
                showsCompass
              >
                {/* Real marker attached to map at user's coordinates */}
                {userLocation && (
                  <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
                    <CarMapMarker width={40} height={40} />
                  </Marker>
                )}
              </MapView>
              {/* Until location is ready, show center overlay with blur */}
              {!isLocationReady && (
                <>
                  <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={styles.mapPin} pointerEvents="none">
                    <PinMapIcon />
                  </View>
                </>
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
                
                <Switch
                  value={automaticLocationSharing}
                  onValueChange={handleLocationToggleChange}
                  trackColor={{ false: '#E8EAFD', true: '#E8EAFD' }}
                  thumbColor={automaticLocationSharing ? colors.primary.blue : colors.primary.blue}
                />
              </View>
              
              {/* Last update time */}
              {authState.lastLocationUpdate && authState.userLocation && (
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
                  onChangeText={setZip}
                  keyboardType="number-pad"
                  placeholder="Enter ZIP"
                  placeholderTextColor={colors.primary.blue}
                  accessibilityLabel="ZIP code"
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
            </View>
        </View>
      </View>
      
      {/* Bottom Navigation */}
      <BottomNavigation />
    </View>
  );
}

 const styles = StyleSheet.create({
   screenWrap: {
     flex: 1,
     position: "relative"
   },
   settingsLabel: {
     fontSize: fp(15),
     width: '25%',
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
    fontSize: fp(22),
    fontFamily: fonts["700"],
    lineHeight: fp(28),
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
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(24),
  },
  switchLabel: {
    fontSize: fp(15),
    color: colors.primary.blue,
    fontFamily: fonts["500"],
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
    paddingHorizontal: 16,
    height: rem(40),
    backgroundColor: 'rgba(232, 234, 253, 1)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: "center",
  },
  textInput: {
    color: colors.primary.blue,
    fontSize: fp(15),
    fontFamily: fonts["400"],
    flex: 1,
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
    fontSize: fp(16),
    fontFamily: fonts["500"],
  },
});
