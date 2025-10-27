import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

/**
 * SendCodeToScreen - Modal for choosing verification method
 * User selects how to receive verification code
 * Based on the design with modal overlay and contact selection buttons
 */
export default function SendCodeToScreen() {
  const router = useRouter();
  const handleMethodSelect = (method: 'call' | 'sms' | 'email', contact: string) => {
    router.push({ pathname: '/verify-account-code', params: { method, contact } });
  };

  const handleOverlayPress = () => {
    // Close modal when tapping outside
    router.back();
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity 
        style={styles.overlayTouchable} 
        activeOpacity={1} 
        onPress={handleOverlayPress}
      >
        <View style={styles.modal}>
          <Text style={styles.title}>Send Code To</Text>
          <Text style={styles.subtitle}>Choose Your Two-Factor Authentication Method</Text>
          
          <TouchableOpacity 
            style={styles.methodButton}
            onPress={() => handleMethodSelect('call', '***7805')}
          >
            <Text style={styles.methodText}>Call Me At ***7805</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.methodButton}
            onPress={() => handleMethodSelect('sms', '***7805')}
          >
            <Text style={styles.methodText}>Text Me At ***7805</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.methodButton}
            onPress={() => handleMethodSelect('email', 'O*S@Martlet-Express...')}
          >
            <Text style={styles.methodText}>Email Me At O*S@Martlet-Express...</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTouchable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    width: width * 0.9,
    maxWidth: 400,
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)',
    elevation: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    fontWeight: '400',
  },
  methodButton: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  methodText: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
    fontWeight: '500',
  },
});
