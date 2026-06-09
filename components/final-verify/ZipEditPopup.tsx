'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OSMMapView, { Region } from '@/components/maps/OSMMapView';
import { colors, fonts, fp, rem } from '@/lib';
import { geocodeWithPostalAsync, reverseGeocodeAsync } from '@/utils/geocoding';
import {
  DEFAULT_GEOCODE_COUNTRY,
  GEOCODE_COUNTRY_OPTIONS,
  type GeocodeCountryCode,
  labelForGeocodeCountry,
  parseGeocodeCountryCode,
} from '@/utils/geocodeCountry';

const MAP_HEIGHT = Dimensions.get('window').height * 0.35;

interface ZipEditPopupProps {
  visible: boolean;
  initialValue: string;
  initialCountry?: GeocodeCountryCode;
  onClose: () => void;
  onSet: (zip: string, country: GeocodeCountryCode) => void;
}

export default function ZipEditPopup({
  visible,
  initialValue,
  initialCountry = DEFAULT_GEOCODE_COUNTRY,
  onClose,
  onSet,
}: ZipEditPopupProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [countryCode, setCountryCode] = useState<GeocodeCountryCode>(initialCountry);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [resolvedZip, setResolvedZip] = useState<string | null>(null);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const mapRef = useRef<{ animateToRegion: (region: Region, duration?: number) => void }>(null);

  const initialRegion: Region = {
    latitude: 39.2904,
    longitude: -76.6122,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  useEffect(() => {
    if (visible) {
      setInputValue(initialValue);
      setCountryCode(parseGeocodeCountryCode(initialCountry));
      setCountryPickerOpen(false);
      setResolvedZip(null);
      setMarker(null);
    }
  }, [visible, initialValue, initialCountry]);

  const centerMapOnMarker = useCallback((lat: number, lng: number) => {
    const region: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    setTimeout(() => {
      mapRef.current?.animateToRegion(region, 500);
    }, 100);
  }, []);

  const geocodeQuery = useCallback(
    async (trimmed: string, country: GeocodeCountryCode) => {
      if (trimmed.length < 3) {
        setMarker(null);
        setResolvedZip(null);
        return;
      }
      setIsGeocoding(true);
      try {
        const result = await geocodeWithPostalAsync(trimmed, country);
        if (result) {
          setMarker({ latitude: result.latitude, longitude: result.longitude });
          setResolvedZip(result.postalCode ?? null);
          centerMapOnMarker(result.latitude, result.longitude);
        } else {
          setMarker(null);
          setResolvedZip(null);
        }
      } catch {
        setMarker(null);
        setResolvedZip(null);
      } finally {
        setIsGeocoding(false);
      }
    },
    [centerMapOnMarker],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = useCallback(
    (text: string) => {
      setInputValue(text);
      setResolvedZip(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = text.trim();
      if (trimmed.length >= 3) {
        debounceRef.current = setTimeout(() => geocodeQuery(trimmed, countryCode), 500);
      } else {
        setMarker(null);
      }
    },
    [geocodeQuery, countryCode],
  );

  const handleCountrySelect = useCallback(
    (country: GeocodeCountryCode) => {
      setCountryCode(country);
      setCountryPickerOpen(false);
      const trimmed = inputValue.trim();
      if (trimmed.length >= 3) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        geocodeQuery(trimmed, country);
      }
    },
    [geocodeQuery, inputValue],
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleMapPress = useCallback(async (latitude: number, longitude: number) => {
    setMarker({ latitude, longitude });
    setIsGeocoding(true);
    try {
      const results = await reverseGeocodeAsync({ latitude, longitude });
      if (results && results.length > 0 && results[0].postalCode) {
        const zip = results[0].postalCode;
        setInputValue(zip);
        setResolvedZip(zip);
      }
    } catch {
      setResolvedZip(null);
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  const handleSet = useCallback(() => {
    const zipToSave = resolvedZip ?? inputValue.trim();
    if (zipToSave) onSet(zipToSave, countryCode);
    onClose();
  }, [resolvedZip, inputValue, countryCode, onSet, onClose]);

  const markers = marker
    ? [
        {
          coordinate: { latitude: marker.latitude, longitude: marker.longitude },
          anchor: { x: 0.5, y: 1.0 },
        },
      ]
    : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.popupWrapper}>
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.label}>ZIP</Text>
            </View>
            <View style={styles.mapContainer}>
              <OSMMapView
                ref={mapRef}
                style={styles.map}
                initialRegion={initialRegion}
                markers={markers}
                onMapPress={handleMapPress}
                scrollEnabled
                zoomEnabled
                rotateEnabled
                pitchEnabled
                showsCompass
              />
            </View>
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.countryTrigger}
                onPress={() => setCountryPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Select country"
              >
                <Text style={styles.countryTriggerText} numberOfLines={1}>
                  {labelForGeocodeCountry(countryCode)}
                </Text>
                <Ionicons name="chevron-down" size={rem(16)} color={colors.primary.blue} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={inputValue}
                onChangeText={handleInputChange}
                placeholder="Enter ZIP or address"
                placeholderTextColor={colors.primary.blue}
                autoFocus
                {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
              />
              {isGeocoding && (
                <ActivityIndicator size="small" color={colors.primary.blue} style={styles.loader} />
              )}
            </View>
            <View style={styles.buttonsRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.setButton} onPress={handleSet}>
                <Text style={styles.setButtonText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Modal
          visible={countryPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCountryPickerOpen(false)}
        >
          <Pressable style={styles.countryOverlay} onPress={() => setCountryPickerOpen(false)}>
            <Pressable style={styles.countrySheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.countrySheetTitle}>Country</Text>
              {GEOCODE_COUNTRY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.countryOption,
                    option.value === countryCode && styles.countryOptionActive,
                  ]}
                  onPress={() => handleCountrySelect(option.value)}
                >
                  <Text
                    style={[
                      styles.countryOptionText,
                      option.value === countryCode && styles.countryOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.value === countryCode ? (
                    <Ionicons name="checkmark" size={rem(20)} color={colors.primary.blue} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(24),
  },
  popupWrapper: {
    width: '100%',
    maxWidth: rem(360),
  },
  content: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(360),
    overflow: 'visible',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rem(12),
  },
  label: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: rem(12),
  },
  cancelButton: {
    flex: 1,
    height: rem(44),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colors.primary.blue,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
  mapContainer: {
    height: MAP_HEIGHT,
    borderRadius: rem(12),
    overflow: 'hidden',
    marginBottom: rem(16),
    backgroundColor: '#EEF2FF',
  },
  map: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: rem(16),
    gap: rem(8),
  },
  countryTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.primary.blue,
    borderRadius: 10,
    paddingHorizontal: rem(10),
    height: rem(44),
    minWidth: rem(88),
    maxWidth: rem(96),
    gap: rem(4),
  },
  countryTriggerText: {
    flex: 1,
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary.blue,
    borderRadius: 10,
    paddingHorizontal: rem(12),
    height: rem(44),
    fontSize: fp(13),
    color: colors.primary.blue,
  },
  loader: {
    marginLeft: rem(4),
  },
  setButton: {
    flex: 1,
    backgroundColor: colors.primary.violet,
    borderRadius: 10,
    height: rem(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  setButtonText: {
    color: colors.neutral.white,
    fontSize: fp(16),
    fontFamily: fonts['600'],
  },
  countryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(32),
  },
  countrySheet: {
    width: '100%',
    maxWidth: rem(280),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
  },
  countrySheetTitle: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginBottom: rem(12),
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rem(12),
    paddingHorizontal: rem(8),
    borderRadius: rem(8),
  },
  countryOptionActive: {
    backgroundColor: '#EEF2FF',
  },
  countryOptionText: {
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  countryOptionTextActive: {
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
});
