import React from 'react';
import { View, StyleSheet, Platform, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LogsSettings from '@/components/settings/LogsSettings';
import NotificationToggleSettings from '@/components/settings/NotificationToggleSettings';
import ChatCacheSettings from '@/components/settings/ChatCacheSettings';
import WebSocketConnectionSettings from '@/components/settings/WebSocketConnectionSettings';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import { colors } from '@/lib/colors';
import { fonts, fp, rem } from '@/lib';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        {/* Paint status bar area exactly to safe inset height */}
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          {/* Header with title */}
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
          </View>
          
          <View style={styles.contentWrapper}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
              <NotificationToggleSettings />
              <WebSocketConnectionSettings />
              <ChatCacheSettings />
              <LogsSettings />
            </ScrollView>
          </View>
        </View>
        
        {/* Bottom Navigation */}
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
  },
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: rem(25),
    paddingBottom: rem(34),
    borderBottomLeftRadius: rem(20),
    borderBottomRightRadius: rem(20),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
  },
  title: {
    fontSize: fp(24),
    fontFamily: fonts["700"],
    lineHeight: fp(24),
    color: colors.neutral.white,
    flex: 1,
  },
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: "relative",
    zIndex: 5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 70,
  },
});


