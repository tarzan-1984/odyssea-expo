import React, { useEffect, useState, useRef } from 'react';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { fonts } from '@/lib';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { OnlineStatusProvider } from '@/context/OnlineStatusContext';
import { useLocationPermission } from '@/hooks/useLocationPermission';
import LocationPermissionModal from '@/components/common/LocationPermissionModal';
// Import background location task to register it
import '@/tasks/locationTask';
// Ensure notifications handler is always registered regardless of auth flow
import '@/services/NotificationsService';
import PushTokenRegistrar from '@/components/notifications/PushTokenRegistrar';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Suppress non-critical errors from expo-keep-awake in development
if (__DEV__) {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const errorMessage = args[0]?.toString() || '';
    // Ignore "Unable to activate keep awake" errors - they're non-critical
    if (errorMessage.includes('Unable to activate keep awake')) {
      return; // Silently ignore this error
    }
    originalError.apply(console, args);
  };
}

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
    requestForegroundPermission,
    requestBackgroundPermission,
    openAppSettings,
    openLocationSettings,
  } = useLocationPermission();
  const lastCheckedSegment = useRef<string>('');
  const hasRequestedPermissionRef = useRef(false);
  
  // Handle navigation from push notifications
  useEffect(() => {
    const { eventBus, AppEvents } = require('@/services/EventBus');
    const handleNavigateToChat = (data: { chatRoomId: string }) => {
      if (authState.isAuthenticated && data.chatRoomId) {
        // Use replace instead of push to avoid back navigation issues
        router.replace(`/chat/${data.chatRoomId}` as any);
      }
    };
    
    eventBus.on(AppEvents.NavigateToChat, handleNavigateToChat);
    return () => {
      eventBus.off(AppEvents.NavigateToChat, handleNavigateToChat);
    };
  }, [authState.isAuthenticated, router]);

  // Check for pending navigation from notification when app opens (if app was closed)
  useEffect(() => {
    if (!isReady || !authState.isAuthenticated) return;

    const checkPendingNavigation = async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const pendingChatId = await AsyncStorage.getItem('@pending_chat_navigation');
        
        if (pendingChatId) {
          // Clear the pending navigation
          await AsyncStorage.removeItem('@pending_chat_navigation');
          // Navigate to chat
          router.replace(`/chat/${pendingChatId}` as any);
        }
      } catch (error) {
        console.error('[RootLayoutNav] Failed to check pending navigation:', error);
      }
    };

    checkPendingNavigation();
  }, [isReady, authState.isAuthenticated, router]);

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
        router.replace('/final-verify');
      }
    } else if (!authState.isAuthenticated && (inTabsGroup || currentPath === '(auth)/final-verify')) {
      // User is not signed in but viewing protected screens → redirect to auth
      router.replace('/(auth)');
    }
  }, [authState.isAuthenticated, segments, isReady, router]);

  // Request permission when needed (if not already requested)
  // This ensures the permission appears in app settings even if user denies
  useEffect(() => {
    if (!isReady) return;
    
    const shouldShowModal = isLocationEnabled === false || backgroundPermissionGranted === false;
    
    if (shouldShowModal && !hasRequestedPermissionRef.current) {
      const requestPermission = async () => {
        try {
          // Check current permission status
          const foregroundStatus = await Location.getForegroundPermissionsAsync();
          
          // If permission was never requested (status is 'undetermined'), request it now
          // This will show the system dialog and create the entry in app settings
          if (foregroundStatus.status === 'undetermined') {
            hasRequestedPermissionRef.current = true;
            await requestForegroundPermission();
            await requestBackgroundPermission();
            await checkBackgroundPermission();
          } else {
            // Permission was already requested (granted or denied)
            // Entry should already exist in app settings
            hasRequestedPermissionRef.current = true;
          }
        } catch (error) {
          console.error('❌ [RootLayoutNav] Failed to request permission:', error);
        }
      };
      
      requestPermission();
    }
  }, [isReady, isLocationEnabled, backgroundPermissionGranted, requestForegroundPermission, requestBackgroundPermission, checkBackgroundPermission]);

  // Show modal if location services are disabled or background access is not granted
  const FORCE_SHOW_MODAL = false;
  const showPermissionModal = FORCE_SHOW_MODAL || (isLocationEnabled === false || backgroundPermissionGranted === false);

  if (!isReady) {
    return null; // Keep splash screen visible until auth complete
  }
  
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
          {/* Globally ensure push token is generated/registered for logged-in users too */}
          <PushTokenRegistrar />
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
