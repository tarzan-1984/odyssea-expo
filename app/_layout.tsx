import React, { useEffect, useState, useRef } from 'react';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, StyleSheet, LogBox } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { OnlineStatusProvider } from '@/context/OnlineStatusContext';
import { useLocationPermission } from '@/hooks/useLocationPermission';
import LocationPermissionModal from '@/components/common/LocationPermissionModal';
// Import background location task to register it
import '@/tasks/locationTask';
import { flushLocationQueue } from '@/tasks/locationTask';
// Ensure notifications handler is always registered regardless of auth flow
import '@/services/NotificationsService';
import PushTokenRegistrar from '@/components/notifications/PushTokenRegistrar';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Suppress non-critical, known Expo dev warnings that do not affect app behavior
if (__DEV__) {
  LogBox.ignoreLogs([
    'Unable to activate keep awake',
    'View not attached to window manager', // LogBox dialog error
  ]);
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const ENABLE_PERMISSIONS_ONBOARDING = false; // temporary disable permissions onboarding modal

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
      // Check install timestamp FIRST, before loading auth data
      // This ensures all data is cleared on new installation before auth is loaded
      try {
        // Get current timestamp in seconds (Unix timestamp)
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        // Check saved install timestamp
        const savedInstallTimestamp = await AsyncStorage.getItem('@app_install_timestamp');
        
        // If timestamp is missing - this is a new installation
        if (!savedInstallTimestamp) {
          console.log('🔄 [App] First install detected, clearing all data...');
          
          // Complete list of all AsyncStorage keys to clear
          const allKeysToClear = [
            // Auth & User
            '@user_external_id',
            '@user_access_token',
            '@user_id',
            '@user_status',
            '@user_zip',
            '@user_date',
            '@user_location',
            '@pending_location_update',
            '@location_last_update',
            '@location_update_queue',
            
            // App Settings
            '@odyssea_app_settings',
            '@app_first_launch',
            '@app_version',
            '@permissions_onboarding_completed',
            
            // Navigation & Chat
            '@pending_chat_navigation',
            '@chat_opened_rooms',
          ];
          
          // Clear all specified keys
          await AsyncStorage.multiRemove(allKeysToClear);
          console.log('✅ [App] Cleared AsyncStorage keys:', allKeysToClear);
          
          // Clear messages cache
          try {
            const { messagesCacheService } = await import('@/services/MessagesCacheService');
            await messagesCacheService.clearAllMessages();
            console.log('✅ [App] Cleared messages cache');
          } catch (e) {
            console.warn('⚠️ [App] Failed to clear messages cache:', e);
          }
          
          // Clear chat cache
          try {
            const { chatCacheService } = await import('@/services/ChatCacheService');
            await chatCacheService.clearCache();
            console.log('✅ [App] Cleared chat cache');
          } catch (e) {
            console.warn('⚠️ [App] Failed to clear chat cache:', e);
          }
          
          // Clear secure storage (tokens, user, saved email/password)
          try {
            const { secureStorage } = await import('@/utils/secureStorage');
            await secureStorage.deleteItemAsync('accessToken');
            await secureStorage.deleteItemAsync('refreshToken');
            await secureStorage.deleteItemAsync('user');
            await secureStorage.deleteItemAsync('userLocation');
            await secureStorage.deleteItemAsync('expoPushToken');
            await secureStorage.deleteItemAsync('savedEmail');
            await secureStorage.deleteItemAsync('savedPassword');
            console.log('✅ [App] Cleared secure storage (including saved email/password)');
          } catch (e) {
            console.warn('⚠️ [App] Failed to clear secure storage:', e);
          }
          
          // Clear Zustand store (in-memory)
          try {
            const { useChatStore } = await import('@/stores/chatStore');
            useChatStore.getState().reset();
            console.log('✅ [App] Cleared chat store');
          } catch (e) {
            console.warn('⚠️ [App] Failed to clear chat store:', e);
          }
          
          // Clear log file
          try {
            const { fileLogger } = await import('@/utils/fileLogger');
            await fileLogger.clearLogs();
            console.log('✅ [App] Cleared log file');
          } catch (e) {
            console.warn('⚠️ [App] Failed to clear logs:', e);
          }
          
          // Save install timestamp
          await AsyncStorage.setItem('@app_install_timestamp', currentTimestamp.toString());
          console.log(`✅ [App] Saved install timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toLocaleString()})`);
        } else {
          const savedTimestamp = parseInt(savedInstallTimestamp, 10);
          const daysSinceInstall = Math.floor((currentTimestamp - savedTimestamp) / 86400);
          console.log(`✅ [App] Install timestamp found: ${savedTimestamp} (${daysSinceInstall} days ago)`);
          console.log(`✅ [App] No cleanup needed - app was installed on ${new Date(savedTimestamp * 1000).toLocaleString()}`);
        }
      } catch (error) {
        console.error('❌ [App] Error checking install timestamp:', error);
      }
      
      // Now load stored auth data (after potential cleanup)
      await loadStoredAuth();
      // Initial checks for location services and background permission
      await checkLocationEnabled();
      await checkBackgroundPermission();

      setIsReady(true);
    };
    
    initAuth();
  }, [loadStoredAuth, checkLocationEnabled, checkBackgroundPermission]);

  // Flush location queue when app becomes ready and authenticated
  useEffect(() => {
    if (!isReady || !authState.isAuthenticated) return;
    
    // Delay flush to ensure app is fully initialized
    const timer = setTimeout(() => {
      flushLocationQueue().catch((error) => {
        console.warn('[RootLayoutNav] Failed to flush location queue:', error);
      });
    }, 1000); // Wait 1 second after app is ready
    
    return () => clearTimeout(timer);
  }, [isReady, authState.isAuthenticated]);

  // Also flush queue when app becomes active (comes from background)
  useEffect(() => {
    if (!isReady || !authState.isAuthenticated) return;
    
    const { AppState } = require('react-native');
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // App became active - flush queue immediately
        console.log('[RootLayoutNav] App became active, flushing location queue...');
        flushLocationQueue().catch((error) => {
          console.warn('[RootLayoutNav] Failed to flush location queue:', error);
        });
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, [isReady, authState.isAuthenticated]);

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
          // Check current permission status without triggering request
          const foregroundStatus = await Location.getForegroundPermissionsAsync();
          const foreground = foregroundStatus.status === 'granted';
          
          // If no foreground permission, request it
          if (!foreground) {
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
          hasRequestedPermissionRef.current = true; // Prevent infinite retries
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
      
      {/* Legacy location permission modal - shows if critical permissions missing */}
      <LocationPermissionModal 
        visible={ENABLE_PERMISSIONS_ONBOARDING && showPermissionModal && !showOnboarding} 
        isLocationEnabled={isLocationEnabled}
        onOpenAppSettings={openAppSettings}
        onOpenLocationSettings={openLocationSettings}
      />
      
      {/**
       * TEMP DISABLED FOR SIMULATOR
       * UI blocking overlay is disabled to allow development without background permission.
       * IMPORTANT: Re-enable this block before shipping or testing on real devices.
       */}
      {ENABLE_PERMISSIONS_ONBOARDING && (isLocationEnabled === false || !backgroundPermissionGranted) && !showOnboarding && (
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
