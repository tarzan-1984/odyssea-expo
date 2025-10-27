import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Dimensions, ScrollView } from 'react-native';
import { colors } from '@/lib/colors';

const { width, height } = Dimensions.get('window');

/**
 * FinalVerifyScreen - Final verification/profile screen
 * User profile with location sharing and status update
 * Based on the design with map, location settings, status update, and bottom navigation
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const [isLocationEnabled, setIsLocationEnabled] = useState(true);
  const [status, setStatus] = useState('Choose');
  const [zip, setZip] = useState('52285');
  const [date, setDate] = useState('7/17/2025');

  const handleUpdateStatus = () => {
    // TODO: Implement status update
    console.log('Update status:', { status, zip, date });
  };

  const handleShareLocation = () => {
    // TODO: Implement location sharing
    console.log('Share location');
  };

  const handleStatusSelect = () => {
    // TODO: Implement status selection
    setStatus('Available');
  };

  return (
    <View style={styles.container}>
      {/* Header with time and profile */}
      <View style={styles.header}>
        <Text style={styles.time}>19:02</Text>
        <View style={styles.profileIcon}>
          <Text style={styles.profileText}>J</Text>
        </View>
      </View>
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.welcome}>Welcome To Application, John</Text>
        
        {/* Map section */}
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            <View style={styles.mapPin}>
              <Text style={styles.pinEmoji}>📍</Text>
            </View>
            <View style={styles.pulseRing} />
            <View style={styles.pulseRing2} />
          </View>
          <Text style={styles.locationText}>Baltimore MD 21224 USA</Text>
        </View>
        
        <TouchableOpacity style={styles.shareButton} onPress={handleShareLocation}>
          <Text style={styles.shareButtonText}>Share my location</Text>
        </TouchableOpacity>
        
        {/* Location toggle */}
        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>Turn on automatic location sharing</Text>
          <Switch
            value={isLocationEnabled}
            onValueChange={setIsLocationEnabled}
            trackColor={{ false: '#E0E0E0', true: '#34C759' }}
            thumbColor={isLocationEnabled ? '#ffffff' : '#ffffff'}
          />
        </View>
        
        {/* Status dropdown */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Your status</Text>
          <TouchableOpacity style={styles.statusDropdown} onPress={handleStatusSelect}>
            <Text style={styles.statusText}>{status}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>
        </View>
        
        {/* ZIP input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>ZIP</Text>
          <View style={styles.input}>
            <Text style={styles.inputText}>{zip}</Text>
          </View>
        </View>
        
        {/* Date input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Date</Text>
          <View style={styles.input}>
            <Text style={styles.inputText}>{date}</Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.updateButton} onPress={handleUpdateStatus}>
          <Text style={styles.updateButtonText}>Update status</Text>
        </TouchableOpacity>
      </ScrollView>
      
      {/* Bottom navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>💬</Text>
          <Text style={styles.navText}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navText}>Profile</Text>
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
  },
  time: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary.lightBlue,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 4px rgba(52, 199, 89, 0.3)',
    elevation: 4,
  },
  profileText: {
    color: colors.neutral.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  welcome: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 30,
    textAlign: 'center',
  },
  mapContainer: {
    marginBottom: 20,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: '#F5F5F5', // Light grey map background as in design
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 15,
  },
  mapPin: {
    position: 'absolute',
    zIndex: 3,
  },
  pinEmoji: {
    fontSize: 30,
  },
  pulseRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#34C759',
    opacity: 0.6,
    zIndex: 2,
  },
  pulseRing2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#34C759',
    opacity: 0.3,
    zIndex: 1,
  },
  locationText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
  },
  shareButton: {
    backgroundColor: colors.primary.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 25,
    boxShadow: '0px 4px 8px rgba(0, 122, 255, 0.3)',
    elevation: 8,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    paddingVertical: 10,
  },
  switchLabel: {
    fontSize: 16,
    color: '#000000',
    flex: 1,
    fontWeight: '500',
  },
  statusContainer: {
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 10,
    fontWeight: '500',
  },
  statusDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8F8F8',
  },
  statusText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#8E8E93',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 10,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8F8F8',
  },
  inputText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  updateButton: {
    backgroundColor: colors.secondary.green,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 30,
    boxShadow: '0px 4px 8px rgba(52, 199, 89, 0.3)',
    elevation: 8,
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#ffffff',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 5,
  },
  navText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
});
