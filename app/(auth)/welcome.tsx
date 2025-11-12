import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius, shadows, fonts, rem, fp, br } from '@/lib';
import ArrowRight from '@/icons/ArrowRight';
import FaceIdIcon from '@/icons/FaceIdIcon';
import ScreenLayout from '@/components/auth/ScreenLayout';
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

/**
 * WelcomeScreen - First screen of auth flow
 * Contains email input and navigation to password screen
 * Based on the design with logo, title, email input, Next button, and Face ID option
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { authState, checkEmailAndGeneratePassword, clearError } = useAuth();
  const insets = useSafeAreaInsets();

  // Simple email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleNext = async () => {
    if (!email.trim()) {
      setLocalError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setLocalError('Please enter a valid email address');
      return;
    }

    // Clear any existing errors
    setLocalError(null);
    clearError();
    
    try {
      const result = await checkEmailAndGeneratePassword(email.trim());
      
      // Navigate to password screen with email and message from backend
      router.push({
        pathname: '/enter-password',
        params: { 
          email: email.trim(),
          message: result.data.message
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      setLocalError(errorMessage);
    }
  };

  const handleFaceID = () => {
    // TODO: Implement Face ID authentication
    console.log('Face ID authentication');
  };

  const Dots = (
    <View style={styles.dots}>
      <View style={[styles.dot, styles.dotActive]} />
      <View style={styles.dot} />
      <View style={styles.dot} />
    </View>
  );

  return (
    <ScreenLayout footer={Dots}>
      {/* Logo section */}
      <View style={styles.logoSection}>
        <Image 
          source={require('@/assets/images/logo.png')}
          style={styles.logoImage}
        />
      </View>
      
      <Text style={styles.title}>Welcome to the application</Text>
      
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
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.neutral.white}
          editable={!authState.isLoading}
        />
      </View>
      
      <TouchableOpacity 
        style={[
          styles.button, 
          (!email.trim() || authState.isLoading) && styles.buttonDisabled
        ]} 
        onPress={handleNext}
        disabled={!email.trim() || authState.isLoading}
      >
        {authState.isLoading ? (
          <ActivityIndicator color={colors.neutral.white} size="small" />
        ) : (
          <>
            <Text style={styles.buttonText}>Next</Text>
            <ArrowRight />
          </>
        )}
      </TouchableOpacity>
      
      {(localError || authState.error) && (
        <Text style={[styles.messageText, styles.errorText]}>
          {localError || authState.error}
        </Text>
      )}
      
      {/* Show Face ID only on iOS */}
      {Platform.OS === 'ios' && (
        <>
          <Text style={styles.faceIDText}>Login using face ID</Text>
          
          <TouchableOpacity style={styles.faceIdButton} onPress={handleFaceID}>
            <FaceIdIcon />
          </TouchableOpacity>
        </>
      )}
      
      {/* Progress dots */}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  logoSection: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rem(54),
  },
  logoImage: {
    width: rem(213),
    height: rem(77),
  },
  title: {
    fontSize: fp(22),
    fontFamily: fonts["700"],
    color: colors.neutral.white,
    textAlign: 'center',
    marginBottom: rem(29),
    lineHeight: fp(35),
  },
  inputContainer: {
    marginBottom: rem(20),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.white,
    borderRadius: br(10),
    paddingHorizontal: rem(20),
    fontSize: fp(16),
    height: 50,
    textAlign: 'center',
    backgroundColor: 'transparent',
    color: colors.neutral.white,
  },
  inputError: {
    borderColor: '#FF6B6B',
    borderWidth: 2,
  },
  messageText: {
    fontSize: fp(14),
    textAlign: 'center',
    marginTop: rem(8),
    fontFamily: fonts["400"],
  },
  errorText: {
    color: '#FF6B6B',
  },
  successText: {
    color: '#4CAF50',
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
  faceIDText: {
    marginTop: rem(65),
    fontSize: fp(16),
    color: colors.neutral.white,
    marginBottom: rem(26),
    fontFamily: fonts["400"],
    textAlign: 'center',
  },
  faceIdButton: {
    marginHorizontal: 'auto',
    justifyContent: 'center',
    alignItems: 'center',
    width: rem(70),
    height: rem(70),
    borderRadius: br(10),
    backgroundColor: 'rgba(0, 0, 0, 0.11)',
    marginBottom: rem(20),
  },
  
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: rem(20),
    marginBottom: rem(50),
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
