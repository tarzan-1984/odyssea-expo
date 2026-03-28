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
    statusFilter: '',
    capabilitiesFilter: [],
  };
}

interface DriversFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  initial: DriversFiltersState;
  onApply: (next: DriversFiltersState) => void;
  /** When false, "Blocked" and legacy removed statuses are not selectable; draft is sanitized if needed. */
  isAdministrator?: boolean;
}

const DISALLOWED_STATUS_FILTER_FOR_NON_ADMIN = new Set([
  'Blocked',
  'Out of service',
  'On vacation',
  'No updates',
]);

export default function DriversFiltersModal({
  visible,
  onClose,
  initial,
  onApply,
  isAdministrator = false,
}: DriversFiltersModalProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DriversFiltersState>(initial);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const statusOptions = getDriverStatusFilterModalOptions(isAdministrator);

  useEffect(() => {
    if (!visible) return;
    let next = { ...initial };
    if (
      !isAdministrator &&
      next.statusFilter &&
      DISALLOWED_STATUS_FILTER_FOR_NON_ADMIN.has(next.statusFilter)
    ) {
      next = { ...next, statusFilter: '' };
    }
    setDraft(next);
  }, [visible, initial, isAdministrator]);

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
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
          <Text style={styles.sectionLabel}>Address</Text>
          <TextInput
            style={styles.input}
            value={draft.address}
            onChangeText={(t) => setDraft((d) => ({ ...d, address: t }))}
            placeholder="City, state or ZIP"
            placeholderTextColor={colors.neutral.grey}
          />

          <Text style={styles.sectionLabel}>Location</Text>
          <View style={styles.rowChips}>
            {(['USA', 'Canada'] as const).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, draft.locationFilter === c && styles.chipActive]}
                onPress={() => setDraft((d) => ({ ...d, locationFilter: c }))}
              >
                <Text
                  style={[styles.chipText, draft.locationFilter === c && styles.chipTextActive]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Radius (miles)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
            {RADIUS_MILES_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, draft.radiusFilter === r && styles.chipActive]}
                onPress={() => setDraft((d) => ({ ...d, radiusFilter: r }))}
              >
                <Text style={[styles.chipText, draft.radiusFilter === r && styles.chipTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Status</Text>
          <TouchableOpacity
            style={styles.selectTrigger}
            onPress={() => setStatusPickerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.selectTriggerText} numberOfLines={1}>
              {statusLabel}
            </Text>
            <Text style={styles.selectChevron}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Capabilities</Text>
          <View style={styles.capWrap}>
            {DRIVER_CAPABILITY_FILTER_OPTIONS.map((opt) => {
              const on = draft.capabilitiesFilter.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.capChip, on && styles.capChipActive]}
                  onPress={() => toggleCapability(opt.value)}
                >
                  <Text style={[styles.capChipText, on && styles.capChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footerBar,
            {
              paddingBottom: Math.max(insets.bottom, rem(12)),
              paddingTop: rem(12),
            },
          ]}
        >
          <TouchableOpacity style={styles.btnSecondary} onPress={resetAndApply}>
            <Text style={styles.btnSecondaryText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          >
            <Text style={styles.btnPrimaryText}>Apply</Text>
          </TouchableOpacity>
        </View>

        {statusPickerOpen ? (
          <View style={styles.statusOverlay} pointerEvents="box-none">
            <Pressable
              style={styles.statusModalBackdrop}
              onPress={() => setStatusPickerOpen(false)}
            />
            <View style={styles.statusModalCenter} pointerEvents="box-none">
              <View style={styles.statusModalSheet}>
                <Text style={styles.statusModalTitle}>Status</Text>
                <FlatList
                  data={statusOptions}
                  keyExtractor={(item) => item.value || 'all'}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const selected = draft.statusFilter === item.value;
                    return (
                      <TouchableOpacity
                        style={[styles.statusPickerRow, selected && styles.statusPickerRowActive]}
                        onPress={() => {
                          setDraft((d) => ({ ...d, statusFilter: item.value }));
                          setStatusPickerOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.statusPickerRowText,
                            selected && styles.statusPickerRowTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(20),
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
  },
  title: {
    fontSize: fp(24),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  close: {
    fontSize: fp(17),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: rem(20),
  },
  scrollContent: {
    paddingBottom: rem(16),
  },
  sectionLabel: {
    marginTop: rem(18),
    marginBottom: rem(8),
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(14),
    paddingVertical: Platform.OS === 'ios' ? rem(12) : rem(10),
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  rowChips: {
    flexDirection: 'row',
    gap: rem(8),
  },
  hScroll: {
    marginHorizontal: -rem(4),
  },
  chip: {
    paddingHorizontal: rem(14),
    paddingVertical: rem(8),
    borderRadius: rem(20),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    marginRight: rem(8),
    marginBottom: rem(8),
  },
  chipActive: {
    backgroundColor: colors.primary.blue,
    borderColor: colors.primary.blue,
  },
  chipText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  chipTextActive: {
    color: colors.neutral.white,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(14),
    paddingVertical: Platform.OS === 'ios' ? rem(14) : rem(12),
    backgroundColor: colors.neutral.white,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    marginRight: rem(8),
  },
  selectChevron: {
    fontSize: fp(12),
    color: colors.neutral.grey,
  },
  capWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8),
  },
  capChip: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(8),
    backgroundColor: colors.neutral.lightGrey,
  },
  capChipActive: {
    backgroundColor: colors.primary.blue,
  },
  capChipText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  capChipTextActive: {
    color: colors.neutral.white,
  },
  footerBar: {
    flexDirection: 'row',
    gap: rem(12),
    paddingHorizontal: rem(20),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.neutral.lightGrey,
    backgroundColor: colors.neutral.white,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: rem(14),
    borderRadius: rem(10),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: rem(14),
    borderRadius: rem(10),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  statusModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  statusModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: rem(24),
  },
  statusModalSheet: {
    maxHeight: '72%',
    backgroundColor: colors.neutral.white,
    borderRadius: rem(14),
    paddingTop: rem(16),
    paddingBottom: rem(8),
    overflow: 'hidden',
  },
  statusModalTitle: {
    fontSize: fp(17),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
    paddingHorizontal: rem(16),
    marginBottom: rem(8),
  },
  statusPickerRow: {
    paddingVertical: rem(14),
    paddingHorizontal: rem(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral.lightGrey,
  },
  statusPickerRowActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  statusPickerRowText: {
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  statusPickerRowTextActive: {
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
});
