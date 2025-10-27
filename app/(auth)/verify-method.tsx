import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * VerifyAccountMethodScreen - Two-factor authentication method selection
 * User chooses verification method (Call/SMS/Email)
 * Based on the design with header, title, dropdown, description, and send code button
 */
export default function VerifyAccountMethodScreen() {
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<string>('');

  const handleSendCode = () => {
    if (selectedMethod) {
      router.push({ pathname: '/send-code-to' });
    }
  };

  const handleDropdownPress = () => {
    // TODO: Implement dropdown selection
    // For now, we'll simulate selecting a method
    setSelectedMethod('sms');
  };

  return (
    <View style={styles.container}>
      {/* Header with title and cancel button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Verify Account</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
      </View>
      
      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.title}>Verify Account</Text>
        <Text style={styles.subtitle}>Choose Your Two-Factor Authentication Method</Text>
        
        <TouchableOpacity style={styles.dropdown} onPress={handleDropdownPress}>
          <Text style={styles.dropdownText}>
            {selectedMethod ? selectedMethod.toUpperCase() : 'Choose'}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
        
        <Text style={styles.description}>
          Protect Your Account with Two-Factor Authentication. Use extra layer of security to your account. 
          It's quick to set up and helps keep your personal information safe.
        </Text>
        
        <TouchableOpacity 
          style={[styles.button, !selectedMethod && styles.buttonDisabled]} 
          onPress={handleSendCode}
          disabled={!selectedMethod}
        >
          <Text style={styles.buttonText}>Send code</Text>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 18,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
    fontWeight: '400',
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 40,
    backgroundColor: '#F8F8F8',
  },
  dropdownText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 14,
    color: '#8E8E93',
  },
  description: {
    fontSize: 16,
    color: '#8E8E93',
    lineHeight: 24,
    marginBottom: 50,
    textAlign: 'center',
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
