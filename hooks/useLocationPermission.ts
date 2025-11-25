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

  // Request foreground permission (if not already granted)
  // This ensures the permission is requested at least once, so it appears in app settings
  const requestForegroundPermission = useCallback(async () => {
    try {
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      if (foregroundStatus.status === 'granted') {
        return true; // Already granted
      }
      
      // Request foreground permission
      // This will show the system dialog on first request
      // If user denies, they can still change it later in app settings
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('❌ [useLocationPermission] Failed to request foreground permission:', error);
      return false;
    }
  }, []);

  // Request background permission (if foreground is already granted)
  const requestBackgroundPermission = useCallback(async () => {
    try {
      // First ensure foreground permission is granted
      const foregroundGranted = await requestForegroundPermission();
      if (!foregroundGranted) {
        return false;
      }

      // Request background permission
      // On iOS: This will show a dialog asking for "Always" permission
      // On Android: This will show a dialog asking for "Allow all the time" permission
      const { status } = await Location.requestBackgroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('❌ [useLocationPermission] Failed to request background permission:', error);
      return false;
    }
  }, [requestForegroundPermission]);

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
        // Note: If user denied, they can still change it in app settings
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
        // Note: User can change this in app settings even if they denied initially
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
      // iOS: Open app settings where user can find Location permission
      // Note: On iOS, there's no direct URL scheme to open Location Services for a specific app
      // The app-settings: scheme opens the app's settings page where Location permission should be visible
      // If the permission section is not visible, it means the app hasn't requested permission yet
      Linking.openURL('app-settings:').catch((err) => {
        console.error('❌ [useLocationPermission] Failed to open iOS app settings:', err);
        // Fallback: Try to open general Location Services (may not work on iOS 13+)
        Linking.openURL('App-Prefs:root=Privacy&path=LOCATION').catch((fallbackErr) => {
          console.error('❌ [useLocationPermission] Failed to open iOS location settings:', fallbackErr);
        });
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
      // iOS: Try multiple methods to open location settings
      // Method 1: Try App-Prefs (may not work on iOS 10+)
      Linking.openURL('App-Prefs:root=Privacy&path=LOCATION').catch(() => {
        // Method 2: Try prefs: (alternative format, may not work)
        Linking.openURL('prefs:root=Privacy&path=LOCATION').catch(() => {
          // Method 3: Fallback to app settings
          // User will need to navigate to Settings → Privacy & Security → Location Services manually
          Linking.openURL('app-settings:').catch(() => {
            console.error('❌ [useLocationPermission] Failed to open iOS location settings');
          });
        });
      });
    } else {
      // Android: Open system location settings directly
      // Use Android Intent to open location source settings
      Linking.openURL('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
        // Fallback: Try to open general settings
        Linking.openSettings().catch(() => {
          console.error('❌ [useLocationPermission] Failed to open Android location settings');
        });
      });
    }
  }, []);

  return {
    backgroundPermissionGranted,
    isLocationEnabled,
    checkBackgroundPermission,
    checkLocationEnabled,
    requestForegroundPermission,
    requestBackgroundPermission,
    openAppSettings,
    openLocationSettings,
  };
};

