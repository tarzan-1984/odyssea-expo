import React from 'react';
import { View, StyleSheet, Platform, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import LogsSettings from '@/components/settings/LogsSettings';
import NotificationToggleSettings from '@/components/settings/NotificationToggleSettings';
import ChatCacheSettings from '@/components/settings/ChatCacheSettings';
import UserDevicesSettings from '@/components/settings/UserDevicesSettings';
import WebSocketConnectionSettings from '@/components/settings/WebSocketConnectionSettings';
import BottomNavigation, { BOTTOM_NAV_SCROLL_PADDING } from '@/components/navigation/BottomNavigation';
import { colors } from '@/lib/colors';
import { fonts, fp, rem } from '@/lib';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const appVersion = Application.nativeApplicationVersion ?? '—';
  const buildNumber = Application.nativeBuildVersion ?? '—';

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
              <Text
                style={styles.versionLine}
                accessibilityLabel={`App version ${appVersion} build ${buildNumber}`}
              >
                Version {appVersion} ({buildNumber})
              </Text>
              <NotificationToggleSettings />
              <UserDevicesSettings />
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Password</Text>
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={() => router.push('/change-password')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.buttonText}>Change password</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
  versionLine: {
    paddingHorizontal: rem(16),
    paddingTop: rem(12),
    marginBottom: rem(4),
    fontSize: fp(13),
    fontFamily: fonts['500'],
    lineHeight: fp(18),
    color: colors.neutral.darkGrey,
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
    paddingBottom: BOTTOM_NAV_SCROLL_PADDING,
  },
  sectionCard: {
    padding: rem(16),
    backgroundColor: 'white',
    marginBottom: rem(12),
    borderRadius: rem(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontFamily: fonts['700'],
    fontSize: fp(18),
    color: colors.primary.blue,
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    paddingVertical: rem(10),
    paddingHorizontal: rem(16),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(90),
  },
  primaryButton: {
    backgroundColor: colors.primary.blue,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: fp(13),
    fontWeight: '600',
  },
});


