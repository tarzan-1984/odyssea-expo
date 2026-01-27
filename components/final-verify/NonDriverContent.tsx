import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import OSMMapView, { Region } from '@/components/maps/OSMMapView';
import DriverInfoPopup from '@/components/maps/DriverInfoPopup';
import { colors } from '@/lib/colors';
import { useDriversMarkersForMap } from '@/hooks/useDriversMarkersForMap';
import { getUserById } from '@/app-api/users';
import { useChatRooms } from '@/hooks/useChatRooms';
import { useAuth } from '@/context/AuthContext';
import type { ChatRoom } from '@/components/ChatListItem';
import { chatApi } from '@/app-api/chatApi';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'expo-router';

interface NonDriverContentProps {
  firstName: string;
}

function findDirectChatWithUser(rooms: ChatRoom[], myUserId: string, otherUserId: string): ChatRoom | undefined {
  return rooms.find((r) => {
    if (r.type !== 'DIRECT') return false;
    const hasOther = r.participants?.some((p) => p.user?.id === otherUserId);
    const hasMe = r.participants?.some((p) => p.user?.id === myUserId);
    return Boolean(hasOther && hasMe);
  });
}

export default function NonDriverContent({ firstName }: NonDriverContentProps) {
  const router = useRouter();
  const mapRef = useRef<{ animateToRegion: (region: Region, duration?: number) => void }>(null);
  const { markers, isLoading, isSyncing, totalDrivers } = useDriversMarkersForMap();
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [selectedDriverUserId, setSelectedDriverUserId] = useState<string | null>(null); // DB userId (NOT externalId)
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [isLoadingDriverData, setIsLoadingDriverData] = useState(false);
  const [isChatActionLoading, setIsChatActionLoading] = useState(false);
  const { authState } = useAuth();
  const { chatRooms, isLoading: isLoadingChatRooms, loadChatRooms } = useChatRooms();
  
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

  const handleMarkerPress = async (driverData: {
    id: string;
    externalId: string | null;
    driverStatus: string | null;
    latitude: number;
    longitude: number;
  }) => {
    if (!driverData.externalId) {
      console.warn('[NonDriverContent] No externalId for driver:', driverData.id);
      return;
    }

    // Save DB userId for chat lookup/creation. externalId is only for TMS lookup.
    setSelectedDriverUserId(driverData.id);
    setIsLoadingDriverData(true);
    setIsPopupVisible(true);
    
    try {
      const res = await getUserById(driverData.externalId);
      // TMS API returns data in format: { data: { data: {...} } } or just {...}
      const driverDataFromTMS = res?.data?.data || res?.data || res;
      setSelectedDriver(driverDataFromTMS);
    } catch (error) {
      console.error('[NonDriverContent] Failed to fetch driver data from TMS:', error);
      setSelectedDriver(null);
      setIsPopupVisible(false);
    } finally {
      setIsLoadingDriverData(false);
    }
  };

  const existingDirectChat = useMemo(() => {
    const myUserId = authState.user?.id;
    if (!myUserId || !selectedDriverUserId) return undefined;
    return findDirectChatWithUser(chatRooms, myUserId, selectedDriverUserId);
  }, [authState.user?.id, chatRooms, selectedDriverUserId]);

  const handleGoToChat = useCallback(async () => {
    const myUserId = authState.user?.id;
    const driverUserId = selectedDriverUserId;
    if (!myUserId || !driverUserId) return;

    if (isChatActionLoading) return;
    setIsChatActionLoading(true);

    try {
      // Ensure chat rooms are loaded (cache might be empty during initial seconds).
      if (!isLoadingChatRooms && chatRooms.length === 0) {
        await loadChatRooms(true);
      }

      // Re-check with freshest store state to avoid stale closure.
      const latestRooms = useChatStore.getState().chatRooms;
      const found = findDirectChatWithUser(latestRooms, myUserId, driverUserId);
      if (found) {
        setIsPopupVisible(false);
        router.push(`/(tabs)/chat/${found.id}` as any);
        return;
      }

      // Create DIRECT chat with this driver (DB userId).
      const createdRoom = await chatApi.createChatRoom({
        type: 'DIRECT',
        participantIds: [myUserId, driverUserId],
      });

      // Normalize participant avatar field (profilePhoto -> avatar) for UI consistency.
      const normalizedRoom: ChatRoom = {
        ...createdRoom,
        participants: Array.isArray(createdRoom.participants)
          ? createdRoom.participants.map((p: any) => ({
              ...p,
              user: {
                ...p.user,
                avatar: p.user?.avatar ?? p.user?.profilePhoto ?? '',
              },
            }))
          : [],
      };

      useChatStore.getState().mergeChatRooms([normalizedRoom]);

      setIsPopupVisible(false);
      router.push(`/(tabs)/chat/${normalizedRoom.id}` as any);
    } catch (e) {
      console.error('[NonDriverContent] Failed to open/create chat:', e);
      Alert.alert('Error', 'Failed to open chat. Please try again.');
    } finally {
      setIsChatActionLoading(false);
    }
  }, [
    authState.user?.id,
    chatRooms.length,
    isChatActionLoading,
    isLoadingChatRooms,
    loadChatRooms,
    router,
    selectedDriverUserId,
  ]);

  const handleClosePopup = () => {
    if (!isChatActionLoading) {
      setSelectedDriverUserId(null);
    }
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
        isLoading={isLoadingDriverData}
        showChatButton={Boolean(selectedDriverUserId)}
        chatButtonLabel="Go to chat"
        onChatPress={handleGoToChat}
        isChatActionLoading={isChatActionLoading}
        isChatActionDisabled={!selectedDriverUserId || !authState.user?.id}
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

