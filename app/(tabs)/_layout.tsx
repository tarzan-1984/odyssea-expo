import { Slot } from 'expo-router';
import React from 'react';
import { colors } from '@/lib';

/**
 * Tabs Layout
 * Bottom navigation for main app screens
 * Using Slot to disable default Expo Router tabs
 */
export default function TabsLayout() {
  // Remove the default Tabs. Render only child screens;
  // each screen renders custom bottom tabs via BottomNavigation.
  // Slot prevents default tab bar from rendering
  return <Slot />;
}
