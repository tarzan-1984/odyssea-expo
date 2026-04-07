import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform, Animated } from 'react-native';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem } from "@/lib";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PermissionsAssistant from '@/components/PermissionsAssistant';
import DriverContent from '@/components/final-verify/DriverContent';
import NonDriverContent from '@/components/final-verify/NonDriverContent';
import * as Location from 'expo-location';
import { LOCATION_TASK_NAME } from '@/tasks/locationTask';

/**
 * FinalVerifyScreen - Final verification/profile screen
 * Shows different content based on user role (DRIVER vs non-DRIVER)
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const user = authState.user;
  
  // Check user role
  const userRole = user?.role?.trim().toUpperCase();
  const isDriver = userRole === 'DRIVER';
  
  const firstName = user?.firstName || 'User';
  const lastName = user?.lastName || '';
  const initials = `${firstName[0]}${lastName ? lastName[0] : firstName[0]}`.toUpperCase();
  const profilePhoto = user?.profilePhoto || user?.avatar || null;
  const [showPermissionsAssistant, setShowPermissionsAssistant] = useState(false);
  const [driverBanner, setDriverBanner] = useState<string | null>(null);
  const driverBannerAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (!driverBanner) {
      Animated.timing(driverBannerAnim, {
        toValue: -100,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(driverBannerAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    }
  }, [driverBanner, driverBannerAnim]);
  useEffect(() => {
    const loadPermissionsState = async () => {
      try {
        // Check if this is the first launch of the app
        const firstLaunch = await AsyncStorage.getItem('@app_first_launch');
        
        if (!firstLaunch) {
          // First launch - clear all old data that might cause issues
          console.log('[FinalVerify] First app launch detected, clearing old data...');
          
          // Clear all keys that might cause problems from previous installation
          const keysToClear = [
            '@permissions_onboarding_completed',
            '@odyssea_app_settings',
            '@user_location',
            '@location_update_queue',
          ];
          
          try {
            await AsyncStorage.multiRemove(keysToClear);
            console.log('[FinalVerify] ✅ Cleared old data:', keysToClear);
          } catch (clearError) {
            console.warn('[FinalVerify] Failed to clear some old data:', clearError);
          }
          
          // Mark as launched AFTER clearing data
          await AsyncStorage.setItem('@app_first_launch', 'true');
          console.log('[FinalVerify] ✅ App marked as launched');
          
          // Show permissions assistant
          setShowPermissionsAssistant(true);
        } else {
          // Not first launch - check if permissions were completed
          const permissionsCompleted = await AsyncStorage.getItem('@permissions_onboarding_completed');
          if (permissionsCompleted !== 'true') {
            console.log('[FinalVerify] Permissions not completed, showing permissions assistant');
            setShowPermissionsAssistant(true);
          } else {
            console.log('[FinalVerify] Permissions already completed, skipping permissions assistant');
          }
        }
      } catch (error) {
        console.error('[FinalVerify] Failed to load permissions state:', error);
      }
    };
    
    loadPermissionsState();
  }, []);

  // Stop background tracking if user is not DRIVER
  useEffect(() => {
    if (!isDriver) {
      const stopTracking = async () => {
        try {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
          if (isRunning) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log('🛑 [FinalVerify] Stopped background tracking (user is not DRIVER)');
          }
        } catch (error) {
          console.warn('⚠️ [FinalVerify] Error stopping tracking:', error);
        }
      };
      stopTracking();
    }
  }, [isDriver]);

  if (showPermissionsAssistant) {
    return (
      <View style={styles.screenWrap}>
        <PermissionsAssistant
          onComplete={async () => {
            try {
              await AsyncStorage.setItem('@permissions_onboarding_completed', 'true');
            } catch (e) {
              console.warn('[FinalVerify] Failed to save permissions onboarding flag', e);
            }
            setShowPermissionsAssistant(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        {/* Paint status bar area exactly to safe inset height */}
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          {/* Header with time and profile */}
          <View style={styles.header}>
            <Text style={styles.welcome} numberOfLines={2}>
              Welcome to application, {firstName}
            </Text>
            
            <TouchableOpacity
              style={styles.profileIcon}
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.profileText}>{initials}</Text>
              )}
            </TouchableOpacity>
          </View>
          
          <View style={styles.contentWrapper}>
            {isDriver ? (
              <DriverContent onDriverBanner={setDriverBanner} />
            ) : (
              <NonDriverContent firstName={firstName} />
            )}
          </View>

          {isDriver && driverBanner ? (
            <Animated.View
              style={[
                styles.driverBannerWrap,
                (driverBanner === 'Successful status update' ||
                  driverBanner.includes('successfully'))
                  ? styles.driverBannerSuccess
                  : styles.driverBannerError,
                { transform: [{ translateY: driverBannerAnim }] },
              ]}
              pointerEvents="none"
            >
              <Text
                style={[
                  styles.driverBannerText,
                  (driverBanner === 'Successful status update' ||
                    driverBanner.includes('successfully'))
                    ? styles.driverBannerTextSuccess
                    : styles.driverBannerTextError,
                ]}
              >
                {driverBanner}
              </Text>
            </Animated.View>
          ) : null}
        </View>
        
        {/* Bottom Navigation */}
        <BottomNavigation />
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
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: "relative",
    zIndex: 5,
    marginTop: -20,
  },
  profileIcon: {
    width: rem(60),
    height: rem(60),
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.blue,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.full,
  },
  profileText: {
    color: colors.neutral.white,
    fontSize: fp(24),
    fontFamily: fonts["700"],
  },
  welcome: {
    fontSize: fp(22),
    fontFamily: fonts["700"],
    lineHeight: fp(20),
    color: colors.neutral.white,
    flex: 1,
    flexShrink: 1,
    flexGrow: 1,
    flexWrap: 'wrap',
    marginRight: rem(12),
  },
  /** Sits just under the purple header; z-index above header so the peeking strip stays readable */
  driverBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: rem(58),
    zIndex: 40,
    paddingHorizontal: rem(20),
    paddingTop: rem(18),
    paddingBottom: rem(12),
    backgroundColor: colors.neutral.white,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 8,
  },
  driverBannerSuccess: {
    borderBottomColor: '#34C759',
  },
  driverBannerError: {
    borderBottomColor: '#FF3B30',
  },
  driverBannerText: {
    fontSize: fp(14),
    fontFamily: fonts["600"],
    textAlign: 'center',
  },
  driverBannerTextSuccess: {
    color: '#34C759',
  },
  driverBannerTextError: {
    color: '#FF3B30',
  },
});
