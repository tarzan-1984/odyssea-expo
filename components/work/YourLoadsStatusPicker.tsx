import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, rem, fp } from '@/lib';
import {
  DRIVER_LOAD_STATUS_OPTIONS,
  type DriverLoadStatusValue,
  labelForDriverLoadStatus,
} from '@/constants/driverLoadStatuses';

type Props = {
  value: DriverLoadStatusValue;
  onChange: (value: DriverLoadStatusValue) => void;
};

export default function YourLoadsStatusPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const sheetBottomPad = rem(16) + insets.bottom;
  const listBottomPad = rem(20) + insets.bottom;

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Load status filter"
      >
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {labelForDriverLoadStatus(value)}
        </Text>
        <Ionicons name="chevron-down" size={rem(20)} color={colors.primary.blue} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: sheetBottomPad }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Load status</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={rem(26)} color={colors.neutral.darkGrey} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[...DRIVER_LOAD_STATUS_OPTIONS]}
              keyExtractor={(item) => item.value}
              contentContainerStyle={{ paddingBottom: listBottomPad }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionRow, item.value === value && styles.optionRowActive]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[styles.optionText, item.value === value && styles.optionTextActive]}
                  >
                    {item.label}
                  </Text>
                  {item.value === value ? (
                    <Ionicons name="checkmark" size={rem(22)} color={colors.primary.blue} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: rem(16),
    marginTop: rem(10),
    marginBottom: rem(8),
    paddingVertical: rem(12),
    paddingHorizontal: rem(14),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(10),
    borderWidth: 1,
    borderColor: 'rgba(13, 26, 45, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  triggerLabel: {
    flex: 1,
    marginRight: rem(8),
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '72%',
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: rem(16),
    borderTopRightRadius: rem(16),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(16),
    paddingVertical: rem(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 26, 45, 0.12)',
  },
  sheetTitle: {
    fontSize: fp(17),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rem(14),
    paddingHorizontal: rem(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 26, 45, 0.08)',
  },
  optionRowActive: {
    backgroundColor: 'rgba(0, 102, 204, 0.06)',
  },
  optionText: {
    flex: 1,
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  optionTextActive: {
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
});
