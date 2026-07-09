'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, fonts, fp, rem, typography } from '@/lib';

const RATE_INCREASE_ERROR_MESSAGE =
  "If you'd like to lower your rate, you may enter a new rate here. If you'd like to increase your bid, please wait until your bid timer expires before submitting a new bid.";

interface EditRateModalProps {
  visible: boolean;
  currentRate: number | null;
  onClose: () => void;
  onSubmit: (rate: string) => void | Promise<void>;
  isSubmitting?: boolean;
}

export default function EditRateModal({
  visible,
  currentRate,
  onClose,
  onSubmit,
  isSubmitting = false,
}: EditRateModalProps) {
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setRate('');
      setError(null);
    }
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);

    const rateTrimmed = rate.trim();
    if (!rateTrimmed) {
      setError('Rate is required');
      return;
    }

    const nextRate = Number(rateTrimmed.replace(/,/g, ''));
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      setError('Enter a valid rate');
      return;
    }

    if (currentRate != null && nextRate >= currentRate) {
      setError(RATE_INCREASE_ERROR_MESSAGE);
      return;
    }

    await onSubmit(rateTrimmed);
  }, [currentRate, isSubmitting, onSubmit, rate]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    onClose();
  }, [isSubmitting, onClose]);

  const currentRateLabel =
    currentRate != null && Number.isFinite(currentRate)
      ? `$${Number(currentRate).toLocaleString('en-US')}`
      : '—';

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
              <Text style={styles.title}>Edit rate</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                disabled={isSubmitting}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.currentRateText}>
              Current rate: <Text style={styles.currentRateValue}>{currentRateLabel}</Text>
            </Text>

            <Text style={styles.fieldLabel}>New rate ($)</Text>
            <TextInput
              style={[styles.input, error != null && styles.inputError]}
              value={rate}
              onChangeText={(value) => {
                setRate(value);
                setError(null);
              }}
              placeholder="Enter a lower rate"
              placeholderTextColor={colors.neutral.darkGrey}
              keyboardType="decimal-pad"
            />

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
  currentRateText: {
    fontSize: fp(15),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    marginBottom: rem(16),
  },
  currentRateValue: {
    fontFamily: fonts['700'],
    color: colors.neutral.black,
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
    marginBottom: rem(12),
  },
  inputError: {
    borderColor: colors.semantic.error,
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    marginBottom: rem(12),
    lineHeight: fp(20),
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
