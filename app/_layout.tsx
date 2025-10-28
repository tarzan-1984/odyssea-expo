import React, { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { fonts } from '@/lib';
import { AuthProvider, useAuth } from '@/context/AuthContext';

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

  // Load stored auth on mount
  useEffect(() => {
    const initAuth = async () => {
      await loadStoredAuth();
      setIsReady(true);
    };
    
    initAuth();
  }, [loadStoredAuth]);

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
    return null; // Keep splash screen visible
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
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
      <RootLayoutNav />
    </AuthProvider>
  );
}
