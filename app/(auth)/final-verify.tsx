import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView } from 'react-native';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem } from "@/lib";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/navigation/BottomNavigation';

/**
 * FinalVerifyScreen - Final verification/profile screen
 * User profile with location sharing and status update
 * Based on the design with map, location settings, status update, and bottom navigation
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <>
      {/* Paint status bar area exactly to safe inset height */}
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <View style={styles.container}>
        {/* Header with time and profile */}
        <View style={styles.header}>
          <Text style={styles.welcome} numberOfLines={2}>
            Welcome to application, John
          </Text>
          
          <View style={styles.profileIcon}>
            <Text style={styles.profileText}>JО</Text>
          </View>
        </View>
        
        <View style={styles.contentWrapper}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
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
      </View>
      </View>
      
      {/* Bottom Navigation */}
      <BottomNavigation />
    </>
    
  );
}

 const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: rem(25),
    paddingBottom: rem(34),
    borderBottomLeftRadius: rem(20),
    borderBottomRightRadius: rem(20),
    backgroundColor: colors.primary.violet,
    width: '100%',
  },
  contentWrapper: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  profileIcon: {
    width: rem(56),
    height: rem(56),
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.blue,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  profileText: {
    color: colors.neutral.white,
    fontSize: fp(22),
    fontFamily: fonts["700"],
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  welcome: {
    fontSize: fp(22),
    fontFamily: fonts["700"],
    lineHeight: fp(28),
    color: colors.neutral.white,
    flex: 1,
    flexShrink: 1,
    flexGrow: 1,
    flexWrap: 'wrap',
    marginRight: rem(12),
  },
  mapContainer: {
    marginBottom: 20,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: '#F5F5F5',
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
    backgroundColor: colors.primary.blue,
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
});
