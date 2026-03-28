import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import SelectArrow from '@/icons/SelectArrow';
import {
  getDriverMapStatusFilterLabels,
  CAPABILITIES_OPTIONS,
  RADIUS_OPTIONS,
  LOCATION_OPTIONS,
} from '@/constants/driversMapFilters';
import type { DriversMapSearchFilters } from '@/app-api/driversSearch';

const ADDRESS_DEBOUNCE_MS = 1500;

interface DriversMapFiltersCardProps {
  filters: DriversMapSearchFilters;
  onChange: (filters: DriversMapSearchFilters) => void;
  isAdministrator?: boolean;
}

export default function DriversMapFiltersCard({
  filters,
  onChange,
  isAdministrator = false,
}: DriversMapFiltersCardProps) {
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [radiusModalVisible, setRadiusModalVisible] = useState(false);
  const [capabilitiesModalVisible, setCapabilitiesModalVisible] = useState(false);
  const [addressInput, setAddressInput] = useState(filters.addressFilter ?? '');

  useEffect(() => {
    setAddressInput(filters.addressFilter ?? '');
  }, [filters.addressFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = addressInput.trim();
      if (trimmed !== (filters.addressFilter ?? '')) {
        onChange({ ...filters, addressFilter: trimmed });
      }
    }, ADDRESS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [addressInput, filters, onChange]);

  const statusFilter = filters.statusFilter ?? '';
  const statusLabel = statusFilter || 'All statuses';
  const locationFilter = filters.locationFilter ?? 'USA';
  const radiusFilter = filters.radiusFilter ?? '500';
  const radiusLabel = RADIUS_OPTIONS.find((r) => r.value === radiusFilter)?.label ?? '500 miles';
  const capabilitiesFilter = filters.capabilitiesFilter ?? [];
  const capabilitiesLabel =
    capabilitiesFilter.length > 0
      ? `${capabilitiesFilter.length} selected`
      : 'Select capabilities';

  const handleReset = () => {
    setAddressInput('');
    onChange({
      statusFilter: '',
      capabilitiesFilter: [],
      addressFilter: '',
      radiusFilter: '500',
      locationFilter: 'USA',
      role: 'administrator',
    });
  };

  const toggleCapability = (value: string) => {
    const current = filters.capabilitiesFilter ?? [];
    const next = current.includes(value)
      ? current.filter((c) => c !== value)
      : [...current, value];
    onChange({ ...filters, capabilitiesFilter: next });
  };

  return (
    <View style={styles.settingsSection}>
      <ScrollView style={styles.filtersScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.inputCompact}
            onPress={() => setStatusModalVisible(true)}
          >
            <Text style={styles.textInput} numberOfLines={1}>
              {statusLabel}
            </Text>
            <SelectArrow />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inputCompact}
            onPress={() => setCapabilitiesModalVisible(true)}
          >
            <Text style={styles.textInput} numberOfLines={1}>
              {capabilitiesLabel}
            </Text>
            <SelectArrow />
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.inputFull, styles.textInput]}
          value={addressInput}
          onChangeText={setAddressInput}
          placeholder="Address"
          placeholderTextColor={colors.primary.blue}
        />

        <View style={styles.row}>
          <TouchableOpacity
            style={styles.inputCompact}
            onPress={() => setLocationModalVisible(true)}
          >
            <Text style={styles.textInput}>{locationFilter}</Text>
            <SelectArrow />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inputCompact}
            onPress={() => setRadiusModalVisible(true)}
          >
            <Text style={styles.textInput}>{radiusLabel}</Text>
            <SelectArrow />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Status modal */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Status</Text>
            <ScrollView
              style={styles.modalOptionsScroll}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {['', ...getDriverMapStatusFilterLabels(isAdministrator)].map((opt) => (
                  <TouchableOpacity
                    key={opt || 'all'}
                    style={[
                      styles.optionItem,
                      statusFilter === opt && styles.optionItemActive,
                    ]}
                    onPress={() => {
                      onChange({ ...filters, statusFilter: opt });
                      setStatusModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        statusFilter === opt && styles.optionTextActive,
                      ]}
                    >
                      {opt || 'All statuses'}
                    </Text>
                  </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setStatusModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Location modal */}
      <Modal
        visible={locationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Location</Text>
            {LOCATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionItem,
                  locationFilter === opt.value && styles.optionItemActive,
                ]}
                onPress={() => {
                  onChange({ ...filters, locationFilter: opt.value });
                  setLocationModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    locationFilter === opt.value && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setLocationModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Radius modal */}
      <Modal
        visible={radiusModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRadiusModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Radius</Text>
            <ScrollView
              style={styles.modalOptionsScroll}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {RADIUS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionItem,
                    radiusFilter === opt.value && styles.optionItemActive,
                  ]}
                  onPress={() => {
                    onChange({ ...filters, radiusFilter: opt.value });
                    setRadiusModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      radiusFilter === opt.value && styles.optionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setRadiusModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Capabilities modal */}
      <Modal
        visible={capabilitiesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCapabilitiesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Capabilities</Text>
            <ScrollView style={styles.capabilitiesList}>
              {CAPABILITIES_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionItem,
                    capabilitiesFilter.includes(opt.value) && styles.optionItemActive,
                  ]}
                  onPress={() => toggleCapability(opt.value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      capabilitiesFilter.includes(opt.value) && styles.optionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setCapabilitiesModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsSection: {
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.1)',
    paddingHorizontal: rem(16),
    backgroundColor: colors.neutral.white,
    borderTopRightRadius: rem(20),
    borderTopLeftRadius: rem(20),
    paddingBottom: rem(24) + 80, // Extra 80px to clear bottom nav bar
    paddingTop: rem(16),
  },
  filtersScroll: {
    maxHeight: rem(240),
  },
  row: {
    flexDirection: 'row',
    gap: rem(10),
    marginBottom: rem(8),
  },
  inputCompact: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: rem(12),
    height: rem(40),
    backgroundColor: 'rgba(232, 234, 253, 1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputFull: {
    borderRadius: 10,
    paddingHorizontal: rem(12),
    height: rem(40),
    backgroundColor: 'rgba(232, 234, 253, 1)',
    marginBottom: rem(8),
  },
  textInput: {
    color: colors.primary.blue,
    fontSize: fp(12),
    lineHeight: fp(15),
    fontFamily: fonts['400'],
    flex: 1,
  },
  resetButton: {
    marginTop: rem(4),
    paddingVertical: rem(10),
    backgroundColor: 'rgba(232, 234, 253, 1)',
    borderRadius: 10,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(20),
    padding: rem(20),
    width: '85%',
    maxWidth: 360,
    maxHeight: '70%',
  },
  modalOptionsScroll: {
    maxHeight: rem(280),
  },
  modalTitle: {
    fontSize: fp(20),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(20),
    textAlign: 'center',
  },
  optionItem: {
    paddingVertical: rem(15),
    paddingHorizontal: rem(20),
    borderRadius: 12,
    marginBottom: rem(10),
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
    fontFamily: fonts['500'],
    color: colors.neutral.black,
  },
  optionTextActive: {
    color: colors.neutral.white,
  },
  cancelButton: {
    marginTop: rem(10),
    paddingVertical: rem(15),
    paddingHorizontal: rem(20),
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  capabilitiesList: {
    maxHeight: rem(280),
  },
});
