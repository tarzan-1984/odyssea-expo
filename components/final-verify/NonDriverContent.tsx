import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import OSMMapView, { Region } from '@/components/maps/OSMMapView';
import DriverInfoPopup from '@/components/maps/DriverInfoPopup';
import DriversMapFiltersCard from '@/components/maps/DriversMapFiltersCard';
import { colors } from '@/lib/colors';
import { useDriversForMapInfinite } from '@/hooks/useDriversForMapInfinite';
import { getUserById } from '@/app-api/users';
import type { DriversMapSearchFilters } from '@/app-api/driversSearch';
import { useChatRooms } from '@/hooks/useChatRooms';
import { useAuth } from '@/context/AuthContext';
import type { ChatRoom } from '@/components/ChatListItem';
import { chatApi } from '@/app-api/chatApi';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'expo-router';
import { findDirectChatWithUser } from '@/utils/findDirectChatRoom';
import { canViewRestrictedDriverStatuses } from '@/constants/roleAccess';
import { RESTRICTED_DRIVER_STATUS_FILTER_VALUES } from '@/constants/driversListConstants';

interface NonDriverContentProps {
  firstName: string;
}

const DEFAULT_FILTERS: DriversMapSearchFilters = {
  statusFilter: '',
  capabilitiesFilter: [],
  addressFilter: '',
  radiusFilter: '500',
  locationFilter: 'USA',
  role: 'administrator',
};

function driversToMarkers(drivers: { id: string; externalId: string | null; latitude: number; longitude: number; driverStatus: string | null; status?: string | null }[]) {
  return drivers.map((d) => ({
    coordinate: { latitude: d.latitude, longitude: d.longitude },
    driverStatus: d.driverStatus,
    driverId: d.id,
    driverExternalId: d.externalId,
    status: d.status,
  }));
}

export default function NonDriverContent({ firstName }: NonDriverContentProps) {
  const router = useRouter();
  const mapRef = useRef<{ animateToRegion: (region: Region, duration?: number) => void }>(null);
  const [filters, setFilters] = useState<DriversMapSearchFilters>(DEFAULT_FILTERS);
  const { drivers, isLoading, isFetching } = useDriversForMapInfinite(filters);
  const markers = useMemo(() => driversToMarkers(drivers), [drivers]);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [selectedDriverUserId, setSelectedDriverUserId] = useState<string | null>(null); // DB userId (NOT externalId)
  const [selectedDriverUserStatus, setSelectedDriverUserStatus] = useState<string | null>(null); // ACTIVE/INACTIVE
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [isLoadingDriverData, setIsLoadingDriverData] = useState(false);
  const [isChatActionLoading, setIsChatActionLoading] = useState(false);
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const canViewRestrictedStatuses = canViewRestrictedDriverStatuses(role);
  const { chatRooms, isLoading: isLoadingChatRooms, loadChatRooms } = useChatRooms();

  useEffect(() => {
    if (canViewRestrictedStatuses) return;
    setFilters((f) =>
      f.statusFilter && RESTRICTED_DRIVER_STATUS_FILTER_VALUES.has(f.statusFilter)
        ? { ...f, statusFilter: '' }
        : f
    );
  }, [canViewRestrictedStatuses]);
  
  // Default region - St. Louis area with wider zoom
  const initialRegion: Region = {
    latitude: 38.6270,
    longitude: -90.1994,
    latitudeDelta: 7, // Much wider view (smaller zoom level)
    longitudeDelta: 7,
  };

  const handleMarkerPress = async (driverData: {
    id: string;
    externalId: string | null;
    driverStatus: string | null;
    latitude: number;
    longitude: number;
    status?: string | null;
  }) => {
    if (!driverData.externalId) {
      console.warn('[NonDriverContent] No externalId for driver:', driverData.id);
      return;
    }

    // Save DB userId and user status for chat lookup/creation. externalId is only for TMS lookup.
    setSelectedDriverUserId(driverData.id);
    setSelectedDriverUserStatus(driverData.status || null);
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
      setSelectedDriverUserStatus(null);
    }
    setIsPopupVisible(false);
    setSelectedDriver(null);
  };

  const isDriverActive = selectedDriverUserStatus === 'ACTIVE';

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

      <View style={styles.filtersSection}>
        <DriversMapFiltersCard
          filters={filters}
          onChange={setFilters}
          canViewRestrictedStatuses={canViewRestrictedStatuses}
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
        isDriverActive={isDriverActive}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: colors.neutral.white,
    flex: 1,
    position: 'relative',
    zIndex: 5,
    marginTop: -20,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 200,
  },
  filtersSection: {
    flexShrink: 0,
    marginTop: -20,
  },
});

