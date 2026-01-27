import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { colors, fonts, fp, rem, br } from '@/lib';

interface DriverInfoPopupProps {
  visible: boolean;
  onClose: () => void;
  driverData: any | null; // Data from TMS API
  isLoading?: boolean;
  // Optional chat action button (handled by parent).
  showChatButton?: boolean;
  chatButtonLabel?: string;
  onChatPress?: () => void;
  isChatActionLoading?: boolean;
  isChatActionDisabled?: boolean;
}

// Format driver status for display
const formatDriverStatus = (status: string | null | undefined): string => {
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
  
  return statusMap[status.toLowerCase()] || status;
};

export default function DriverInfoPopup({
  visible,
  onClose,
  driverData,
  isLoading = false,
  showChatButton = false,
  chatButtonLabel = 'Go to chat',
  onChatPress,
  isChatActionLoading = false,
  isChatActionDisabled = false,
}: DriverInfoPopupProps) {
  // Extract data from TMS response structure
  const contactData = driverData?.organized_data?.contact;
  const locationData = driverData?.organized_data?.current_location;
  const vehicleData = driverData?.organized_data?.vehicle;
  const documentsData = driverData?.organized_data?.documents;
  const equipmentData = vehicleData?.equipment;
  
  const driverId = driverData?.id || 'N/A';
  const driverName = contactData?.driver_name || 'N/A';
  const driverPhone = contactData?.driver_phone || 'N/A';
  const driverStatus = locationData?.status || driverData?.driverStatus || null;
  const city = locationData?.city || '';
  const state = locationData?.state || '';
  const location = city && state ? `${city}, ${state}` : (city || state || 'N/A');
  
  // Vehicle data
  const dimensions = vehicleData?.overall_dimensions || vehicleData?.cargo_space_dimensions || 'N/A';
  const payload = vehicleData?.payload || 'N/A';
  const vehicleType = vehicleData?.type?.label || vehicleData?.type || 'N/A';
  
  // Additional details - combine equipment and documents
  const additionalDetails: string[] = [];
  
  // Add equipment items (format key names to readable format)
  if (equipmentData && typeof equipmentData === 'object') {
    Object.keys(equipmentData).forEach(key => {
      const value = equipmentData[key];
      // If value is truthy (true, non-empty string, etc.)
      if (value && (typeof value === 'boolean' || (typeof value === 'string' && value.trim() !== ''))) {
        // Format key: convert snake_case to Title Case
        const formattedKey = key
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        additionalDetails.push(formattedKey);
      }
    });
  }
  
  // Add documents
  if (documentsData?.real_id) {
    additionalDetails.push('Real ID');
  }
  
  // Add printer if exists
  if (equipmentData?.printer) {
    additionalDetails.push('Printer');
  }
  
  // Add PPE if exists
  if (equipmentData?.ppe) {
    additionalDetails.push('PPE');
  }
  
  const additionalDetailsText = additionalDetails.length > 0 ? additionalDetails.join(', ') : 'N/A';

  const handlePhonePress = () => {
    if (driverPhone && driverPhone !== 'N/A') {
      const phoneNumber = driverPhone.replace(/[^\d+]/g, '');
      Linking.openURL(`tel:${phoneNumber}`);
    }
  };

  const handleNamePress = () => {
    // Could navigate to driver profile or open contact
    // For now, just a placeholder
  };

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
            <Text style={styles.title}>Unit #{driverId}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary.blue} />
              <Text style={styles.loadingText}>Loading driver data...</Text>
            </View>
          ) : driverData ? (
            <View style={styles.content}>
              {/* Name */}
              <View style={styles.row}>
                <Text style={styles.label}>Name:</Text>
                <TouchableOpacity onPress={handleNamePress}>
                  <Text style={styles.linkValue}>{driverName}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
              
              {/* Phone */}
              <View style={styles.row}>
                <Text style={styles.label}>Phone:</Text>
                <TouchableOpacity onPress={handlePhonePress}>
                  <Text style={styles.linkValue}>{driverPhone}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
              
              {/* Location */}
              <View style={styles.row}>
                <Text style={styles.label}>Location:</Text>
                <Text style={styles.value}>{location}</Text>
              </View>
              <View style={styles.divider} />
              
              {/* Dimensions */}
              <View style={styles.row}>
                <Text style={styles.label}>Dimensions:</Text>
                <Text style={styles.value}>{dimensions}</Text>
              </View>
              <View style={styles.divider} />
              
              {/* Payload */}
              <View style={styles.row}>
                <Text style={styles.label}>Payload:</Text>
                <Text style={styles.value}>{payload}</Text>
              </View>
              <View style={styles.divider} />
              
              {/* Vehicle Type */}
              <View style={styles.row}>
                <Text style={styles.label}>Vehicle Type:</Text>
                <Text style={styles.value}>{vehicleType}</Text>
              </View>
              <View style={styles.divider} />
              
              {/* Additional Details */}
              <View style={styles.row}>
                <Text style={styles.label}>Additional Details:</Text>
                <Text style={styles.value}>{additionalDetailsText}</Text>
              </View>
              <View style={styles.divider} />
              
              {/* Status */}
              <View style={styles.row}>
                <Text style={styles.label}>Status:</Text>
                <Text style={styles.statusValue}>
                  {formatDriverStatus(driverStatus)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load driver data</Text>
            </View>
          )}

          {showChatButton ? (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.chatButton,
                  (isChatActionDisabled || isChatActionLoading) && styles.chatButtonDisabled,
                ]}
                onPress={() => onChatPress?.()}
                disabled={isChatActionDisabled || isChatActionLoading}
                activeOpacity={0.8}
              >
                {isChatActionLoading ? (
                  <ActivityIndicator size="small" color={colors.neutral.white} />
                ) : null}
                <Text style={styles.chatButtonText}>{chatButtonLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
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
    borderRadius: br(12),
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
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: rem(12),
  },
  label: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  value: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.black,
    textAlign: 'right',
    flex: 1,
    marginLeft: rem(16),
  },
  linkValue: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    textAlign: 'right',
    flex: 1,
    marginLeft: rem(16),
  },
  statusValue: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'right',
    flex: 1,
    marginLeft: rem(16),
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutral.lightGrey,
    marginVertical: 0,
  },
  footer: {
    marginTop: rem(16),
  },
  chatButton: {
    width: '100%',
    borderRadius: br(10),
    backgroundColor: colors.primary.blue,
    paddingVertical: rem(12),
    paddingHorizontal: rem(14),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: rem(10),
  },
  chatButtonDisabled: {
    opacity: 0.6,
  },
  chatButtonText: {
    color: colors.neutral.white,
    fontSize: fp(14),
    fontFamily: fonts['600'],
  },
  loadingContainer: {
    paddingVertical: rem(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: rem(12),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  errorContainer: {
    paddingVertical: rem(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: '#FF3B30',
  },
});
