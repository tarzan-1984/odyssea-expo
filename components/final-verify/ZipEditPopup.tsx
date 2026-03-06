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
} from 'react-native';
import OSMMapView, { Region } from '@/components/maps/OSMMapView';
import { colors, fonts, fp, rem } from '@/lib';
import { geocodeWithPostalAsync, reverseGeocodeAsync } from '@/utils/geocoding';

const MAP_HEIGHT = Dimensions.get('window').height * 0.35;

interface ZipEditPopupProps {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSet: (zip: string) => void;
}

export default function ZipEditPopup({ visible, initialValue, onClose, onSet }: ZipEditPopupProps) {
  const [inputValue, setInputValue] = useState(initialValue);
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
      setResolvedZip(null);
      setMarker(null);
    }
  }, [visible, initialValue]);

  const centerMapOnMarker = useCallback((lat: number, lng: number) => {
    const region: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    // Slight delay so map is ready (especially when popup just opened)
    setTimeout(() => {
      mapRef.current?.animateToRegion(region, 500);
    }, 100);
  }, []);

  const geocodeQuery = useCallback(async (trimmed: string) => {
    if (trimmed.length < 3) {
      setMarker(null);
      setResolvedZip(null);
      return;
    }
    setIsGeocoding(true);
    try {
      const result = await geocodeWithPostalAsync(trimmed, 'us');
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
  }, [centerMapOnMarker]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = useCallback(
    (text: string) => {
      setInputValue(text);
      setResolvedZip(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = text.trim();
      if (trimmed.length >= 3) {
        debounceRef.current = setTimeout(() => geocodeQuery(trimmed), 500);
      } else {
        setMarker(null);
      }
    },
    [geocodeQuery]
  );

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

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
    if (zipToSave) onSet(zipToSave);
    onClose();
  }, [resolvedZip, inputValue, onSet, onClose]);

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
            <TextInput
              style={styles.input}
              value={inputValue}
              onChangeText={handleInputChange}
              placeholder="Enter ZIP or address"
              placeholderTextColor={colors.primary.blue}
              autoFocus
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
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary.blue,
    borderRadius: 10,
    paddingHorizontal: rem(16),
    height: rem(44),
    fontSize: fp(16),
    color: colors.primary.blue,
  },
  loader: {
    marginLeft: rem(12),
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
});
