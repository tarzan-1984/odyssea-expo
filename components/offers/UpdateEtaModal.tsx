'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import ScrollPicker from 'react-native-wheel-scrollview-picker';
import { colors, fonts, fp, rem, typography } from '@/lib';
import SelectArrow from '@/icons/SelectArrow';

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

function parseEtaParts(value: string | null | undefined): {
  hour: number;
  minute: number;
  ampm: 'AM' | 'PM';
} {
  const trimmed = value?.trim() ?? '';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return { hour: 12, minute: 0, ampm: 'PM' };
  }

  const hour = Math.min(12, Math.max(1, parseInt(match[1], 10) || 12));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10) || 0));
  const ampm = match[3].toUpperCase() === 'AM' ? 'AM' : 'PM';
  return { hour, minute, ampm };
}

interface UpdateEtaModalProps {
  visible: boolean;
  currentEta?: string | null;
  onClose: () => void;
  onSubmit: (eta: string) => void | Promise<void>;
  isSubmitting?: boolean;
}

export default function UpdateEtaModal({
  visible,
  currentEta = null,
  onClose,
  onSubmit,
  isSubmitting = false,
}: UpdateEtaModalProps) {
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const [showEtaPicker, setShowEtaPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setShowEtaPicker(false);
      setError(null);
      return;
    }

    const parts = parseEtaParts(currentEta);
    setHour(parts.hour);
    setMinute(parts.minute);
    setAmpm(parts.ampm);
  }, [visible, currentEta]);

  const etaDisplay = formatTime(hour, minute, ampm);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);
    await onSubmit(formatTime(hour, minute, ampm));
  }, [ampm, hour, isSubmitting, minute, onSubmit]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    onClose();
  }, [isSubmitting, onClose]);

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
              <Text style={styles.title}>Update ETA</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                disabled={isSubmitting}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {currentEta?.trim() ? (
              <Text style={styles.currentEtaText}>
                Current ETA: <Text style={styles.currentEtaValue}>{currentEta.trim()}</Text>
              </Text>
            ) : null}

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

            {showEtaPicker ? (
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
                          selectedIndex={
                            HOURS_12.indexOf(String(hour)) >= 0
                              ? HOURS_12.indexOf(String(hour))
                              : 0
                          }
                          onValueChange={(val) => val && setHour(parseInt(String(val), 10))}
                          {...PICKER_STYLE}
                        />
                      </View>
                      <Text style={styles.pickerColon}>:</Text>
                      <View style={styles.pickerWrap}>
                        <ScrollPicker
                          dataSource={MINUTES}
                          selectedIndex={
                            MINUTES.indexOf(String(minute).padStart(2, '0')) >= 0
                              ? MINUTES.indexOf(String(minute).padStart(2, '0'))
                              : 0
                          }
                          onValueChange={(val) =>
                            val !== undefined && setMinute(parseInt(String(val), 10))
                          }
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
                    <TouchableOpacity
                      style={styles.etaSetButton}
                      onPress={() => setShowEtaPicker(false)}
                    >
                      <Text style={styles.etaSetButtonText}>Set</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            ) : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.neutral.white} />
              ) : (
                <Text style={styles.submitButtonText}>Save</Text>
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
    marginBottom: rem(16),
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
  currentEtaText: {
    fontSize: fp(15),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    marginBottom: rem(16),
  },
  currentEtaValue: {
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  fieldLabel: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
    marginBottom: rem(6),
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
  selectTriggerNoBottomMargin: {
    marginBottom: 0,
  },
  selectText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
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
  etaPickerContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '90%',
    maxWidth: rem(340),
  },
  pickerTitle: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginBottom: rem(16),
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
  submitButton: {
    ...typography.buttonGreen,
    marginTop: rem(4),
  },
  submitButtonDisabled: {
    opacity: 0.75,
  },
  submitButtonText: {
    fontSize: fp(18),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
});
