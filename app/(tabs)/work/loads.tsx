import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import WorkTopMenu from '@/components/work/WorkTopMenu';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab } from '@/constants/roleAccess';

export default function LoadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authState } = useAuth();
  const canAccess = canAccessWorkTab(authState.user?.role);

  useEffect(() => {
    if (authState.isAuthenticated && !canAccess) {
      router.replace('/final-verify');
    }
  }, [authState.isAuthenticated, canAccess, router]);

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <WorkTopMenu currentPage="loads" />

          <View style={styles.content}>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>Loads</Text>
              <Text style={styles.placeholderSubtitle}>Available loads will appear here</Text>
            </View>
          </View>
        </View>
      </View>

      <BottomNavigation currentRoute="/work/loads" />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    position: 'relative',
  },
  screenContent: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    flex: 1,
    padding: rem(20),
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: fp(24),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(10),
  },
  placeholderSubtitle: {
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
});
