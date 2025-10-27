import React, { useState, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Dimensions } from 'react-native';
import ScreenLayout from '@/components/auth/ScreenLayout';

const { width } = Dimensions.get('window');

/**
 * VerifyAccountCodeScreen - OTP code input screen
 * User enters 6-digit verification code
 * Based on the design with header, code input fields, and action buttons
 */
export default function VerifyAccountCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { method, contact } = params;
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<TextInput[]>([]);

  const handleCodeChange = (value: string, index: number) => {
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSendCode = () => {
    const fullCode = code.join('');
    if (fullCode.length === 6) {
      // TODO: Implement code verification
      console.log('Verifying code:', fullCode);
      router.push({ pathname: '/final-verify' });
    }
  };

  const handleResendCode = () => {
    // TODO: Implement resend code
    console.log('Resend code to:', contact);
  };

  const isCodeComplete = code.every(digit => digit !== '');

  return (
    <ScreenLayout headerTitle={'Verify account'} headerButtonText={'Cancel'} onHeaderButtonPress={() => router.back()} >
      <View style={styles.container}>
        {/* Header with title and cancel button */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Verify Account</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
        </View>
        
         Main content
        <View style={styles.content}>
          <Text style={styles.title}>Verify Account</Text>
          <Text style={styles.subtitle}>Please Enter Your One-Time Verification Code.</Text>
          
          <View style={styles.codeContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  if (ref) inputRefs.current[index] = ref;
                }}
                style={styles.codeInput}
                value={digit}
                onChangeText={(value) => handleCodeChange(value, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                keyboardType="numeric"
                maxLength={1}
                textAlign="center"
                autoFocus={index === 0}
              />
            ))}
          </View>
          
          <TouchableOpacity
            style={[styles.button, !isCodeComplete && styles.buttonDisabled]}
            onPress={handleSendCode}
            disabled={!isCodeComplete}
          >
            <Text style={styles.buttonText}>Send code</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.resendButton} onPress={handleResendCode}>
            <Text style={styles.resendText}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenLayout>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  cancelButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 50,
    lineHeight: 22,
    fontWeight: '400',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 50,
    paddingHorizontal: 10,
  },
  codeInput: {
    width: 50,
    height: 60,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F8F8F8',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    boxShadow: '0px 4px 8px rgba(0, 122, 255, 0.3)',
    elevation: 8,
  },
  buttonDisabled: {
    backgroundColor: '#C7C7CC',
    boxShadow: 'none',
    elevation: 0,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  resendButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    boxShadow: '0px 4px 8px rgba(52, 199, 89, 0.3)',
    elevation: 8,
  },
  resendText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});
