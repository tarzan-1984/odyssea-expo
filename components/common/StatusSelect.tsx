import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { colors, fonts, fp, rem, br } from '@/lib';
import SelectArrow from '@/icons/SelectArrow'

// All possible status values
export type StatusValue = 
  | 'available' 
  | 'available_on' 
  | 'available_off' 
  | 'loaded_enroute'
  | 'banned'
  | 'on_vocation'
  | 'no_updates'
  | 'blocked'
  | 'expired_documents'
  | 'no_interview'
  | 'no_Interview'
  | 'on_hold'
  | 'need_update'
  | 'unknown';

interface StatusOption {
  value: StatusValue;
  label: string;
}

// Basic statuses that are always available for selection
const BASIC_STATUS_OPTIONS: StatusOption[] = [
  { value: 'available', label: 'Available' },
  { value: 'available_on', label: 'Available on' },
  { value: 'available_off', label: 'Not available' },
  { value: 'loaded_enroute', label: 'Loaded & Enroute' },
];

// Full mapping of all statuses to their labels
const ALL_STATUS_LABELS: Record<StatusValue, string> = {
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

// Check if a status is a basic (selectable) status
const isBasicStatus = (status: StatusValue): boolean => {
  return BASIC_STATUS_OPTIONS.some(opt => opt.value === status);
};

interface StatusSelectProps {
  value: StatusValue;
  onChange: (value: StatusValue) => void;
  style?: any;
  disabled?: boolean;
}

export default function StatusSelect({ value, onChange, style, disabled = false }: StatusSelectProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  // Get current status label
  const currentStatusLabel = ALL_STATUS_LABELS[value] || 'Unknown';
  
  // Determine which options to show in modal
  // If disabled, we don't show modal, but if enabled, show only basic options
  const optionsToShow = BASIC_STATUS_OPTIONS;
  
  const handleSelect = (option: StatusOption) => {
    onChange(option.value);
    setIsModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity 
        style={[
          styles.statusDropdown, 
          disabled && styles.statusDropdownDisabled,
          style
        ]} 
        onPress={() => !disabled && setIsModalVisible(true)}
        disabled={disabled}
      >
        <Text style={[
          styles.statusText,
          disabled && styles.statusTextDisabled
        ]}>
          {currentStatusLabel}
        </Text>
        
        {!disabled && <SelectArrow />}
      </TouchableOpacity>

      <Modal
        visible={isModalVisible && !disabled}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Status</Text>
            
            {optionsToShow.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionItem,
                  value === option.value && styles.optionItemActive
                ]}
                onPress={() => handleSelect(option)}
              >
                <Text style={[
                  styles.optionText,
                  value === option.value && styles.optionTextActive
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setIsModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  statusDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary.blue,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: rem(40),
    flex: 1,
  },
  statusText: {
    fontSize: fp(16),
    color: '#8E8E93',
    fontWeight: '500',
  },
  statusDropdownDisabled: {
    borderColor: '#CCCCCC',
    backgroundColor: '#F5F5F5',
  },
  statusTextDisabled: {
    color: '#999999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: fp(20),
    fontFamily: fonts["700"],
    color: colors.neutral.black,
    marginBottom: 20,
    textAlign: 'center',
  },
  optionItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionItemActive: {
    backgroundColor: colors.primary.blue,
    borderColor: colors.primary.blue,
  },
  optionText: {
    fontSize: fp(16),
    fontFamily: fonts["500"],
    color: colors.neutral.black,
  },
  optionTextActive: {
    color: colors.neutral.white,
  },
  cancelButton: {
    marginTop: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: fp(16),
    fontFamily: fonts["600"],
    color: colors.neutral.black,
  },
});

