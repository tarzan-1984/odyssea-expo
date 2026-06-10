import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

const hiddenStackHeaderOptions = {
  headerShown: false,
  headerTitle: '',
  headerBackTitle: '',
  headerBackTitleVisible: false,
  headerBackVisible: false,
  ...(Platform.OS === 'ios'
    ? { headerBackButtonDisplayMode: 'minimal' as const }
    : {}),
};

/**
 * Tabs Layout
 * Bottom navigation for main app screens
 * Uses a hidden Stack so every screen keeps its custom header only.
 */
export default function TabsLayout() {
  return <Stack screenOptions={hiddenStackHeaderOptions} />;
}
