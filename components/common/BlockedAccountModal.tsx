import React from 'react';
import { View, Text, StyleSheet, Modal, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '@/lib/colors';
import { fonts, fp, rem } from '@/lib';

interface BlockedAccountModalProps {
  visible: boolean;
}

export default function BlockedAccountModal({ visible }: BlockedAccountModalProps) {
  const handleEmailPress = () => {
    Linking.openURL('mailto:HR@odysseia.one').catch((err) => {
      console.error('Failed to open email:', err);
    });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.modalContent}>
          <Text style={styles.modalText}>
            Your account have been suspended, for more information you may contact{' '}
            <Text style={styles.emailLink} onPress={handleEmailPress}>
              HR@odysseia.one
            </Text>
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 0, 0, 0.5)', // Red background with 0.5 opacity
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(20),
  },
  modalContent: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(400),
    alignItems: 'center',
  },
  modalText: {
    fontSize: fp(25),
    fontFamily: fonts["700"],
    color: colors.neutral.black,
    textAlign: 'center',
    lineHeight: fp(35),
  },
  emailLink: {
    color: colors.primary.blue,
    textDecorationLine: 'underline',
  },
});
