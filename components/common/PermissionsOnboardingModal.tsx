import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Platform, ScrollView } from 'react-native';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem } from '@/lib';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERMISSIONS_ONBOARDING_KEY = '@permissions_onboarding_completed';

interface PermissionsOnboardingModalProps {
  visible: boolean;
  onComplete: () => void;
}

interface PermissionStatus {
  id: string;
  title: string;
  description: string;
  granted: boolean;
  action: () => Promise<void>;
  actionLabel: string;
}

export default function PermissionsOnboardingModal({ 
  visible, 
  onComplete 
}: PermissionsOnboardingModalProps) {
  const [permissions, setPermissions] = useState<PermissionStatus[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const checkAllPermissions = async () => {
    setIsChecking(true);
    const checks: PermissionStatus[] = [];

    // 1. Location Services Enabled
    try {
      const providerStatus = await Location.getProviderStatusAsync();
      const locationEnabled = providerStatus.locationServicesEnabled;
      
      checks.push({
        id: 'location_services',
        title: 'Enable Location Services',
        description: Platform.OS === 'ios' 
          ? 'Go to Settings → Privacy & Security → Location Services and enable it'
          : 'Go to Settings → Location and enable location services',
        granted: locationEnabled,
        action: async () => {
          if (Platform.OS === 'ios') {
            await Linking.openURL('App-Prefs:root=Privacy&path=LOCATION').catch(() => {
              Linking.openSettings();
            });
          } else {
            await Linking.openURL('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
              Linking.openSettings();
            });
          }
        },
        actionLabel: 'Open Location Settings',
      });
    } catch (e) {
      console.error('Failed to check location services:', e);
    }

    // 2. Foreground Location Permission
    try {
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      const foregroundGranted = foregroundStatus.status === 'granted';
      
      checks.push({
        id: 'foreground_location',
        title: 'Allow Location Access (While Using)',
        description: 'This app needs location permission to show your position on the map',
        granted: foregroundGranted,
        action: async () => {
          if (!foregroundGranted) {
            await Location.requestForegroundPermissionsAsync();
          }
          // Re-check after request
          setTimeout(checkAllPermissions, 500);
        },
        actionLabel: foregroundGranted ? 'Granted ✓' : 'Grant Permission',
      });
    } catch (e) {
      console.error('Failed to check foreground permission:', e);
    }

    // 3. Background Location Permission (Always)
    try {
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();
      const backgroundGranted = backgroundStatus.status === 'granted';
      
      checks.push({
        id: 'background_location',
        title: 'Allow Location Access (Always)',
        description: Platform.OS === 'ios'
          ? 'Go to Settings → Privacy & Security → Location Services → Odyssea → Select "Always"'
          : 'Go to App Settings → Permissions → Location → Select "Allow all the time"',
        granted: backgroundGranted,
        action: async () => {
          if (!backgroundGranted) {
            // First ensure foreground is granted
            const fgStatus = await Location.getForegroundPermissionsAsync();
            if (fgStatus.status !== 'granted') {
              await Location.requestForegroundPermissionsAsync();
            }
            await Location.requestBackgroundPermissionsAsync();
          }
          // Open settings to allow "Always"
          await Linking.openSettings();
          // Re-check after user returns
          setTimeout(checkAllPermissions, 500);
        },
        actionLabel: backgroundGranted ? 'Granted ✓' : 'Open Settings',
      });
    } catch (e) {
      console.error('Failed to check background permission:', e);
    }

    // 4. Notification Permission
    try {
      const notificationStatus = await Notifications.getPermissionsAsync();
      const notificationGranted = notificationStatus.status === 'granted';
      
      checks.push({
        id: 'notifications',
        title: 'Allow Notifications',
        description: 'Receive push notifications for new messages and important updates',
        granted: notificationGranted,
        action: async () => {
          if (!notificationGranted) {
            await Notifications.requestPermissionsAsync();
          }
          // Re-check after request
          setTimeout(checkAllPermissions, 500);
        },
        actionLabel: notificationGranted ? 'Granted ✓' : 'Grant Permission',
      });
    } catch (e) {
      console.error('Failed to check notification permission:', e);
    }

    // 5. Battery Optimization (Android only)
    if (Platform.OS === 'android') {
      // We cannot reliably detect vendor-specific battery saving modes,
      // so we always ask the user to verify this setting manually.
      checks.push({
        id: 'battery_optimization',
        title: 'Disable Battery Optimization',
        description: 'To ensure correct app operation, please disable battery optimization for Odyssea in system settings.',
        granted: false,
        action: async () => {
          if (Platform.OS !== 'android') {
            return;
          }
          try {
            // First, try to open the per-app request screen
            await Linking.openURL('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
          } catch {
            // If it fails, open the general battery optimization settings list
            try {
              await Linking.openURL('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
            } catch (e) {
              console.warn('[PermissionsOnboarding] Failed to open battery optimization settings:', e);
              try {
                await Linking.openSettings();
              } catch (e2) {
                console.warn('[PermissionsOnboarding] Failed to open app settings:', e2);
              }
            }
          }
          // Re-check after user returns
          setTimeout(checkAllPermissions, 500);
        },
        actionLabel: 'Open Settings',
      });
    }


    // 6. Auto-start / background launch (Android only)
    if (Platform.OS === 'android') {
      // We cannot reliably detect vendor-specific auto-start settings,
      // so we provide shortcuts for popular manufacturers and a fallback to app settings.
      checks.push({
        id: 'auto_start',
        title: 'Enable Auto-start',
        description: 'To keep location updates running in the background, please enable auto-start / background launch for Odyssea in system settings.',
        granted: false,
        action: async () => {
          if (Platform.OS !== 'android') {
            return;
          }
          try {
            const brand = (Device.brand || '').toLowerCase();

            if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco')) {
              await Linking.openURL('miui://autoStart');
              return;
            }

            if (brand.includes('huawei') || brand.includes('honor')) {
              await Linking.openURL('package:com.huawei.systemmanager');
              return;
            }

            if (brand.includes('asus')) {
              await Linking.openURL('com.asus.mobilemanager/.MainActivity');
              return;
            }

            if (brand.includes('oppo') || brand.includes('oneplus')) {
              await Linking.openURL('package:com.coloros.safecenter');
              return;
            }

            if (brand.includes('vivo') || brand.includes('iqoo')) {
              await Linking.openURL('package:com.iqoo.secure');
              return;
            }

            if (brand.includes('samsung')) {
              await Linking.openURL('package:com.samsung.android.lool');
              return;
            }

            // Fallback: open app-specific settings
            await Linking.openSettings();
          } catch (err) {
            console.warn('[PermissionsOnboarding] Auto-start settings not supported or failed:', err);
            try {
              await Linking.openSettings();
            } catch (e2) {
              console.warn('[PermissionsOnboarding] Failed to open app settings for auto-start:', e2);
            }
          }
        },
        actionLabel: 'Open Settings',
      });
    }

    setPermissions(checks);
    setIsChecking(false);
  };

  useEffect(() => {
    if (visible) {
      checkAllPermissions();
    }
  }, [visible]);

  const allGranted = permissions.length > 0 && permissions.every(p => p.granted || p.id === 'battery_optimization' || p.id === 'auto_start');

  const handleComplete = async () => {
    if (allGranted) {
      await AsyncStorage.setItem(PERMISSIONS_ONBOARDING_KEY, 'true');
      onComplete();
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(PERMISSIONS_ONBOARDING_KEY, 'true');
    onComplete();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Required Permissions</Text>
          <Text style={styles.modalSubtitle}>
            To ensure the app works properly, please grant the following permissions:
          </Text>

          <ScrollView style={styles.permissionsList} showsVerticalScrollIndicator={false}>
            {permissions.map((permission) => (
              <View key={permission.id} style={styles.permissionItem}>
                <View style={styles.permissionHeader}>
                  <Text style={styles.permissionTitle}>{permission.title}</Text>
                  {permission.granted && (
                    <View style={styles.grantedBadge}>
                      <Text style={styles.grantedText}>✓</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={styles.permissionDescription}
                  onPress={permission.id === 'battery_optimization' || permission.id === 'auto_start' ? () => { void permission.action(); } : undefined}
                >
                  {permission.description}
                </Text>
                {!permission.granted && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={permission.action}
                    disabled={isChecking}
                  >
                    <Text style={styles.actionButtonText}>{permission.actionLabel}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>

          <View style={styles.buttonsContainer}>
            {allGranted ? (
              <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
                <Text style={styles.completeButtonText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                  <Text style={styles.skipButtonText}>Skip for Now</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.refreshButton, isChecking && styles.refreshButtonDisabled]} 
                  onPress={checkAllPermissions}
                  disabled={isChecking}
                >
                  <Text style={styles.refreshButtonText}>
                    {isChecking ? 'Checking...' : 'Refresh Status'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(20),
  },
  modalContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.xl,
    padding: rem(24),
    width: '100%',
    maxWidth: rem(400),
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: fp(20),
    fontFamily: fonts["600"],
    color: colors.neutral.black,
    marginBottom: rem(8),
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: fp(14),
    fontFamily: fonts["400"],
    color: colors.neutral.darkGrey,
    marginBottom: rem(20),
    textAlign: 'center',
    lineHeight: fp(20),
  },
  permissionsList: {
    maxHeight: rem(400),
    marginBottom: rem(20),
  },
  permissionItem: {
    marginBottom: rem(20),
    paddingBottom: rem(16),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(8),
  },
  permissionTitle: {
    fontSize: fp(16),
    fontFamily: fonts["600"],
    color: colors.neutral.black,
    flex: 1,
  },
  grantedBadge: {
    backgroundColor: colors.semantic.success,
    borderRadius: borderRadius.full,
    width: rem(24),
    height: rem(24),
    justifyContent: 'center',
    alignItems: 'center',
  },
  grantedText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts["600"],
  },
  permissionDescription: {
    fontSize: fp(13),
    fontFamily: fonts["400"],
    color: colors.neutral.darkGrey,
    marginBottom: rem(12),
    lineHeight: fp(18),
  },
  actionButton: {
    backgroundColor: colors.primary.violet,
    borderRadius: borderRadius.md,
    paddingVertical: rem(10),
    paddingHorizontal: rem(20),
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    color: colors.neutral.white,
    fontSize: fp(13),
    fontFamily: fonts["600"],
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: rem(12),
  },
  completeButton: {
    flex: 1,
    backgroundColor: colors.primary.violet,
    borderRadius: borderRadius.md,
    paddingVertical: rem(14),
    alignItems: 'center',
  },
  completeButtonText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts["600"],
  },
  skipButton: {
    flex: 1,
    backgroundColor: colors.neutral.lightGrey,
    borderRadius: borderRadius.md,
    paddingVertical: rem(14),
    alignItems: 'center',
  },
  skipButtonText: {
    color: colors.neutral.black,
    fontSize: fp(14),
    fontFamily: fonts["400"],
  },
  refreshButton: {
    flex: 1,
    backgroundColor: colors.primary.blue,
    borderRadius: borderRadius.md,
    paddingVertical: rem(14),
    alignItems: 'center',
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  refreshButtonText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts["600"],
  },
});

// Helper to check if onboarding was completed
export async function isPermissionsOnboardingCompleted(): Promise<boolean> {
  try {
    const completed = await AsyncStorage.getItem(PERMISSIONS_ONBOARDING_KEY);
    return completed === 'true';
  } catch {
    return false;
  }
}


