import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LogsSettings from '@/components/settings/LogsSettings';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import { colors } from '@/lib';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <LogsSettings />
        </View>
        <BottomNavigation currentRoute="/settings" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    position: "relative"
  },
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


