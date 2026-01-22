import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import ScreenLayout from '@/components/auth/ScreenLayout';
import { borderRadius, colors, fonts, typography, rem, fp } from "@/lib";
import { useAuth } from '@/context/AuthContext';
import ArrowRight from "@/icons/ArrowRight";
import ShowPassword from "@/icons/ShowPassword";
import { changePasswordForMobile } from '@/app-api/users';

/**
 * ChangePasswordScreen - allows user to set a new password that is more convenient.
 * This is intended for users who received a temporary/system password.
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { authState } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): string | null => {
    if (!password.trim() || !confirmPassword.trim()) {
      return 'Password and confirmation are required';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/\d/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async () => {
    setLocalError(null);
    setSuccess(null);

    const userId = authState.user?.id;
    if (!userId) {
      setLocalError('User is not authenticated');
      return;
    }

    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const res = await changePasswordForMobile(userId, password);
      setSuccess(res.message || 'Your password has been changed successfully');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setLocalError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenLayout headerTitle={'Change Password'} headerButtonText={'Back'} onHeaderButtonPress={() => router.back()}>
      <View style={[styles.container, (success || localError) && styles.containerWithMessage]}>
        <Text style={styles.title}>Set a new password</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              (localError) && styles.inputError
            ]}
            placeholder="New password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (localError) setLocalError(null);
              if (success) setSuccess(null);
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.neutral.white}
            editable={!isLoading}
            accessibilityLabel="Password input"
          />
          <TouchableOpacity
            style={styles.showPasswordButton}
            onPress={() => setShowPassword(!showPassword)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          >
            <ShowPassword />
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              (localError) && styles.inputError
            ]}
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (localError) setLocalError(null);
              if (success) setSuccess(null);
            }}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.neutral.white}
            editable={!isLoading}
            accessibilityLabel="Confirm password input"
          />
          <TouchableOpacity
            style={styles.showPasswordButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            accessibilityRole="button"
            accessibilityLabel={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
          >
            <ShowPassword />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            (!password.trim() || !confirmPassword.trim() || isLoading) && styles.buttonDisabled
          ]}
          onPress={handleSubmit}
          disabled={!password.trim() || !confirmPassword.trim() || isLoading}
          accessibilityRole="button"
          accessibilityLabel="Set password"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.neutral.white} size="small" />
          ) : (
            <>
              <Text style={styles.buttonText}>Set password</Text>
              <ArrowRight />
            </>
          )}
        </TouchableOpacity>

        {success ? (
          <Text style={[styles.messageText, styles.successText]}>
            {success}
          </Text>
        ) : localError ? (
          <Text style={[styles.messageText, styles.errorText]}>
            {localError}
          </Text>
        ) : null}
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
    marginBottom: rem(40),
    lineHeight: fp(35),
  },
  errorText: {
    color: '#FF6B6B',
  },
  successText: {
    color: '#4CAF50',
  },
  container: {
    paddingTop: rem(50),
    paddingHorizontal: rem(26),
    flex: 1,
  },
  containerWithMessage: {
    paddingTop: rem(20),
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
});

