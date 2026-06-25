'use client';

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import ScrollPicker from 'react-native-wheel-scrollview-picker';
import { colors, fonts, fp, rem, typography } from '@/lib';
import SelectArrow from '@/icons/SelectArrow';

const RATE_TIME_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

const HOURS_12 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AM_PM = ['AM', 'PM'];

const PICKER_STYLE = {
  wrapperHeight: 120,
  itemHeight: 40,
  highlightColor: colors.primary.violet,
  wrapperBackground: colors.neutral.white,
  activeItemTextStyle: { color: colors.primary.blue, fontFamily: fonts['600'], fontSize: fp(18) },
  itemTextStyle: { color: colors.neutral.darkGrey, fontFamily: fonts['500'], fontSize: fp(16) },
  nestedScrollEnabled: true,
};

function formatTime(hour: number, minute: number, ampm: 'AM' | 'PM'): string {
  const m = String(minute).padStart(2, '0');
  return `${hour}:${m} ${ampm}`;
}

interface CreateRateModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: { rate: string; rateTimeMinutes: number; eta: string }) => void | Promise<void>;
  isSubmitting?: boolean;
  offeredRate?: number | null;
}

export default function CreateRateModal({
  visible,
  onClose,
  onCreate,
  isSubmitting = false,
  offeredRate = null,
}: CreateRateModalProps) {
  const [rate, setRate] = useState('');
  const [rateTimeMinutes, setRateTimeMinutes] = useState<number | null>(null);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEtaPicker, setShowEtaPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const etaDisplay = formatTime(hour, minute, ampm);

  const handleCreate = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);
    const rateTrimmed = rate.trim();
    if (!rateTrimmed) {
      setError('Rate is required');
      return;
    }
    if (rateTimeMinutes == null) {
      setError('Rate time is required');
      return;
    }
    const etaStr = formatTime(hour, minute, ampm);
    await onCreate({
      rate: rateTrimmed,
      rateTimeMinutes,
      eta: etaStr,
    });
  }, [isSubmitting, rate, rateTimeMinutes, hour, minute, ampm, onCreate]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    onClose();
  }, [isSubmitting, onClose]);

  const rateTimeLabel = rateTimeMinutes != null
    ? RATE_TIME_OPTIONS.find((o) => o.value === rateTimeMinutes)?.label ?? 'Select'
    : 'Select';

  const showOfferedRate =
    offeredRate != null && Number.isFinite(Number(offeredRate));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
          disabled={isSubmitting}
        />
        <View style={styles.popupWrapper}>
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Place bid</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                disabled={isSubmitting}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {showOfferedRate ? (
              <View style={styles.offeredRateBlock}>
                <Text style={styles.offeredRateTitle}>Offered Rate</Text>
                <Text style={styles.offeredRateValue}>
                  ${Number(offeredRate).toLocaleString('en-US')}
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Rate ($)</Text>
            <TextInput
              style={[styles.input, error === 'Rate is required' && styles.inputError]}
              value={rate}
              onChangeText={(t) => { setRate(t); setError(null); }}
              placeholder="e.g. 100"
              placeholderTextColor={colors.neutral.darkGrey}
              keyboardType="decimal-pad"
            />

            <Text style={styles.fieldLabel}>Bid timer (min)</Text>
            <TouchableOpacity
              style={[
                styles.selectTrigger,
                error === 'Rate time is required' && styles.inputError,
              ]}
              onPress={() => setShowTimePicker(true)}
              disabled={isSubmitting}
            >
              <Text style={[styles.selectText, !rateTimeMinutes && styles.selectPlaceholder]}>
                {rateTimeLabel}
              </Text>
              <SelectArrow />
            </TouchableOpacity>

            {showTimePicker && (
              <Modal visible transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                  <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={() => setShowTimePicker(false)}
                  />
                  <View style={styles.pickerContent}>
                    <Text style={styles.pickerTitle}>Bid timer</Text>
                    {RATE_TIME_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.pickerOption, rateTimeMinutes === opt.value && styles.pickerOptionActive]}
                        onPress={() => {
                          setRateTimeMinutes(opt.value);
                          setShowTimePicker(false);
                          setError(null);
                        }}
                      >
                        <Text style={[
                          styles.pickerOptionText,
                          rateTimeMinutes === opt.value && styles.pickerOptionTextActive,
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.pickerCancel} onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.pickerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

            <Text style={styles.fieldLabel}>Estimated Time of Arrival</Text>
            <TouchableOpacity
              style={[styles.selectTrigger, styles.selectTriggerNoBottomMargin]}
              onPress={() => setShowEtaPicker(true)}
              disabled={isSubmitting}
            >
              <Text style={styles.selectText}>{etaDisplay}</Text>
              <SelectArrow />
            </TouchableOpacity>
            <Text style={styles.fieldHint}>
              This is when the driver will arrive at the location, not the travel time.
            </Text>

            {showEtaPicker && (
              <Modal visible transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                  <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={() => setShowEtaPicker(false)}
                  />
                  <View style={styles.etaPickerContent}>
                    <Text style={styles.pickerTitle}>Select time</Text>
                    <View style={styles.pickersRow}>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          dataSource={HOURS_12}
                          selectedIndex={HOURS_12.indexOf(String(hour)) >= 0 ? HOURS_12.indexOf(String(hour)) : 0}
                          onValueChange={(val) => val && setHour(parseInt(String(val), 10))}
                          {...PICKER_STYLE}
                        />
                      </View>
                      <Text style={styles.pickerColon}>:</Text>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          dataSource={MINUTES}
                          selectedIndex={MINUTES.indexOf(String(minute).padStart(2, '0')) >= 0 ? MINUTES.indexOf(String(minute).padStart(2, '0')) : 0}
                          onValueChange={(val) => val !== undefined && setMinute(parseInt(String(val), 10))}
                          {...PICKER_STYLE}
                        />
                      </View>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          dataSource={AM_PM}
                          selectedIndex={ampm === 'AM' ? 0 : 1}
                          onValueChange={(val) => val && setAmpm(val as 'AM' | 'PM')}
                          {...PICKER_STYLE}
                        />
                      </View>
                    </View>
                    <TouchableOpacity style={styles.etaSetButton} onPress={() => setShowEtaPicker(false)}>
                      <Text style={styles.etaSetButtonText}>Set</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.createButton, isSubmitting && styles.createButtonDisabled]}
              onPress={handleCreate}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.neutral.white} />
              ) : (
                <Text style={styles.createButtonText}>Place bid</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(24),
  },
  popupWrapper: {
    width: '100%',
    maxWidth: rem(360),
  },
  content: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(20),
  },
  offeredRateBlock: {
    marginBottom: rem(16),
    backgroundColor: 'rgba(112, 255, 174, 0.28)',
    borderRadius: rem(12),
    padding: rem(14),
    borderWidth: 1,
    borderColor: 'rgba(112, 255, 174, 0.55)',
  },
  offeredRateTitle: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(4),
  },
  offeredRateValue: {
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: '#166534',
  },
  title: {
    fontSize: fp(22),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  closeButton: {
    fontSize: fp(22),
    color: colors.neutral.darkGrey,
    paddingHorizontal: rem(4),
  },
  fieldLabel: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
    marginBottom: rem(6),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.primary.blue,
    borderRadius: 10,
    paddingHorizontal: rem(16),
    height: rem(44),
    fontSize: fp(16),
    color: colors.neutral.black,
    marginBottom: rem(16),
  },
  inputError: {
    borderColor: colors.semantic.error,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.primary.blue,
    borderRadius: 10,
    paddingHorizontal: rem(16),
    height: rem(44),
    marginBottom: rem(16),
  },
  selectText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
  },
  selectPlaceholder: {
    color: colors.neutral.darkGrey,
  },
  selectTriggerNoBottomMargin: {
    marginBottom: 0,
  },
  fieldHint: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    marginTop: rem(4),
    marginBottom: rem(16),
    lineHeight: fp(16),
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '80%',
    maxWidth: rem(320),
  },
  pickerTitle: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginBottom: rem(16),
  },
  pickerOption: {
    paddingVertical: rem(12),
    paddingHorizontal: rem(16),
  },
  pickerOptionActive: {
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
  },
  pickerOptionText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
  },
  pickerOptionTextActive: {
    color: colors.primary.violet,
    fontFamily: fonts['600'],
  },
  pickerCancel: {
    marginTop: rem(16),
    paddingVertical: rem(12),
  },
  pickerCancelText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  etaPickerContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '90%',
    maxWidth: rem(340),
  },
  pickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerWrap: {
    width: 80,
    height: 120,
  },
  pickerColon: {
    fontSize: fp(24),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginHorizontal: rem(4),
  },
  etaSetButton: {
    marginTop: rem(20),
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    height: rem(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaSetButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    marginBottom: rem(12),
  },
  createButton: {
    ...typography.buttonGreen,
    marginTop: rem(8),
  },
  createButtonDisabled: {
    opacity: 0.75,
  },
  createButtonText: {
    fontSize: fp(18),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
});
