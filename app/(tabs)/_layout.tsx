import { Stack } from 'expo-router';
import React from 'react';

/**
 * Tabs Layout
 * Bottom navigation for main app screens
 * Uses a hidden Stack so every screen keeps its custom header only.
 */
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackTitleVisible: false,
        headerTitle: '',
      }}
    />
  );
}
