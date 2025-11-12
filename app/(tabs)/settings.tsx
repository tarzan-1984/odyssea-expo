import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationsSettings from '@/components/settings/NotificationsSettings';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import { colors } from '@/lib';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screenWrap}>
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <View style={styles.container}>
        <NotificationsSettings />
      </View>
      <BottomNavigation currentRoute="/settings" />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
    position: 'relative',
    paddingBottom: 70,
    backgroundColor: 'rgba(247, 248, 255, 1)',
  },
});


