import { useState, useCallback, useEffect } from 'react';
import { Platform, Linking, AppState } from 'react-native';
import * as Location from 'expo-location';

export const useLocationPermission = () => {
  const [backgroundPermissionGranted, setBackgroundPermissionGranted] = useState<boolean | null>(null);
  const [isLocationEnabled, setIsLocationEnabled] = useState<boolean | null>(null);

  // Check if location services are enabled on the device
  // Works the same on iOS and Android
  const checkLocationEnabled = useCallback(async () => {
    try {
      const providerStatus = await Location.getProviderStatusAsync();
      // locationServicesEnabled works identically on iOS and Android
      // Returns true if location services (GPS/WiFi/Cell) are enabled system-wide
      const enabled = providerStatus.locationServicesEnabled;
      setIsLocationEnabled((prev) => prev !== enabled ? enabled : prev);
      return enabled;
    } catch (error) {
      console.error('❌ [useLocationPermission] Failed to check location enabled:', error);
      setIsLocationEnabled((prev) => prev !== false ? false : prev);
      return false;
    }
  }, []);

  // Check background location permission
  // Works the same on iOS and Android - expo-location provides unified API
  const checkBackgroundPermission = useCallback(async () => {
    try {
      // Step 1: Check if location services are enabled on device (iOS/Android)
      // This is platform-agnostic - works the same way on both platforms
      const locationEnabled = await checkLocationEnabled();
      if (!locationEnabled) {
        // Location services disabled - user needs to enable it in device settings
        // We track this separately but continue checking permissions
      }

      // Step 2: Check foreground permission
      // iOS: Checks NSLocationWhenInUseUsageDescription permission
      // Android: Checks ACCESS_FINE_LOCATION or ACCESS_COARSE_LOCATION
      // API is the same - expo-location handles platform differences
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      if (foregroundStatus.status !== 'granted') {
        // No foreground permission - user must grant it first
        // This is required before background permission can be requested
        setBackgroundPermissionGranted((prev) => prev !== false ? false : prev);
        return false;
      }

      // Step 3: Check background permission
      // iOS: Checks if "Always" (NSLocationAlwaysAndWhenInUseUsageDescription) is granted
      // Android: Checks if "Allow all the time" (ACCESS_BACKGROUND_LOCATION) is granted
      // Both platforms return 'granted' status when full background access is allowed
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();
      
      if (backgroundStatus.status !== 'granted') {
        // Background permission not granted
        // iOS: User selected "While Using" instead of "Always"
        // Android: User selected "Allow only while using the app" instead of "Allow all the time"
        setBackgroundPermissionGranted((prev) => prev !== false ? false : prev);
        return false;
      }

      // All checks passed!
      // On iOS: "Always" location permission granted
      // On Android: "Allow all the time" location permission granted
      setBackgroundPermissionGranted((prev) => prev !== true ? true : prev);
      return true;
    } catch (error) {
      console.error('❌ [useLocationPermission] Failed to check permissions:', error);
      setBackgroundPermissionGranted((prev) => prev !== false ? false : prev);
      return false;
    }
  }, [checkLocationEnabled]);

  // Check location status when app comes to foreground (user might have enabled/disabled location)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Wait a bit for settings to apply
        setTimeout(() => {
          checkLocationEnabled();
          checkBackgroundPermission();
        }, 500);
      }
    });

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [checkLocationEnabled, checkBackgroundPermission]);

  // Open app settings for location permissions
  const openAppSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      // iOS: Opens directly to app settings where user can change location permission
      Linking.openURL('app-settings:').catch((err) => {
        console.error('❌ [useLocationPermission] Failed to open iOS settings:', err);
      });
    } else {
      // Android: Open app-specific settings (not general system settings)
      // This will open the app's permission settings where user can grant "Always" permission
      Linking.openSettings().catch((err) => {
        console.error('❌ [useLocationPermission] Failed to open Android settings:', err);
      });
    }
  }, []);

  // Open device location settings (for when location services are disabled)
  const openLocationSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      // iOS: Try to open general location settings (this might not work on newer iOS versions)
      // Falls back to app settings if the specific path doesn't work
      Linking.openURL('App-Prefs:root=Privacy&path=LOCATION').catch(() => {
        // Fallback: Open app settings where user can also access location
        Linking.openURL('app-settings:').catch(() => {});
      });
    } else {
      // Android: Open general settings (Linking.openSettings opens app settings on Android)
      // For location settings, we'll open general settings and user navigates to Location
      Linking.openSettings().catch(() => {
        console.error('❌ [useLocationPermission] Failed to open Android settings');
      });
    }
  }, []);

  return {
    backgroundPermissionGranted,
    isLocationEnabled,
    checkBackgroundPermission,
    checkLocationEnabled,
    openAppSettings,
    openLocationSettings,
  };
};

