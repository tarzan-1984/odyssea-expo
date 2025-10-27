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
