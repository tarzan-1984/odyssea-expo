'use client';

import React, { useCallback, useState } from 'react';
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
import { colors, fonts, fp, rem, typography } from '@/lib';
import SelectArrow from '@/icons/SelectArrow';

const EXTEND_TIME_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

interface ExtendTimeModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { extendTimeMinutes: number }) => void | Promise<void>;
  isSubmitting?: boolean;
}

export default function ExtendTimeModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting = false,
}: ExtendTimeModalProps) {
  const [extendTimeMinutes, setExtendTimeMinutes] = useState<number | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);

    if (extendTimeMinutes == null) {
      setError('Extend Bid Time is required');
      return;
    }

    await onSubmit({ extendTimeMinutes });
  }, [extendTimeMinutes, isSubmitting, onSubmit]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    setShowTimePicker(false);
    onClose();
  }, [isSubmitting, onClose]);

  const extendTimeLabel = extendTimeMinutes != null
    ? EXTEND_TIME_OPTIONS.find((option) => option.value === extendTimeMinutes)?.label ?? 'Select'
    : 'Select';

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
              <Text style={styles.title}>Extend Bid Time</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                disabled={isSubmitting}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Extend Bid Time (min)</Text>
            <TouchableOpacity
              style={[
                styles.selectTrigger,
                error === 'Extend Bid Time is required' && styles.inputError,
              ]}
              onPress={() => setShowTimePicker(true)}
              disabled={isSubmitting}
            >
              <Text style={[styles.selectText, !extendTimeMinutes && styles.selectPlaceholder]}>
                {extendTimeLabel}
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
                    <Text style={styles.pickerTitle}>Select Extend Bid Time</Text>
                    {EXTEND_TIME_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.pickerOption,
                          extendTimeMinutes === option.value && styles.pickerOptionActive,
                        ]}
                        onPress={() => {
                          setExtendTimeMinutes(option.value);
                          setShowTimePicker(false);
                          setError(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            extendTimeMinutes === option.value && styles.pickerOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.pickerCancel}
                      onPress={() => setShowTimePicker(false)}
                    >
                      <Text style={styles.pickerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

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
                <Text style={styles.submitButtonText}>Extend Bid Time</Text>
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
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    marginBottom: rem(12),
  },
  submitButton: {
    ...typography.buttonGreen,
    marginTop: rem(8),
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
