'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Calendar } from 'react-native-calendars';
import ScrollPicker from 'react-native-wheel-scrollview-picker';
import { colors, fonts, fp, rem } from '@/lib';

/**
 * Parse MM/DD/YY or MM/DD/YY h:mm AM/PM to Date
 */
function parseDisplayDate(str: string): Date | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const datePart = trimmed.split(' ')[0] || '';
  const parts = datePart.split('/');
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
 * Parse time from "h:mm AM/PM" or "hh:mm AM/PM"
 */
function parseTimeFromString(str: string): { hour: number; minute: number; ampm: 'AM' | 'PM' } | null {
  const trimmed = str.trim();
  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return null;
  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[3].toUpperCase() as 'AM' | 'PM';
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const displayHour = hour > 12 ? hour - 12 : hour || 12;
  return { hour: displayHour, minute, ampm };
}

/**
 * Format Date to MM/DD/YY
 */
function formatDisplayDateOnly(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

/**
 * Format to MM/DD/YY h:mm AM/PM (e.g. "02/11/26 2:30 PM")
 */
function formatDisplayDateWithTime(
  dateStr: string,
  hour: number,
  minute: number,
  ampm: 'AM' | 'PM'
): string {
  const m = String(minute).padStart(2, '0');
  return `${dateStr} ${hour}:${m} ${ampm}`;
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

/** Build Date from YYYY-MM-DD + 12h time (hour 1-12, minute, ampm) */
function buildDateFromParts(
  dateStr: string,
  hour: number,
  minute: number,
  ampm: 'AM' | 'PM'
): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  let h24 = hour;
  if (ampm === 'PM' && hour !== 12) h24 = hour + 12;
  if (ampm === 'AM' && hour === 12) h24 = 0;
  return new Date(y, m - 1, d, h24, minute, 0, 0);
}

/** Check if chosen date+time is in the past */
function isChosenTimeInPast(
  selectedDate: string,
  hour: number,
  minute: number,
  ampm: 'AM' | 'PM'
): boolean {
  return buildDateFromParts(selectedDate, hour, minute, ampm) <= new Date();
}

const HOURS_12 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AM_PM = ['AM', 'PM'];

interface DateEditPopupProps {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSet: (date: string) => void;
}

const PICKER_STYLE = {
  wrapperHeight: 140,
  itemHeight: 44,
  highlightColor: colors.primary.violet,
  wrapperBackground: colors.neutral.white,
  activeItemTextStyle: { color: colors.primary.blue, fontFamily: fonts['600'], fontSize: fp(18) },
  itemTextStyle: { color: colors.neutral.darkGrey, fontFamily: fonts['500'], fontSize: fp(16) },
  nestedScrollEnabled: true,
};

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
  const [showTimeOverlay, setShowTimeOverlay] = useState(false);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const hourRef = useRef<any>(null);
  const minuteRef = useRef<any>(null);
  const ampmRef = useRef<any>(null);

  const todayStr = toCalendarDate(new Date());

  useEffect(() => {
    if (visible) {
      setShowTimeOverlay(false);
      const today = new Date();
      const tStr = toCalendarDate(today);
      const parsed = parseDisplayDate(initialValue);
      const timeParsed = parseTimeFromString(initialValue);
      if (parsed) {
        const parsedStr = toCalendarDate(parsed);
        // Only use parsed date if it's today or in the future
        setSelectedDate(parsedStr >= tStr ? parsedStr : tStr);
      } else {
        setSelectedDate(tStr);
      }
      if (timeParsed) {
        setHour(timeParsed.hour);
        setMinute(timeParsed.minute);
        setAmpm(timeParsed.ampm);
      } else {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        setMinute(m);
        if (h >= 12) {
          setAmpm('PM');
          setHour(h === 12 ? 12 : h - 12);
        } else {
          setAmpm('AM');
          setHour(h === 0 ? 12 : h);
        }
      }
    }
  }, [visible, initialValue]);

  // When opening time overlay for today, ensure time is not in the past
  useEffect(() => {
    if (showTimeOverlay && selectedDate === todayStr) {
      const now = new Date();
      let m = now.getMinutes();
      let h = now.getHours();
      m += 1;
      if (m >= 60) {
        m = 0;
        h += 1;
        if (h >= 24) h = 0;
      }
      setMinute(m);
      if (h >= 12) {
        setAmpm('PM');
        setHour(h === 12 ? 12 : h - 12);
      } else {
        setAmpm('AM');
        setHour(h === 0 ? 12 : h);
      }
    }
  }, [showTimeOverlay, selectedDate, todayStr]);

  const handleDayPress = useCallback((day: { dateString: string }) => {
    setSelectedDate(day.dateString);
    setShowTimeOverlay(true);
  }, []);

  const closeTimeOverlay = useCallback(() => {
    setShowTimeOverlay(false);
  }, []);

  const handleSetFromOverlay = useCallback(() => {
    if (!selectedDate) return;
    if (selectedDate === todayStr && isChosenTimeInPast(selectedDate, hour, minute, ampm)) {
      Alert.alert(
        'Invalid time',
        'Please select a time that has not passed yet.',
        [{ text: 'OK' }]
      );
      return;
    }
    const dateStr = selectedDate.split('-');
    const m = dateStr[1];
    const d = dateStr[2];
    const y = dateStr[0].slice(-2);
    const datePart = `${m}/${d}/${y}`;
    const value = formatDisplayDateWithTime(datePart, hour, minute, ampm);
    onSet(value);
    onClose();
  }, [selectedDate, todayStr, hour, minute, ampm, onSet, onClose]);

  const handleSetFromCalendar = useCallback(() => {
    if (!selectedDate) return;
    if (selectedDate === todayStr && isChosenTimeInPast(selectedDate, hour, minute, ampm)) {
      Alert.alert(
        'Invalid time',
        'Please select a time that has not passed yet.',
        [{ text: 'OK' }]
      );
      return;
    }
    const datePart = `${selectedDate.split('-')[1]}/${selectedDate.split('-')[2]}/${selectedDate.split('-')[0].slice(-2)}`;
    onSet(formatDisplayDateWithTime(datePart, hour, minute, ampm));
    onClose();
  }, [selectedDate, todayStr, hour, minute, ampm, onSet, onClose]);

  const markedDates = selectedDate
    ? {
        [selectedDate]: {
          selected: true,
          selectedColor: colors.primary.violet,
          selectedTextColor: colors.neutral.white,
        },
      }
    : {};

  const currentMonth = selectedDate || todayStr;

  const hourIndex = HOURS_12.indexOf(String(hour));
  const minuteIndex = MINUTES.indexOf(String(minute).padStart(2, '0'));
  const ampmIndex = ampm === 'AM' ? 0 : 1;

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
              minDate={todayStr}
              onDayPress={handleDayPress}
              markedDates={markedDates}
              theme={CALENDAR_THEME}
              style={styles.calendar}
              enableSwipeMonths
              disableAllTouchEventsForDisabledDays
            />
            <View style={styles.buttonsRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.setButton}
                onPress={showTimeOverlay ? handleSetFromOverlay : handleSetFromCalendar}
              >
                <Text style={styles.setButtonText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showTimeOverlay && (
            <View style={styles.timeOverlayContainer}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={20} tint="light" style={styles.timeOverlayBlur} pointerEvents="none" />
              ) : (
                <View style={styles.timeOverlayBlurAndroid} pointerEvents="none" />
              )}
              <TouchableOpacity
                style={styles.timeOverlayBackdrop}
                activeOpacity={1}
                onPress={closeTimeOverlay}
              />
              <View style={styles.timeOverlayContent}>
                    <View style={styles.timeOverlayHeader}>
                      <Text style={styles.timeOverlayTitle}>Select time</Text>
                      <TouchableOpacity onPress={closeTimeOverlay} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Text style={styles.timeOverlayClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.pickersRow}>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          ref={hourRef}
                          dataSource={HOURS_12}
                          selectedIndex={hourIndex >= 0 ? hourIndex : 0}
                          onValueChange={(val) => val && setHour(parseInt(String(val), 10))}
                          {...PICKER_STYLE}
                        />
                      </View>
                      <Text style={styles.pickerColon}>:</Text>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          ref={minuteRef}
                          dataSource={MINUTES}
                          selectedIndex={minuteIndex >= 0 ? minuteIndex : 0}
                          onValueChange={(val) => val !== undefined && setMinute(parseInt(String(val), 10))}
                          {...PICKER_STYLE}
                        />
                      </View>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          ref={ampmRef}
                          dataSource={AM_PM}
                          selectedIndex={ampmIndex}
                          onValueChange={(val) => val && setAmpm(val as 'AM' | 'PM')}
                          {...PICKER_STYLE}
                        />
                      </View>
                    </View>
                    <TouchableOpacity style={styles.timeSetButton} onPress={handleSetFromOverlay}>
                      <Text style={styles.timeSetButtonText}>Set</Text>
                    </TouchableOpacity>
                  </View>
            </View>
          )}
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
  timeOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  timeOverlayBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  timeOverlayBlurAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  timeOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  timeOverlayContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(320),
    zIndex: 10,
  },
  timeOverlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(16),
  },
  timeOverlayTitle: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  timeOverlayClose: {
    fontSize: fp(20),
    color: colors.primary.blue,
    padding: rem(4),
  },
  pickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rem(20),
  },
  pickerWrap: {
    flex: 1,
    maxWidth: rem(80),
    height: 140,
    overflow: 'hidden',
  },
  pickerColon: {
    fontSize: fp(24),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginHorizontal: rem(4),
  },
  timeSetButton: {
    height: rem(44),
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSetButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
});
