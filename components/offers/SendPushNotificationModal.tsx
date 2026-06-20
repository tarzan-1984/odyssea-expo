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
  TextInput,
} from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import { sendCustomPushNotification } from '@/app-api/notifications';

export interface SendPushNotificationDriver {
  driver_id: string;
  externalId: string | null;
  firstName: string;
  lastName: string;
}

interface SendPushNotificationModalProps {
  visible: boolean;
  onClose: () => void;
  driver: SendPushNotificationDriver | null;
  defaultMessage: string;
}

function driverShortLabel(driver: SendPushNotificationDriver): string {
  const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim() || '—';
  return driver.externalId ? `${name} (ID: ${driver.externalId})` : name;
}

export default function SendPushNotificationModal({
  visible,
  onClose,
  driver,
  defaultMessage,
}: SendPushNotificationModalProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMessage(defaultMessage);
      setError(null);
      setSuccess(null);
    }
  }, [visible, defaultMessage, driver?.driver_id, driver?.externalId]);

  const handleClose = useCallback(() => {
    if (sending) return;
    onClose();
  }, [onClose, sending]);

  const handleSubmit = useCallback(async () => {
    if (sending || !driver) return;

    const text = message.trim();
    if (!text) {
      setError('Please enter a message.');
      return;
    }

    const externalId = driver.externalId?.trim();
    const userId = driver.driver_id?.trim();

    if (!externalId && !userId) {
      setError('Driver identifier is missing.');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await sendCustomPushNotification({
        message: text,
        externalId: externalId || null,
        userId: externalId ? null : userId,
        platform: null,
      });

      if (!result.success) {
        setError(result.error ?? 'Failed to send push notification.');
        return;
      }

      setSuccess('Push sent.');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch {
      setError('Network error while sending push.');
    } finally {
      setSending(false);
    }
  }, [driver, message, onClose, sending]);

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
          disabled={sending}
        />
        <View style={styles.popupWrapper}>
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Send push notification</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                disabled={sending}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {driver ? (
              <Text style={styles.driverLabel}>{driverShortLabel(driver)}</Text>
            ) : null}

            <Text style={styles.fieldLabel}>Message</Text>
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              editable={!sending}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.cancelButton, sending && styles.buttonDisabled]}
                onPress={handleClose}
                disabled={sending}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={sending || !driver}
                activeOpacity={0.7}
              >
                {sending ? (
                  <ActivityIndicator color={colors.neutral.white} />
                ) : (
                  <Text style={styles.sendButtonText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
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
    marginBottom: rem(8),
  },
  title: {
    flex: 1,
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    paddingRight: rem(8),
  },
  closeButton: {
    fontSize: fp(22),
    color: colors.neutral.darkGrey,
    paddingHorizontal: rem(4),
  },
  driverLabel: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    marginBottom: rem(16),
  },
  fieldLabel: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
    marginBottom: rem(6),
  },
  messageInput: {
    minHeight: rem(120),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    marginBottom: rem(8),
  },
  successText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.success,
    marginBottom: rem(8),
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: rem(12),
    marginTop: rem(8),
  },
  cancelButton: {
    minWidth: rem(88),
    height: rem(40),
    borderRadius: rem(8),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rem(16),
  },
  cancelButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  sendButton: {
    minWidth: rem(88),
    height: rem(40),
    borderRadius: rem(8),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rem(16),
  },
  sendButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
