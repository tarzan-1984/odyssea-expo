import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { colors, fonts, fp, rem, br } from '@/lib';

interface DriverInfoPopupProps {
  visible: boolean;
  onClose: () => void;
  driverData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    driverStatus: string | null;
  } | null;
}

// Format driver status for display
const formatDriverStatus = (status: string | null): string => {
  if (!status) return 'Unknown';
  
  const statusMap: Record<string, string> = {
    'available': 'Available',
    'available_on': 'Available on',
    'available_off': 'Not available',
    'loaded_enroute': 'Loaded & Enroute',
    'banned': 'Out of service',
    'on_vocation': 'On vacation',
    'no_updates': 'No updates',
    'blocked': 'Blocked',
    'expired_documents': 'Expired documents',
    'no_interview': 'No Interview',
    'no_Interview': 'No Interview',
    'on_hold': 'On hold',
    'need_update': 'Need update',
    'unknown': 'Unknown'
  };
  
  return statusMap[status] || status;
};

export default function DriverInfoPopup({ visible, onClose, driverData }: DriverInfoPopupProps) {
  if (!driverData) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.popup}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Driver Information</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            <View style={styles.row}>
              <Text style={styles.label}>Name:</Text>
              <Text style={styles.value}>
                {driverData.firstName} {driverData.lastName}
              </Text>
            </View>
            
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{driverData.email}</Text>
            </View>
            
            {driverData.phone && (
              <View style={styles.row}>
                <Text style={styles.label}>Phone:</Text>
                <Text style={styles.value}>{driverData.phone}</Text>
              </View>
            )}
            
            <View style={styles.row}>
              <Text style={styles.label}>Status:</Text>
              <Text style={styles.value}>
                {formatDriverStatus(driverData.driverStatus)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(20),
  },
  popup: {
    backgroundColor: colors.neutral.white,
    borderRadius: br(16),
    width: '100%',
    maxWidth: rem(400),
    padding: rem(20),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(20),
  },
  title: {
    fontSize: fp(20),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  closeButton: {
    width: rem(30),
    height: rem(30),
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: fp(28),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(28),
  },
  content: {
    gap: rem(16),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rem(12),
  },
  label: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
    minWidth: rem(80),
  },
  value: {
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.black,
    flex: 1,
  },
});
