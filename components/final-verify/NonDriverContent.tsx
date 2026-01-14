import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import OSMMapView, { Region } from '@/components/maps/OSMMapView';
import DriverInfoPopup from '@/components/maps/DriverInfoPopup';
import { colors } from '@/lib/colors';
import { useDriversMarkersForMap } from '@/hooks/useDriversMarkersForMap';

interface NonDriverContentProps {
  firstName: string;
}

export default function NonDriverContent({ firstName }: NonDriverContentProps) {
  const mapRef = useRef<{ animateToRegion: (region: Region, duration?: number) => void }>(null);
  const { markers, isLoading, isSyncing, totalDrivers } = useDriversMarkersForMap();
  const [selectedDriver, setSelectedDriver] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    driverStatus: string | null;
  } | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  
  // Default region - St. Louis area with wider zoom
  const initialRegion: Region = {
    latitude: 38.6270,
    longitude: -90.1994,
    latitudeDelta: 7, // Much wider view (smaller zoom level)
    longitudeDelta: 7,
  };

  // Log markers updates
  useEffect(() => {
    if (markers.length > 0) {
      console.log(`[NonDriverContent] 🗺️ Map markers updated: ${markers.length} markers on map`);
    }
  }, [markers.length]);

  useEffect(() => {
    if (isLoading) {
      console.log('[NonDriverContent] ⏳ Loading initial markers from cache...');
    } else {
      console.log(`[NonDriverContent] ✅ Initial load complete. Markers: ${markers.length}`);
    }
  }, [isLoading, markers.length]);

  useEffect(() => {
    if (isSyncing) {
      console.log('[NonDriverContent] 🔄 Syncing drivers from backend...');
    } else {
      console.log(`[NonDriverContent] ✅ Sync complete. Total drivers: ${totalDrivers}`);
    }
  }, [isSyncing, totalDrivers]);

  const handleMarkerPress = (driverData: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    driverStatus: string | null;
    latitude: number;
    longitude: number;
  }) => {
    setSelectedDriver({
      firstName: driverData.firstName,
      lastName: driverData.lastName,
      email: driverData.email,
      phone: driverData.phone,
      driverStatus: driverData.driverStatus,
    });
    setIsPopupVisible(true);
  };

  const handleClosePopup = () => {
    setIsPopupVisible(false);
    setSelectedDriver(null);
  };

  return (
    <View style={styles.contentWrapper}>
      <View style={styles.mapContainer}>
        <OSMMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          markers={markers}
          showsUserLocation={false}
          showsMyLocationButton={false}
          scrollEnabled
          zoomEnabled
          rotateEnabled
          pitchEnabled
          showsCompass
          onMarkerPress={handleMarkerPress}
        />
      </View>
      
      <DriverInfoPopup
        visible={isPopupVisible}
        onClose={handleClosePopup}
        driverData={selectedDriver}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: "relative",
    zIndex: 5,
    marginTop: -20,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
    zIndex: 5,
    overflow: 'hidden',
    minHeight: 0,
  },
});

