import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Platform } from 'react-native';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem } from '@/lib';

interface LocationPermissionModalProps {
  visible: boolean;
  isLocationEnabled?: boolean | null;
  onOpenAppSettings: () => void; // Opens app settings for permissions
  onOpenLocationSettings: () => void; // Opens device location settings
}

export default function LocationPermissionModal({ 
  visible, 
  isLocationEnabled, 
  onOpenAppSettings,
  onOpenLocationSettings 
}: LocationPermissionModalProps) {
  // If location services are disabled on device
  if (isLocationEnabled === false) {
    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Location Services Disabled</Text>
            <Text style={styles.modalText}>
              Location services are currently disabled on your device.{'\n\n'}
              {Platform.OS === 'ios' ? (
                <>
                  Please enable location services in Settings → Privacy & Security → Location Services
                </>
              ) : (
                <>
                  Please enable location services in Settings → Location
                </>
              )}
            </Text>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={onOpenLocationSettings}
            >
              <Text style={styles.modalButtonText}>
                {Platform.OS === 'ios' ? 'Open Location Settings' : 'Open Location Settings'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // If permission not granted
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Location Permission Required</Text>
          <Text style={styles.modalText}>
            This app requires "Always" location permission to track your location in the background.{'\n\n'}
            {Platform.OS === 'ios' ? (
              <>
                Please go to Settings → Privacy & Security → Location Services → odysseaexpo → Select "Always"
              </>
            ) : (
              <>
                Please go to App Settings → Permissions → Location → Select "Allow all the time"
              </>
            )}
          </Text>
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={onOpenAppSettings}
          >
            <Text style={styles.modalButtonText}>
              {Platform.OS === 'ios' ? 'Open App Settings' : 'Open App Settings'}
            </Text>
          </TouchableOpacity>
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
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: fp(20),
    fontFamily: fonts["600"],
    color: colors.neutral.black,
    marginBottom: rem(16),
    textAlign: 'center',
  },
  modalText: {
    fontSize: fp(15),
    fontFamily: fonts["400"],
    color: colors.neutral.black,
    marginBottom: rem(24),
    textAlign: 'center',
    lineHeight: fp(22),
  },
  modalButton: {
    backgroundColor: colors.primary.violet,
    borderRadius: borderRadius.md,
    paddingVertical: rem(14),
    paddingHorizontal: rem(32),
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts["600"],
  },
});

