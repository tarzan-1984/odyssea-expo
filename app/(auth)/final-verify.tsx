import React, { useState, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, TextInput, Image } from 'react-native';
import MapView, { Region, Marker } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { colors } from '@/lib/colors';
import { borderRadius, fonts, fp, rem, typography } from "@/lib";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import StatusSelect, { StatusValue } from '@/components/common/StatusSelect';
import PinMapIcon from '@/icons/PinMapIcon';
import CarMapMarker from '@/icons/CarMapMarker';
import { useAuth } from '@/context/AuthContext';

/**
 * FinalVerifyScreen - Final verification/profile screen
 * User profile with location sharing and status update
 * Based on the design with map, location settings, status update, and bottom navigation
 */
export default function FinalVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const user = authState.user;
  const firstName = user?.firstName || 'User';
  const lastName = user?.lastName || '';
  const initials = `${firstName[0]}${lastName ? lastName[0] : firstName[0]}`.toUpperCase();
  const profilePhoto = user?.profilePhoto || user?.avatar || null;
  const [isLocationEnabled, setIsLocationEnabled] = useState(true);
  const [status, setStatus] = useState<StatusValue>('available');
  const [zip, setZip] = useState('');
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const [date, setDate] = useState(formatDate(new Date()));
  const mapRef = useRef<MapView>(null);
  const initialRegion: Region = {
    latitude: 39.2904, // default Baltimore
    longitude: -76.6122,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isLocationReady, setIsLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const handleUpdateStatus = () => {
    // TODO: Implement status update
    console.log('Update status:', { status, zip, date });
  };

  const handleShareLocation = async () => {
    try {
      if (hasLocationPermission === null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        setHasLocationPermission(granted);
        if (!granted) {
          console.warn('Location permission not granted');
          return;
        }
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      
      // Reverse geocode to get ZIP code
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverseGeocode && reverseGeocode.length > 0) {
          const postalCode = reverseGeocode[0].postalCode;
          if (postalCode) {
            setZip(postalCode);
          }
        }
      } catch (geoError) {
        console.warn('Failed to get ZIP code from geocoding:', geoError);
      }
      
      // Animate to user's location
      mapRef.current?.animateToRegion(nextRegion, 1000);
      setUserLocation({ latitude, longitude });
      setIsLocationReady(true);
    } catch (e) {
      console.error('Failed to get location:', e);
    }
  };

  const handleStatusChange = (newStatus: StatusValue) => {
    setStatus(newStatus);
  };

  return (
    <View style={styles.screenWrap}>
      {/* Paint status bar area exactly to safe inset height */}
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <View style={styles.container}>
        
        {/* Header with time and profile */}
        <View style={styles.header}>
          <Text style={styles.welcome} numberOfLines={2}>
            Welcome to application, {firstName}
          </Text>
          
          <View style={styles.profileIcon}>
            {profilePhoto ? (
              <Image 
                source={{ uri: profilePhoto }} 
                style={styles.profileImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.profileText}>{initials}</Text>
            )}
          </View>
        </View>
        
        <View style={styles.contentWrapper}>
            {/* Map section */}
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={initialRegion}
                showsUserLocation={false}
                showsMyLocationButton={false}
                scrollEnabled
                zoomEnabled
                rotateEnabled
                pitchEnabled
                showsCompass
              >
                {/* Real marker attached to map at user's coordinates */}
                {userLocation && (
                  <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
                    <CarMapMarker width={40} height={40} />
                  </Marker>
                )}
              </MapView>
              {/* Until location is ready, show center overlay with blur */}
              {!isLocationReady && (
                <>
                  <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={styles.mapPin} pointerEvents="none">
                    <PinMapIcon />
                  </View>
                </>
              )}
            </View>
            
            {/* Settings section */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.shareButton} onPress={handleShareLocation}>
                <Text style={styles.buttonText}>Share my location</Text>
              </TouchableOpacity>
              
              {/* Location toggle */}
              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Turn on automatic location sharing</Text>
                
                <Switch
                  value={isLocationEnabled}
                  onValueChange={setIsLocationEnabled}
                  trackColor={{ false: '#E8EAFD', true: '#E8EAFD' }}
                  thumbColor={isLocationEnabled ? colors.primary.blue : colors.primary.blue}
                />
              </View>
              
              {/* Status dropdown */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>Your status</Text>
                <StatusSelect value={status} onChange={handleStatusChange} />
              </View>
              
              {/* ZIP input */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>ZIP</Text>
                <TextInput
                  style={[styles.input, styles.textInput]}
                  value={zip}
                  onChangeText={setZip}
                  keyboardType="number-pad"
                  placeholder="Enter ZIP"
                  placeholderTextColor={colors.primary.blue}
                  accessibilityLabel="ZIP code"
                />
              </View>
              
              {/* Date input */}
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}>Date</Text>
                <View style={styles.input}>
                  <Text style={styles.textInput}>{date}</Text>
                </View>
              </View>
              
              <View style={styles.settingsWrap}>
                <Text style={styles.settingsLabel}></Text>
                
                <TouchableOpacity style={styles.updateButton} onPress={handleUpdateStatus}>
                  <Text style={styles.updateButtonText}>Update status</Text>
                </TouchableOpacity>
              </View>
            </View>
        </View>
      </View>
      
      {/* Bottom Navigation */}
      <BottomNavigation />
    </View>
  );
}

 const styles = StyleSheet.create({
   screenWrap: {
     flex: 1,
     position: "relative"
   },
   settingsLabel: {
     fontSize: fp(15),
     width: '25%',
     color: colors.primary.blue,
     fontFamily: fonts["600"],
   },
   settingsWrap: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: rem(15),
     marginBottom: rem(9),
   },
   shareButton: {
     ...typography.buttonGreen,
     marginTop: -27,
     marginBottom: rem(20),
   },
   buttonText: {
     ...typography.button,
   },
  wrapper: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
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
    position: 'relative',
    zIndex: 20,
  },
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: "relative",
    zIndex: 5,
    marginTop: -20,
  },
  profileIcon: {
    width: rem(56),
    height: rem(56),
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.blue,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.full,
  },
  profileText: {
    color: colors.neutral.white,
    fontSize: fp(22),
    fontFamily: fonts["700"],
  },
  scrollView: {
    flex: 1,
    marginTop: -20,
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
    flex: 1,
    position: "relative",
    zIndex: 5,
    overflow: 'hidden',
    minHeight: 0,
  },
   settingsSection: {
     boxShadow: "40px 4px 60px 0px rgba(0, 0, 0, 0.25)",
     paddingHorizontal: 26,
     backgroundColor: colors.neutral.white,
     borderTopRightRadius: rem(20),
     borderTopLeftRadius: rem(20),
     position: "relative",
     paddingBottom: 80,
     marginTop: -20,
     zIndex: 50,
   },
  mapPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    zIndex: 3,
    transform: [{ translateX: -46 }, { translateY: -46 }],
  },
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
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
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(24),
  },
  switchLabel: {
    fontSize: fp(15),
    color: colors.primary.blue,
    fontFamily: fonts["500"],
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
  input: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: rem(40),
    backgroundColor: 'rgba(232, 234, 253, 1)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: "center",
  },
  textInput: {
    color: colors.primary.blue,
    fontSize: fp(15),
    fontFamily: fonts["400"],
    flex: 1,
  },
  updateButton: {
     marginTop: rem(12),
    flex: 1,
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    height: rem(45),
    alignItems: 'center',
    marginBottom: 30,
    boxShadow: '0px 4px 8px rgba(52, 199, 89, 0.3)',
    justifyContent: "center",
  },
  updateButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts["500"],
  },
});
