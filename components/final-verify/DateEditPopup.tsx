'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { colors, fonts, fp, rem } from '@/lib';

/**
 * Parse MM/DD/YY or MM/DD/YYYY to Date
 */
function parseDisplayDate(str: string): Date | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Format Date to MM/DD/YY
 */
function formatDisplayDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

/**
 * Format Date to YYYY-MM-DD (calendar format)
 */
function toCalendarDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DateEditPopupProps {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSet: (date: string) => void;
}

const CALENDAR_THEME = {
  todayTextColor: colors.primary.blue,
  selectedDayBackgroundColor: colors.primary.violet,
  selectedDayTextColor: colors.neutral.white,
  arrowColor: colors.primary.blue,
  monthTextColor: colors.primary.blue,
  textDayFontFamily: fonts['500'],
  textMonthFontFamily: fonts['600'],
  textDayHeaderFontFamily: fonts['500'],
};

export default function DateEditPopup({ visible, initialValue, onClose, onSet }: DateEditPopupProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const parsed = parseDisplayDate(initialValue);
      if (parsed) {
        setSelectedDate(toCalendarDate(parsed));
      } else {
        const today = new Date();
        setSelectedDate(toCalendarDate(today));
      }
    }
  }, [visible, initialValue]);

  const handleDayPress = useCallback((day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  }, []);

  const handleSet = useCallback(() => {
    if (selectedDate) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      onSet(formatDisplayDate(date));
    }
    onClose();
  }, [selectedDate, onSet, onClose]);

  const markedDates = selectedDate
    ? {
        [selectedDate]: {
          selected: true,
          selectedColor: colors.primary.violet,
          selectedTextColor: colors.neutral.white,
        },
      }
    : {};

  const currentMonth = selectedDate || toCalendarDate(new Date());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlayRoot}>
        <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.content}>
          <Text style={styles.label}>Date</Text>
          <Calendar
            current={currentMonth}
            onDayPress={handleDayPress}
            markedDates={markedDates}
            theme={CALENDAR_THEME}
            style={styles.calendar}
            enableSwipeMonths
          />
          <View style={styles.buttonsRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.setButton} onPress={handleSet}>
              <Text style={styles.setButtonText}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  content: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(360),
  },
  label: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginBottom: rem(12),
  },
  calendar: {
    borderRadius: rem(12),
    marginBottom: rem(16),
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: rem(12),
  },
  cancelButton: {
    flex: 1,
    height: rem(44),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colors.primary.blue,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
  setButton: {
    flex: 1,
    height: rem(44),
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
});
