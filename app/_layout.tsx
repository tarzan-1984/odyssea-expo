import React, { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { fonts } from '@/lib';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

/**
 * Root Layout Component
 * Handles font loading and navigation structure
 */
export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Mulish-200': require('@/assets/fonts/Mulish-ExtraLight.ttf'),
    'Mulish-300': require('@/assets/fonts/Mulish-Light.ttf'),
    'Mulish-400': require('@/assets/fonts/Mulish-Regular.ttf'),
    'Mulish-500': require('@/assets/fonts/Mulish-Medium.ttf'),
    'Mulish-600': require('@/assets/fonts/Mulish-SemiBold.ttf'),
    'Mulish-700': require('@/assets/fonts/Mulish-Bold.ttf'),
    'Mulish-800': require('@/assets/fonts/Mulish-ExtraBold.ttf'),
    'Mulish-900': require('@/assets/fonts/Mulish-Black.ttf'),
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
