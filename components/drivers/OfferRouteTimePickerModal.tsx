'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Switch,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import ScrollPicker from 'react-native-wheel-scrollview-picker';
import { colors, fonts, fp, rem } from '@/lib';
import {
  END_TIME_AFTER_START_ERROR,
  formatOfferDateTimeRange,
  parseOfferDateTimeField,
} from '@/utils/offerDateTimeRange';

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

type Time12Parts = {
  hour: number;
  minute: number;
  ampm: 'AM' | 'PM';
};

function dateTo12hParts(date: Date): Time12Parts {
  const h24 = date.getHours();
  const minute = date.getMinutes();
  if (h24 >= 12) {
    return {
      ampm: 'PM',
      hour: h24 === 12 ? 12 : h24 - 12,
      minute,
    };
  }
  return {
    ampm: 'AM',
    hour: h24 === 0 ? 12 : h24,
    minute,
  };
}

function partsToDate(base: Date, parts: Time12Parts): Date {
  const next = new Date(base);
  let h24: number;
  if (parts.ampm === 'AM') {
    h24 = parts.hour === 12 ? 0 : parts.hour;
  } else {
    h24 = parts.hour === 12 ? 12 : parts.hour + 12;
  }
  next.setHours(h24, parts.minute, 0, 0);
  return next;
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
  const [endTimeEnabled, setEndTimeEnabled] = useState(false);
  const [endHour, setEndHour] = useState(12);
  const [endMinute, setEndMinute] = useState(0);
  const [endAmpm, setEndAmpm] = useState<'AM' | 'PM'>('PM');
  const [rangeError, setRangeError] = useState('');

  const dayStrings = useMemo(() => {
    const max = daysInMonth(year, monthIndex);
    return Array.from({ length: max }, (_, i) => String(i + 1));
  }, [year, monthIndex]);

  useEffect(() => {
    if (!visible) return;
    setRangeError('');

    const { start, end } = parseOfferDateTimeField(initialTime);
    if (start) {
      setYear(start.getFullYear());
      setMonthIndex(start.getMonth());
      setDay(start.getDate());
      const startParts = dateTo12hParts(start);
      setHour(startParts.hour);
      setMinute(startParts.minute);
      setAmpm(startParts.ampm);

      if (end) {
        const endParts = dateTo12hParts(end);
        setEndHour(endParts.hour);
        setEndMinute(endParts.minute);
        setEndAmpm(endParts.ampm);
        setEndTimeEnabled(true);
      } else {
        setEndTimeEnabled(false);
        setEndHour(12);
        setEndMinute(0);
        setEndAmpm('PM');
      }
      return;
    }

    const now = new Date();
    setYear(now.getFullYear());
    setMonthIndex(now.getMonth());
    setDay(now.getDate());
    const nowParts = dateTo12hParts(now);
    setHour(nowParts.hour);
    setMinute(nowParts.minute);
    setAmpm(nowParts.ampm);
    setEndTimeEnabled(false);
    setEndHour(12);
    setEndMinute(0);
    setEndAmpm('PM');
  }, [visible, initialTime]);

  useEffect(() => {
    if (!visible) return;
    const max = daysInMonth(year, monthIndex);
    setDay((prev) => (prev > max ? max : prev));
  }, [year, monthIndex, visible]);

  const handleSet = useCallback(() => {
    const max = daysInMonth(year, monthIndex);
    const safeDay = Math.min(day, max);
    const start = new Date(year, monthIndex, safeDay, 0, 0, 0, 0);
    const startWithTime = partsToDate(start, { hour, minute, ampm });

    if (endTimeEnabled) {
      const endWithTime = partsToDate(start, {
        hour: endHour,
        minute: endMinute,
        ampm: endAmpm,
      });
      if (endWithTime.getTime() <= startWithTime.getTime()) {
        setRangeError(END_TIME_AFTER_START_ERROR);
        return;
      }
      onSet(formatOfferDateTimeRange(startWithTime, endWithTime));
    } else {
      onSet(formatOfferDateTimeRange(startWithTime, null));
    }

    onClose();
  }, [
    year,
    monthIndex,
    day,
    hour,
    minute,
    ampm,
    endTimeEnabled,
    endHour,
    endMinute,
    endAmpm,
    onSet,
    onClose,
  ]);

  const hourIndex = HOURS_12.indexOf(String(hour));
  const minuteIndex = MINUTES.indexOf(String(minute).padStart(2, '0'));
  const ampmIndex = ampm === 'AM' ? 0 : 1;
  const endHourIndex = HOURS_12.indexOf(String(endHour));
  const endMinuteIndex = MINUTES.indexOf(String(endMinute).padStart(2, '0'));
  const endAmpmIndex = endAmpm === 'AM' ? 0 : 1;
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
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

          <View style={styles.endTimeHeader}>
            <Text style={styles.endTimeLabel}>To (optional)</Text>
            <Switch
              value={endTimeEnabled}
              onValueChange={(value) => {
                setEndTimeEnabled(value);
                setRangeError('');
              }}
              trackColor={{ false: colors.neutral.lightGrey, true: colors.primary.violet }}
              thumbColor={colors.neutral.white}
            />
          </View>

          {endTimeEnabled ? (
            <View style={styles.pickersRow}>
              <View style={styles.pickerWrap}>
                <ScrollPicker
                  dataSource={HOURS_12}
                  selectedIndex={endHourIndex >= 0 ? endHourIndex : 0}
                  onValueChange={(val) => {
                    if (val) {
                      setEndHour(parseInt(String(val), 10));
                      setRangeError('');
                    }
                  }}
                  {...PICKER_STYLE}
                />
              </View>
              <Text style={styles.colon}>:</Text>
              <View style={styles.pickerWrap}>
                <ScrollPicker
                  dataSource={MINUTES}
                  selectedIndex={endMinuteIndex >= 0 ? endMinuteIndex : 0}
                  onValueChange={(val) => {
                    if (val !== undefined) {
                      setEndMinute(parseInt(String(val), 10));
                      setRangeError('');
                    }
                  }}
                  {...PICKER_STYLE}
                />
              </View>
              <View style={styles.pickerWrap}>
                <ScrollPicker
                  dataSource={AM_PM}
                  selectedIndex={endAmpmIndex}
                  onValueChange={(val) => {
                    if (val) {
                      setEndAmpm(val as 'AM' | 'PM');
                      setRangeError('');
                    }
                  }}
                  {...PICKER_STYLE}
                />
              </View>
            </View>
          ) : null}

          {rangeError ? <Text style={styles.rangeError}>{rangeError}</Text> : null}
          </ScrollView>

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
    maxHeight: '90%',
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
    marginBottom: rem(12),
  },
  endTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: rem(4),
    marginBottom: rem(12),
  },
  endTimeLabel: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.grey,
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
  rangeError: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    marginBottom: rem(8),
    textAlign: 'center',
  },
  setButton: {
    height: rem(44),
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rem(4),
  },
  setButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
});
