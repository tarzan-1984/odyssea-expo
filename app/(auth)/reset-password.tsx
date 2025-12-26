import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import ScreenLayout from '@/components/auth/ScreenLayout';
import { borderRadius, colors, fonts, typography, rem, fp } from "@/lib";
import { useAuth } from '@/context/AuthContext';
import ArrowRight from "@/icons/ArrowRight";
import { resetPasswordForMobile } from '@/app-api/users';

/**
 * ResetPasswordScreen - Reset password screen
 * User enters email to receive password reset instructions
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { authState, clearError } = useAuth();
  
  // Initialize email with userEmail from authState if available
  const [email, setEmail] = useState(authState.userEmail || '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Update email if authState.userEmail changes (e.g., user navigates back and enters email)
  useEffect(() => {
    if (authState.userEmail && !email) {
      setEmail(authState.userEmail);
    }
  }, [authState.userEmail]);

  // Simple email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleResetPassword = async () => {
    // Clear previous errors and success messages
    setLocalError(null);
    setSuccess(null);
    clearError();

    // Validate email
    if (!email.trim()) {
      setLocalError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setLocalError('Please enter a valid email address');
      return;
    }

    // Set loading state
    setIsLoading(true);

    try {
      console.log('[ResetPassword] Sending reset password request for email:', email.trim());
      
      // Call backend API to reset password
      const result = await resetPasswordForMobile(email.trim());
      
      console.log('[ResetPassword] Password reset successful:', result.message);
      
      // Show success message
      setSuccess('A new password has been sent to your email');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setLocalError(errorMessage);
      console.error('[ResetPassword] Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenLayout headerTitle={'Reset password'} headerButtonText={'Enter password'} onHeaderButtonPress={() => router.back()}>
      <View style={[styles.container, (success || localError) && styles.containerWithMessage]}>
        
        <Text style={styles.title}>Please confirm your email address and we will send you an updated password.</Text>
        
        {/* Show success message */}
        {success && (
          <View style={styles.infoContainer}>
            <Text style={styles.infoText} accessibilityRole="text">
              {success}
            </Text>
          </View>
        )}
        
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              (localError || authState.error) && styles.inputError
            ]}
            placeholder="Enter your email address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (localError) setLocalError(null); // Clear error when user types
              if (authState.error) clearError();
              if (success) setSuccess(null); // Clear success when user types
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.neutral.white}
            accessibilityLabel="Email input"
            accessibilityHint="Enter your email address"
            editable={!isLoading}
          />
        </View>
        
        <TouchableOpacity
          style={[
            styles.button,
            (!email.trim() || isLoading) && styles.buttonDisabled
          ]}
          onPress={handleResetPassword}
          disabled={!email.trim() || isLoading}
          accessibilityRole="button"
          accessibilityLabel="Reset password"
          accessibilityHint="Send password reset instructions to your email"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.neutral.white} size="small" />
          ) : (
            <>
              <Text style={styles.buttonText}>Reset password</Text>
              <ArrowRight />
            </>
          )}
        </TouchableOpacity>
        
        {(localError || authState.error) && (
          <Text style={[styles.messageText, styles.errorText]}>
            {localError || authState.error}
          </Text>
        )}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  messageText: {
    fontSize: fp(14),
    textAlign: 'center',
    marginTop: rem(8),
    fontFamily: fonts["400"],
    marginBottom: rem(50),
  },
  title: {
    fontSize: fp(22),
    fontFamily: fonts["700"],
    color: colors.neutral.white,
    textAlign: 'center',
    marginBottom: rem(70),
    lineHeight: fp(35),
  },
  errorText: {
    color: '#FF6B6B',
  },
  successText: {
    color: '#4CAF50',
  },
  forgotText: {
    color: colors.neutral.white,
    fontSize: fp(15),
    fontFamily: fonts["300"],
    letterSpacing: 0.15,
  },
  forgotWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(8),
    marginBottom: rem(50),
  },
  container: {
    paddingTop: rem(50),
    paddingHorizontal: rem(26),
    flex: 1,
  },
  containerWithMessage: {
    paddingTop: rem(20), // Minimal top padding when the message is visible
  },
  infoContainer: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderColor: '#34C759',
    borderWidth: 1,
    borderRadius: borderRadius.sm10,
    paddingHorizontal: rem(16),
    paddingVertical: rem(12),
    marginBottom: rem(16),
  },
  infoText: {
    color: colors.neutral.white,
    fontSize: fp(13),
    fontFamily: fonts["400"],
    textAlign: 'center',
    lineHeight: fp(18),
  },
  inputContainer: {
    position: 'relative',
    marginBottom: rem(20),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.white,
    borderRadius: borderRadius.sm10,
    paddingHorizontal: rem(20),
    paddingRight: rem(50),
    fontSize: fp(16),
    height: 50,
    textAlign: 'center',
    backgroundColor: 'transparent',
    color: colors.neutral.white,
  },
  showPasswordButton: {
    position: 'absolute',
    right: 15,
    top: 10,
    padding: 5,
  },
  inputError: {
    borderColor: '#FF6B6B',
    borderWidth: 2,
  },
  button: {
    ...typography.buttonGreen,
  },
  buttonDisabled: {
    ...typography.buttonGreen,
    opacity: 0.8
  },
  buttonText: {
    ...typography.button,
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
    marginBottom: rem(50),
  },
  dotActive: {
    backgroundColor: colors.neutral.white,
    opacity: 1,
  },
});
