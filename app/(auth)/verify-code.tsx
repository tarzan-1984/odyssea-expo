import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Dimensions, ActivityIndicator, Alert, Animated } from 'react-native';
import ScreenLayout from '@/components/auth/ScreenLayout';
import { borderRadius, colors, fonts, fp, rem, typography } from "@/lib";
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * VerifyAccountCodeScreen - OTP code input screen
 * User enters 6-digit verification code
 * Based on the design with header, code input fields, and action buttons
 */
export default function VerifyAccountCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { method, contact } = params;
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRefs = useRef<TextInput[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { authState, resendOtp, verifyOtp } = useAuth();

  // Animate success message
  useEffect(() => {
    if (successMessage) {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [successMessage, fadeAnim]);

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

  const handleSendCode = async () => {
    const fullCode = code.join('');
    
    if (fullCode.length !== 6) {
      setErrorMessage('Please enter all 6 digits');
      return;
    }

    // Get email from authState or route params
    const userEmail = authState.userEmail || (Array.isArray(contact) ? contact[0] : contact) || '';
    
    if (!userEmail) {
      setErrorMessage('Email not found. Please try again.');
      return;
    }
    
    setIsVerifying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await verifyOtp(userEmail, fullCode);
      
      if (result.success) {
        // Show success message briefly
        setSuccessMessage('Verification successful! Redirecting...');
        
        // Redirect to final verification screen (location setup)
        setTimeout(() => {
          router.replace({ pathname: '/final-verify' });
        }, 1500);
      } else {
        console.error('❌ [VerifyCode] OTP verification failed:', result.error);
        setErrorMessage(result.error || 'Invalid OTP code. Please try again.');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Verification failed. Please try again.';
      console.error('❌ [VerifyCode] OTP verification error:', errorMsg);
      setErrorMessage(errorMsg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    
    setIsResending(true);
    setSuccessMessage(null); // Clear previous message
    
    try {
      const result = await resendOtp();
      
      if (result.success) {
        // Show success message on screen
        const message = result.message || 'New OTP code has been sent to your email';
        setSuccessMessage(message);
        
        // Auto-hide message after 5 seconds
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
      } else {
        Alert.alert(
          'Error',
          result.error || 'Failed to resend OTP code. Please try again.',
          [{ text: 'OK' }]
        );
        console.error('❌ [VerifyCode] Failed to resend OTP:', result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to resend OTP code';
      Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
      console.error('❌ [VerifyCode] Resend OTP error:', error);
    } finally {
      setIsResending(false);
    }
  };

  const isCodeComplete = code.every(digit => digit !== '');

  const Dots = (
    <View style={styles.dots}>
      <View style={styles.dot} />
      <View style={styles.dot} />
      <View style={[styles.dot, styles.dotActive]} />
    </View>
  );

  return (
    <ScreenLayout headerTitle={'Verify account'} headerButtonText={'Cancel'} onHeaderButtonPress={() => router.back()} footer={Dots} >
        <View style={styles.content}>
          <Text style={styles.title}>Verify Account</Text>
          <Text style={styles.subtitle}>Please Enter Your One-Time Verification Code.</Text>
          
          {/* Success message banner */}
          {successMessage && (
            <Animated.View 
              style={[
                styles.successContainer,
                { opacity: fadeAnim }
              ]}
            >
              <Text style={styles.successText}>✅ {successMessage}</Text>
            </Animated.View>
          )}
          
          {/* Error message banner */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>❌ {errorMessage}</Text>
            </View>
          )}
          
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
            style={[styles.button, (!isCodeComplete || isVerifying) && styles.buttonDisabled]}
            onPress={handleSendCode}
            disabled={!isCodeComplete || isVerifying}
          >
            {isVerifying ? (
              <ActivityIndicator color={colors.primary.blue} size="small" />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </TouchableOpacity>
          
          <View style={styles.resendWrap}>
            <Text style={styles.resendWrapText}>Didn't get a code?</Text>
            
            <TouchableOpacity 
              style={[styles.resendButton, isResending && styles.resendButtonDisabled]} 
              onPress={handleResendCode}
              disabled={isResending}
            >
              {isResending ? (
                <ActivityIndicator color={colors.primary.green} size="small" />
              ) : (
                <Text style={styles.resendText}>Resend code</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  resendWrapText: {
    color: colors.neutral.white,
    fontSize: fp(13),
    fontFamily: fonts["300"],
    
  },
  resendWrap: {
    flexDirection: "row",
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingTop: rem(70),
  },
  title: {
    fontSize: fp(20),
    fontFamily: fonts["700"],
    color: colors.neutral.white,
    textAlign: 'center',
    marginBottom: rem(15),
    lineHeight: fp(35),
  },
  subtitle: {
    fontSize: fp(16),
    color: colors.neutral.white,
    textAlign: 'center',
    marginBottom: rem(35),
    paddingHorizontal: 20,
    lineHeight: fp(22),
    fontWeight: '400',
    fontFamily: fonts["700"]
  },
  successContainer: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    borderColor: colors.primary.green,
    borderWidth: 1,
    borderRadius: borderRadius.sm10,
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    marginBottom: rem(20),
    marginHorizontal: rem(20),
  },
  successText: {
    color: colors.primary.green,
    fontSize: fp(14),
    fontFamily: fonts["600"],
    textAlign: 'center',
    lineHeight: fp(20),
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    borderRadius: borderRadius.sm10,
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    marginBottom: rem(20),
    marginHorizontal: rem(20),
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: fp(14),
    fontFamily: fonts["600"],
    textAlign: 'center',
    lineHeight: fp(20),
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: rem(50),
    paddingHorizontal: rem(10),
  },
  codeInput: {
    width: rem(50),
    height: rem(50),
    borderRadius: rem(12),
    backgroundColor: colors.neutral.white,
    fontSize: fp(20),
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    lineHeight: fp(20),
  },
  button: {
    ...typography.buttonGreen,
    marginBottom: rem(23)
  },
  buttonDisabled: {
    ...typography.buttonGreen,
    opacity: 0.8
  },
  buttonText: {
    ...typography.button,
  },
  resendButton: {
    borderWidth: 1,
    borderColor: colors.primary.green,
    borderRadius: borderRadius.sm6,
    paddingHorizontal: rem(18),
    paddingVertical: rem(9),
    alignItems: 'center',
    elevation: 8,
    minWidth: rem(120),
  },
  resendButtonDisabled: {
    opacity: 0.6,
    borderColor: colors.neutral.darkGrey,
  },
  resendText: {
    color: colors.primary.green,
    fontSize: fp(12),
    fontFamily: fonts["300"],
  },
  
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: rem(20),
  },
  dot: {
    width: rem(10),
    height: rem(10),
    borderRadius: borderRadius.full,
    backgroundColor: '#D5D8FC',
    opacity: 0.2,
  },
  dotActive: {
    backgroundColor: colors.neutral.white,
    opacity: 1,
  },
});
