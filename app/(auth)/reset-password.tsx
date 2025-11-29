import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * ResetPasswordScreen - Password reset screen
 * User enters email to receive password reset link
 * Based on the design with header, description text, email input, and reset button
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const handleResetPassword = () => {
    if (email.trim()) {
      // TODO: Implement password reset
      // Return back after successful reset (as per design requirement)
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with title and cancel button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
      </View>
      
      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.message}>
          Confirm Your Email And We'll Send You A Password Reset Link.
        </Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter your email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#8E8E93"
            autoFocus
          />
        </View>
        
        <TouchableOpacity 
          style={[styles.button, !email.trim() && styles.buttonDisabled]} 
          onPress={handleResetPassword}
          disabled={!email.trim()}
        >
          <Text style={styles.buttonText}>Reset password</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  message: {
    fontSize: 18,
    color: '#000000',
    textAlign: 'center',
    marginBottom: 50,
    lineHeight: 26,
    fontWeight: '400',
  },
  inputContainer: {
    marginBottom: 40,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    backgroundColor: '#F8F8F8',
    color: '#000000',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
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
});
