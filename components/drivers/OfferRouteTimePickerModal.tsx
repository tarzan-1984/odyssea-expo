'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import ScrollPicker from 'react-native-wheel-scrollview-picker';
import { colors, fonts, fp, rem } from '@/lib';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const HOURS_12 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AM_PM = ['AM', 'PM'];

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function buildYearList(): string[] {
  const y = new Date().getFullYear();
  const from = y - 1;
  const to = y + 6;
  const out: string[] = [];
  for (let i = from; i <= to; i += 1) out.push(String(i));
  return out;
}

const YEARS = buildYearList();

/** Matches web DateTimePicker / flatpickr output (lowercase am/pm). */
export function formatOfferRouteDateTime(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  let h24 = d.getHours();
  const minute = d.getMinutes();
  const ampm: 'am' | 'pm' = h24 >= 12 ? 'pm' : 'am';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const minStr = String(minute).padStart(2, '0');
  return `${month}/${day}/${year} ${h12}:${minStr} ${ampm}`;
}

function parseDateTimeFromString(str: string): Date | null {
  const trimmed = str.trim();
  const m = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i
  );
  if (!m) return null;
  const month = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  const period = m[6].toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  const d = new Date(year, month, day, hour, minute, 0, 0);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function parseTimeOnlyFromString(str: string): Date | null {
  const trimmed = str.trim();
  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return null;
  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[3].toUpperCase() as 'AM' | 'PM';
  const d = new Date();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  d.setHours(hour, minute, 0, 0);
  return d;
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

interface OfferRouteTimePickerModalProps {
  visible: boolean;
  initialTime: string;
  onClose: () => void;
  onSet: (time: string) => void;
}

export default function OfferRouteTimePickerModal({
  visible,
  initialTime,
  onClose,
  onSet,
}: OfferRouteTimePickerModalProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [monthIndex, setMonthIndex] = useState(() => new Date().getMonth());
  const [day, setDay] = useState(() => new Date().getDate());
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');

  const dayStrings = useMemo(() => {
    const max = daysInMonth(year, monthIndex);
    return Array.from({ length: max }, (_, i) => String(i + 1));
  }, [year, monthIndex]);

  useEffect(() => {
    if (!visible) return;
    const parsed = parseDateTimeFromString(initialTime) ?? parseTimeOnlyFromString(initialTime);
    if (parsed) {
      setYear(parsed.getFullYear());
      setMonthIndex(parsed.getMonth());
      setDay(parsed.getDate());
      const h24 = parsed.getHours();
      const m = parsed.getMinutes();
      setMinute(m);
      if (h24 >= 12) {
        setAmpm('PM');
        setHour(h24 === 12 ? 12 : h24 - 12);
      } else {
        setAmpm('AM');
        setHour(h24 === 0 ? 12 : h24);
      }
    } else {
      const now = new Date();
      setYear(now.getFullYear());
      setMonthIndex(now.getMonth());
      setDay(now.getDate());
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
  }, [visible, initialTime]);

  useEffect(() => {
    if (!visible) return;
    const max = daysInMonth(year, monthIndex);
    setDay((prev) => (prev > max ? max : prev));
  }, [year, monthIndex, visible]);

  const handleSet = useCallback(() => {
    const max = daysInMonth(year, monthIndex);
    const safeDay = Math.min(day, max);
    let h24: number;
    if (ampm === 'AM') {
      h24 = hour === 12 ? 0 : hour;
    } else {
      h24 = hour === 12 ? 12 : hour + 12;
    }
    const d = new Date(year, monthIndex, safeDay, h24, minute, 0, 0);
    onSet(formatOfferRouteDateTime(d));
    onClose();
  }, [year, monthIndex, day, hour, minute, ampm, onSet, onClose]);

  const hourIndex = HOURS_12.indexOf(String(hour));
  const minuteIndex = MINUTES.indexOf(String(minute).padStart(2, '0'));
  const ampmIndex = ampm === 'AM' ? 0 : 1;
  const dayIndex = Math.max(0, dayStrings.indexOf(String(day)));
  const yearIndex = Math.max(0, YEARS.indexOf(String(year)));
  const monthPickerIndex = monthIndex >= 0 && monthIndex < 12 ? monthIndex : 0;

  const onMonthChange = (val: string | number | undefined) => {
    if (val === undefined) return;
    const idx = MONTH_LABELS.indexOf(String(val));
    if (idx < 0) return;
    setMonthIndex(idx);
    setDay((prev) => Math.min(prev, daysInMonth(year, idx)));
  };

  const onYearChange = (val: string | number | undefined) => {
    if (val === undefined) return;
    const y = parseInt(String(val), 10);
    if (Number.isNaN(y)) return;
    setYear(y);
    setDay((prev) => Math.min(prev, daysInMonth(y, monthIndex)));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={20} tint="light" style={styles.blur} pointerEvents="none" />
        ) : (
          <View style={styles.blurAndroid} pointerEvents="none" />
        )}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Select date & time</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Date</Text>
          <View style={styles.dateRow}>
            <View style={styles.pickerWrapWide}>
              <ScrollPicker
                dataSource={MONTH_LABELS}
                selectedIndex={monthPickerIndex}
                onValueChange={onMonthChange}
                {...PICKER_STYLE}
              />
            </View>
            <View style={styles.pickerWrapNarrow} key={`d-${year}-${monthIndex}`}>
              <ScrollPicker
                dataSource={dayStrings}
                selectedIndex={dayIndex}
                onValueChange={(val) => val !== undefined && setDay(parseInt(String(val), 10))}
                {...PICKER_STYLE}
              />
            </View>
            <View style={styles.pickerWrapYear}>
              <ScrollPicker
                dataSource={YEARS}
                selectedIndex={yearIndex >= 0 ? yearIndex : 0}
                onValueChange={onYearChange}
                {...PICKER_STYLE}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Time</Text>
          <View style={styles.pickersRow}>
            <View style={styles.pickerWrap}>
              <ScrollPicker
                dataSource={HOURS_12}
                selectedIndex={hourIndex >= 0 ? hourIndex : 0}
                onValueChange={(val) => val && setHour(parseInt(String(val), 10))}
                {...PICKER_STYLE}
              />
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.pickerWrap}>
              <ScrollPicker
                dataSource={MINUTES}
                selectedIndex={minuteIndex >= 0 ? minuteIndex : 0}
                onValueChange={(val) => val !== undefined && setMinute(parseInt(String(val), 10))}
                {...PICKER_STYLE}
              />
            </View>
            <View style={styles.pickerWrap}>
              <ScrollPicker
                dataSource={AM_PM}
                selectedIndex={ampmIndex}
                onValueChange={(val) => val && setAmpm(val as 'AM' | 'PM')}
                {...PICKER_STYLE}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.setButton} onPress={handleSet}>
            <Text style={styles.setButtonText}>Set</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  blurAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(360),
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(12),
  },
  title: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  close: {
    fontSize: fp(20),
    color: colors.primary.blue,
    padding: rem(4),
  },
  sectionLabel: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.grey,
    marginBottom: rem(4),
    marginTop: rem(4),
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rem(8),
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
  pickerWrapWide: {
    flex: 1.1,
    maxWidth: rem(88),
    height: 140,
    overflow: 'hidden',
  },
  pickerWrapNarrow: {
    flex: 0.85,
    maxWidth: rem(64),
    height: 140,
    overflow: 'hidden',
  },
  pickerWrapYear: {
    flex: 1,
    maxWidth: rem(88),
    height: 140,
    overflow: 'hidden',
  },
  colon: {
    fontSize: fp(24),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginHorizontal: rem(4),
  },
  setButton: {
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
