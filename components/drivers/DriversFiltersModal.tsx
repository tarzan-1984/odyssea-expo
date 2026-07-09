import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Pressable,
  FlatList,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, rem, fp } from '@/lib';
import type { LocationCountryFilter } from '@/constants/driversListConstants';
import {
  DRIVER_CAPABILITY_FILTER_OPTIONS,
  getDriverStatusFilterModalOptions,
  RESTRICTED_DRIVER_STATUS_FILTER_VALUES,
  RADIUS_MILES_OPTIONS,
} from '@/constants/driversListConstants';

export interface DriversFiltersState {
  address: string;
  locationFilter: LocationCountryFilter;
  radiusFilter: string;
  statusFilter: string;
  capabilitiesFilter: string[];
}

function defaultFiltersState(): DriversFiltersState {
  return {
    address: '',
    locationFilter: 'USA',
    radiusFilter: '500',
    statusFilter: 'all',
    capabilitiesFilter: [],
  };
}

interface DriversFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  initial: DriversFiltersState;
  onApply: (next: DriversFiltersState) => void;
  /** Same as Next.js canViewRestrictedDriverStatusesOnMap */
  canViewRestrictedStatuses?: boolean;
}

export default function DriversFiltersModal({
  visible,
  onClose,
  initial,
  onApply,
  canViewRestrictedStatuses = false,
}: DriversFiltersModalProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DriversFiltersState>(initial);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const statusOptions = getDriverStatusFilterModalOptions(canViewRestrictedStatuses);

  useEffect(() => {
    if (!visible) return;
    let next = { ...initial };
    if (
      !canViewRestrictedStatuses &&
      next.statusFilter &&
      RESTRICTED_DRIVER_STATUS_FILTER_VALUES.has(next.statusFilter)
    ) {
      next = { ...next, statusFilter: 'all' };
    }
    setDraft(next);
  }, [visible, initial, canViewRestrictedStatuses]);

  useEffect(() => {
    if (!visible) setStatusPickerOpen(false);
  }, [visible]);

  const toggleCapability = (value: string) => {
    setDraft((d) => {
      const set = new Set(d.capabilitiesFilter);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...d, capabilitiesFilter: Array.from(set) };
    });
  };

  const resetAndApply = useCallback(() => {
    const next = defaultFiltersState();
    setDraft(next);
    onApply(next);
    onClose();
  }, [onApply, onClose]);

  const statusLabel =
    statusOptions.find((o) => o.value === draft.statusFilter)?.label ?? 'All statuses';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + rem(12) }]}>
          <Text style={styles.title}>Filters</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={draft.address}
            onChangeText={(address) => setDraft((d) => ({ ...d, address }))}
            placeholder="Enter address"
            placeholderTextColor={colors.neutral.grey}
            autoCorrect={false}
          />

          <Text style={styles.label}>Location</Text>
          <View style={styles.row}>
            {(['USA', 'Canada'] as const).map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[
                  styles.chip,
                  draft.locationFilter === loc && styles.chipActive,
                ]}
                onPress={() => setDraft((d) => ({ ...d, locationFilter: loc }))}
              >
                <Text
                  style={[
                    styles.chipText,
                    draft.locationFilter === loc && styles.chipTextActive,
                  ]}
                >
                  {loc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Radius</Text>
          <View style={styles.rowWrap}>
            {RADIUS_MILES_OPTIONS.map((miles) => (
              <TouchableOpacity
                key={miles}
                style={[
                  styles.chip,
                  draft.radiusFilter === miles && styles.chipActive,
                ]}
                onPress={() => setDraft((d) => ({ ...d, radiusFilter: miles }))}
              >
                <Text
                  style={[
                    styles.chipText,
                    draft.radiusFilter === miles && styles.chipTextActive,
                  ]}
                >
                  {miles} mi
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Status</Text>
          <TouchableOpacity
            style={styles.select}
            onPress={() => setStatusPickerOpen(true)}
          >
            <Text style={styles.selectText}>{statusLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Capabilities</Text>
          <View style={styles.rowWrap}>
            {DRIVER_CAPABILITY_FILTER_OPTIONS.map((cap) => {
              const selected = draft.capabilitiesFilter.includes(cap.value);
              return (
                <TouchableOpacity
                  key={cap.value}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => toggleCapability(cap.value)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {cap.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + rem(12) }]}>
          <TouchableOpacity style={styles.resetBtn} onPress={resetAndApply}>
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={statusPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerOpen(false)}
      >
        <Pressable
          style={styles.statusOverlay}
          onPress={() => setStatusPickerOpen(false)}
        >
          <View style={styles.statusSheet}>
            <Text style={styles.statusSheetTitle}>Status</Text>
            <FlatList
              data={statusOptions}
              keyExtractor={(item) => item.value || 'all'}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = draft.statusFilter === item.value;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, selected && styles.optionItemActive]}
                    onPress={() => {
                      setDraft((d) => ({ ...d, statusFilter: item.value }));
                      setStatusPickerOpen(false);
                    }}
                  >
                    <Text
                      style={[styles.optionText, selected && styles.optionTextActive]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.neutral.mapGrey,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(16),
    paddingBottom: rem(12),
    backgroundColor: colors.primary.violet,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: fp(18),
    color: colors.neutral.white,
  },
  close: {
    fontFamily: fonts.medium,
    fontSize: fp(15),
    color: colors.neutral.white,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: rem(16),
    paddingBottom: rem(24),
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fp(13),
    color: colors.neutral.grey,
    marginBottom: rem(8),
    marginTop: rem(12),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(12),
    paddingVertical: Platform.OS === 'ios' ? rem(12) : rem(8),
    fontFamily: fonts.regular,
    fontSize: fp(15),
    color: colors.neutral.black,
    backgroundColor: colors.neutral.white,
  },
  row: { flexDirection: 'row', gap: rem(8) },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: rem(8) },
  chip: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(20),
    paddingHorizontal: rem(12),
    paddingVertical: rem(8),
    backgroundColor: colors.neutral.white,
  },
  chipActive: {
    borderColor: colors.primary.blue,
    backgroundColor: colors.primary.blue,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: fp(13),
    color: colors.neutral.darkGrey,
  },
  chipTextActive: { color: colors.neutral.white },
  select: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(12),
    paddingVertical: rem(12),
    backgroundColor: colors.neutral.white,
  },
  selectText: {
    fontFamily: fonts.regular,
    fontSize: fp(15),
    color: colors.neutral.black,
  },
  footer: {
    flexDirection: 'row',
    gap: rem(12),
    paddingHorizontal: rem(16),
    paddingTop: rem(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.neutral.lightGrey,
    backgroundColor: colors.neutral.white,
  },
  resetBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rem(12),
    borderRadius: rem(10),
    borderWidth: 1,
    borderColor: colors.neutral.mediumGrey,
  },
  resetBtnText: {
    fontFamily: fonts.medium,
    fontSize: fp(15),
    color: colors.neutral.darkGrey,
  },
  applyBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rem(12),
    borderRadius: rem(10),
    backgroundColor: colors.primary.blue,
  },
  applyBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fp(15),
    color: colors.neutral.white,
  },
  statusOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  statusSheet: {
    maxHeight: '70%',
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: rem(16),
    borderTopRightRadius: rem(16),
    paddingBottom: rem(24),
  },
  statusSheetTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fp(16),
    color: colors.neutral.black,
    padding: rem(16),
  },
  optionItem: {
    paddingHorizontal: rem(16),
    paddingVertical: rem(14),
  },
  optionItemActive: {
    backgroundColor: colors.neutral.veryLightGrey,
  },
  optionText: {
    fontFamily: fonts.regular,
    fontSize: fp(15),
    color: colors.neutral.darkGrey,
  },
  optionTextActive: {
    fontFamily: fonts.semiBold,
    color: colors.primary.blue,
  },
});
