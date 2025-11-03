import React, { useEffect, useState, useRef } from 'react';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { fonts } from '@/lib';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { OnlineStatusProvider } from '@/context/OnlineStatusContext';
import { useLocationPermission } from '@/hooks/useLocationPermission';
import LocationPermissionModal from '@/components/common/LocationPermissionModal';
// Import background location task to register it
import '@/tasks/locationTask';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

/**
 * Navigation Component
 * Handles auth-based navigation and protected routes
 */
function RootLayoutNav() {
  const { authState, loadStoredAuth } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const { 
    backgroundPermissionGranted,
    isLocationEnabled,
    checkBackgroundPermission,
    checkLocationEnabled,
    openAppSettings,
    openLocationSettings,
  } = useLocationPermission();
  const lastCheckedSegment = useRef<string>('');

  // Load stored auth and check permissions on mount (first load)
  useEffect(() => {
    const initAuth = async () => {
      await loadStoredAuth();
      // Initial checks for location services and background permission
      await checkLocationEnabled();
      await checkBackgroundPermission();
      setIsReady(true);
    };
    
    initAuth();
  }, [loadStoredAuth, checkLocationEnabled, checkBackgroundPermission]);

  // Check permissions when navigating between screens (only when segment actually changes)
  useEffect(() => {
    if (!isReady) return;
    
    const currentSegment = segments.join('/');
    // Only check if segment actually changed (not just a re-render)
    if (currentSegment !== lastCheckedSegment.current) {
      lastCheckedSegment.current = currentSegment;
      // Re-check permission when the route segment actually changes
      checkBackgroundPermission();
    }
  }, [segments, isReady, checkBackgroundPermission]);

  // Redirect based on auth state
  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const currentPath = segments.join('/');

    if (authState.isAuthenticated) {
      // User is authenticated
      if (inAuthGroup && currentPath !== '(auth)/final-verify') {
        // Authenticated but on auth screens (except final-verify) → redirect to final-verify
        console.log('🔄 [Navigation] User authenticated, redirecting to final-verify');
        router.replace('/final-verify');
      }
    } else if (!authState.isAuthenticated && (inTabsGroup || currentPath === '(auth)/final-verify')) {
      // User is not signed in but viewing protected screens → redirect to auth
      console.log('🔄 [Navigation] User not authenticated, redirecting to auth');
      router.replace('/(auth)');
    }
  }, [authState.isAuthenticated, segments, isReady, router]);

  if (!isReady) {
    return null; // Keep splash screen visible until auth complete
  }

  // Show modal if location services are disabled or background access is not granted
  const FORCE_SHOW_MODAL = false;
  const showPermissionModal = FORCE_SHOW_MODAL || (isLocationEnabled === false || backgroundPermissionGranted === false);
  
  // For testing specific scenarios:
  // FORCE_SHOW_MODAL = true → Shows permission modal immediately
  // OR disable location in device settings → Shows "Location Services Disabled"
  // OR change permission to "While Using" → Shows "Location Permission Required"

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      
      {/**
       * TEMP DISABLED FOR SIMULATOR
       * Location Permission Modal is disabled to allow development in iOS Simulator.
       * IMPORTANT: Re-enable this block before shipping or testing on real devices.
       */}
      <LocationPermissionModal 
        visible={showPermissionModal} 
        isLocationEnabled={isLocationEnabled}
        onOpenAppSettings={openAppSettings}
        onOpenLocationSettings={openLocationSettings}
      />
      
      {/**
       * TEMP DISABLED FOR SIMULATOR
       * UI blocking overlay is disabled to allow development without background permission.
       * IMPORTANT: Re-enable this block before shipping or testing on real devices.
       */}
      {(isLocationEnabled === false || !backgroundPermissionGranted) && (
        <View style={styles.blockingOverlay} pointerEvents="auto">
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
      )}
    </>
  );
}

/**
 * Root Layout Component
 * Handles font loading and navigation structure
 */
export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Mulish-Regular': require('@/assets/fonts/Mulish-Regular.ttf'),
    'Mulish-Bold': require('@/assets/fonts/Mulish-Bold.ttf'),
    'Mulish-SemiBold': require('@/assets/fonts/Mulish-SemiBold.ttf'),
    'Mulish-Medium': require('@/assets/fonts/Mulish-Medium.ttf'),
    'Mulish-Light': require('@/assets/fonts/Mulish-Light.ttf'),
  });

  useEffect(() => {
    if (error) {
      console.error('Error loading fonts:', error);
      SplashScreen.hideAsync();
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <WebSocketProvider>
        <OnlineStatusProvider>
          <RootLayoutNav />
        </OnlineStatusProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  blockingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
});
