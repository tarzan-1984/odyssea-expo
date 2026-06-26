import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, rem, fp } from '@/lib';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import BottomNavigation, { BOTTOM_NAV_SCROLL_PADDING } from '@/components/navigation/BottomNavigation';
import ArrowLeft from '@/icons/ArrowLeft';
import OSMMapView, { type Region, type OSMMapViewRef } from '@/components/maps/OSMMapView';
import { useUserByExternalId } from '@/hooks/useUserByExternalId';
import {
  getLoadMapPayload,
  type DriverTrackingPoint,
  type LoadMapDriver,
  type LoadRouteGeocodeMarker,
  type TmsLoadLocationPoint,
  type YourLoadItem,
} from '@/app-api/loads';
import { labelForDriverLoadStatus } from '@/constants/driverLoadStatuses';
import { getStatusLabelForFilter } from '@/constants/driversMapFilters';
import { CREATE_OFFER_SPECIAL_REQUIREMENTS } from '@/constants/driversListConstants';
import { useQuery } from '@tanstack/react-query';
import FilePreviewCard from '@/components/FilePreviewCard';
import { fetchRouteForPoints, type RoutePoint } from '@/services/offerRouteService';
import { useWebSocket } from '@/context/WebSocketContext';
import { chatApi } from '@/app-api/chatApi';

const MAP_MAX_HEIGHT = Dimensions.get('window').height * 0.25;
const SCREEN_WIDTH = Dimensions.get('window').width;

const LOAD_DETAIL_TAB_ROWS = [
  [
    { key: 'load', label: 'Load' },
    { key: 'trip', label: 'Trip' },
    { key: 'accounting', label: 'Accounting' },
  ],
] as const;
const ROUTE_POINT_FOCUS_DELTA = 1.2;
const ROUTE_POINT_COLORS = {
  initialPickup: '#1D4ED8',
  intermediatePickup: '#60A5FA',
  finalDelivery: '#15803D',
  intermediateDelivery: '#4ADE80',
} as const;

const HISTORY_POLYLINE_COLOR = '#DC2626';

const DEFAULT_REGION: Region = {
  latitude: 39.0,
  longitude: -95.0,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

function getRoutePointColor(
  points: Array<{ type?: string | null }> | null | undefined,
  pointIndex: number
): string {
  const list = Array.isArray(points) ? points : [];
  const point = list[pointIndex];
  if (!point) return ROUTE_POINT_COLORS.initialPickup;

  if (point.type === 'pick_up_location') {
    const pickupIndexes = list.reduce<number[]>((acc, p, i) => {
      if (p?.type === 'pick_up_location') acc.push(i);
      return acc;
    }, []);
    return pickupIndexes[0] === pointIndex
      ? ROUTE_POINT_COLORS.initialPickup
      : ROUTE_POINT_COLORS.intermediatePickup;
  }

  if (point.type === 'delivery_location') {
    const deliveryIndexes = list.reduce<number[]>((acc, p, i) => {
      if (p?.type === 'delivery_location') acc.push(i);
      return acc;
    }, []);
    return deliveryIndexes[deliveryIndexes.length - 1] === pointIndex
      ? ROUTE_POINT_COLORS.finalDelivery
      : ROUTE_POINT_COLORS.intermediateDelivery;
  }

  return ROUTE_POINT_COLORS.initialPickup;
}

function formatStopTime(p: TmsLoadLocationPoint): string {
  const date = (p.date ?? '').trim();
  const start = (p.time_start ?? '').trim();
  const end = (p.time_end ?? '').trim();
  const t = [start, end].filter(Boolean).join(' - ');
  return [date, t].filter(Boolean).join(' ');
}

function normalizeStopType(p: TmsLoadLocationPoint): 'pick_up_location' | 'delivery_location' | '' {
  const t = (p.type ?? '').trim();
  if (t === 'pick_up_location' || t === 'delivery_location') return t;
  return '';
}

function routePointFromGeocode(marker?: LoadRouteGeocodeMarker | null): RoutePoint | null {
  const latitude = Number(marker?.lat);
  const longitude = Number(marker?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function routePointFromTrackingPoint(point: DriverTrackingPoint): RoutePoint | null {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** Separate stacked history pins that share the same (or nearly same) coordinates. */
function spreadOverlappingCoordinates(
  points: Array<{ latitude: number; longitude: number }>,
): Array<{ latitude: number; longitude: number }> {
  const threshold = 0.00004;
  const result = points.map((point) => ({ ...point }));
  const clusters: number[][] = [];

  for (let i = 0; i < points.length; i++) {
    let cluster = clusters.find((indices) =>
      indices.some((idx) => {
        const a = points[i];
        const b = points[idx];
        return (
          Math.abs(a.latitude - b.latitude) <= threshold &&
          Math.abs(a.longitude - b.longitude) <= threshold
        );
      }),
    );
    if (!cluster) {
      cluster = [];
      clusters.push(cluster);
    }
    cluster.push(i);
  }

  for (const cluster of clusters) {
    if (cluster.length <= 1) continue;
    const base = points[cluster[0]];
    const radiusMeters = 16 + cluster.length * 3;
    cluster.forEach((pointIndex, positionInCluster) => {
      const angle = (2 * Math.PI * positionInCluster) / cluster.length;
      const latMeters = radiusMeters * Math.sin(angle);
      const lngMeters = radiusMeters * Math.cos(angle);
      const latOffset = latMeters / 111320;
      const lngOffset =
        lngMeters / (111320 * Math.max(0.25, Math.cos((base.latitude * Math.PI) / 180)));
      result[pointIndex] = {
        latitude: base.latitude + latOffset,
        longitude: base.longitude + lngOffset,
      };
    });
  }

  return result;
}

function normalizeTrackingStatus(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function formatDriverLocationLine(driver: LoadMapDriver | null): string {
  const location = [driver?.city, driver?.state].filter(Boolean).join(', ');
  const zip = String(driver?.zip ?? '').trim();
  return [location, zip].filter(Boolean).join(' ') || 'N/A';
}

function formatDriverCoordinates(latitude: number, longitude: number, hasCoordinates: boolean): string {
  if (!hasCoordinates) return 'N/A';
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function formatDriverUpdateTime(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatHistoryDate(value: string | null | undefined): string {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type LoadHistoryDetailPoint = {
  id: string | null;
  latitude: number;
  longitude: number;
  createdAt: string | null;
  updatedAt: string | null;
  driverName: string | null;
  placeLabel: string | null;
};

function getDriverInitials(driver: LoadMapDriver | null): string {
  const first = String(driver?.firstName ?? '').trim().charAt(0).toUpperCase();
  const last = String(driver?.lastName ?? '').trim().charAt(0).toUpperCase();
  return `${first}${last}` || '?';
}

function getPhoneDialUrl(phone: string | null | undefined): string | null {
  const normalized = String(phone ?? '').replace(/[^\d+]/g, '');
  return normalized ? `tel:${normalized}` : null;
}

function badgeForStatus(status: string): { bg: string; fg: string } {
  const s = status.trim().toLowerCase();
  if (s === 'waiting-on-pu-date') return { bg: '#E5E7EB', fg: '#111827' };
  if (s === 'at-pu') return { bg: '#CFE6FF', fg: '#0B3A75' };
  if (s === 'loaded-enroute') return { bg: '#FFE2B8', fg: '#7A3E00' };
  if (s === 'at-del') return { bg: '#E9D5FF', fg: '#4C1D95' };
  if (s === 'delivered') return { bg: '#CFEFD8', fg: '#0F5132' };
  if (s === 'waiting-on-rc') return { bg: '#FFE8A3', fg: '#5A4100' };
  if (s === 'tonu') return { bg: '#FFD0B3', fg: '#7A2E00' };
  if (s === 'cancelled') return { bg: '#F9C8C8', fg: '#7A0B0B' };
  return { bg: '#D9E6F7', fg: colors.primary.blue };
}

type LoadContactRow = {
  name?: string;
  phone?: string;
  phoneExt?: string;
  email?: string;
};

function cleanContactField(v: unknown): string {
  const s = cleanText(v);
  return s.toLowerCase() === 'unset' ? '' : s;
}

function parseAdditionalContacts(value: unknown): LoadContactRow[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
      .map((o) => ({
        name: cleanContactField(o.name) || undefined,
        phone: cleanContactField(o.phone) || undefined,
        phoneExt: cleanContactField((o as any).ext ?? (o as any).phone_ext) || undefined,
        email: cleanContactField(o.email) || undefined,
      }))
      .filter((r) => (r.name || r.phone || r.phoneExt || r.email));
  } catch {
    return [];
  }
}

function cleanText(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** TMS flags: second/third driver slot is used (not null / not explicitly off). */
function isDriverSlotMarked(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false || value === 0) return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === '' || s === '0' || s === 'false' || s === 'null' || s === 'unset') return false;
  }
  return true;
}

function humanizeUnderscores(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return t.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Normalize TMS / CSV token to same `value` as CREATE_OFFER_SPECIAL_REQUIREMENTS */
function instructionTokenToValue(token: string): string {
  return token.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}

/** Map token to canonical label from create-offer list, or return trimmed raw text. */
function formatInstructionChipLabel(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return '';
  const asValue = instructionTokenToValue(trimmed);
  const byValue = CREATE_OFFER_SPECIAL_REQUIREMENTS.find((o) => o.value === asValue);
  if (byValue) return byValue.label;
  const lower = trimmed.toLowerCase();
  const byLabel = CREATE_OFFER_SPECIAL_REQUIREMENTS.find(
    (o) => o.label.toLowerCase() === lower,
  );
  if (byLabel) return byLabel.label;
  return trimmed;
}

function parseInstructionsToLabels(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((part) => formatInstructionChipLabel(part))
    .filter((label) => label.length > 0);
}

type WordpressMediaResponse = {
  id: number;
  source_url?: string;
  title?: { rendered?: string };
  mime_type?: string;
  media_details?: {
    sizes?: {
      full?: { source_url?: string };
    };
  };
};

function useWpMediaFile(mediaIdRaw: string, kind: string): {
  mediaId: number | null;
  isPending: boolean;
  isError: boolean;
  fileUrl: string;
  fileName: string;
} {
  const mediaId = useMemo(() => {
    const n = Number(mediaIdRaw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }, [mediaIdRaw]);

  const q = useQuery({
    queryKey: ['wpMedia', kind, mediaId ?? 'none'],
    enabled: mediaId != null,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    gcTime: 4 * 60 * 60 * 1000,
    queryFn: async (): Promise<WordpressMediaResponse> => {
      const res = await fetch(`https://www.endurance-tms.com/wp-json/wp/v2/media/${mediaId}`);
      if (!res.ok) {
        throw new Error(`Failed to load WP media. Status: ${res.status}`);
      }
      return (await res.json()) as WordpressMediaResponse;
    },
  });

  const fileUrl =
    (q.data?.source_url ?? '').trim()
    || (q.data?.media_details?.sizes?.full?.source_url ?? '').trim();
  const fileName =
    (q.data?.title?.rendered ?? '').trim()
    || (mediaId != null ? `${kind}_${mediaId}` : kind);

  return {
    mediaId,
    isPending: q.isPending,
    isError: q.isError,
    fileUrl,
    fileName,
  };
}

function parseWpMediaIds(raw: string): number[] {
  const s = raw.trim();
  if (!s) return [];
  // Accept "1,2,3" or "[1,2,3]" or JSON string array.
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => Number(String(x).trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.trunc(n));
      }
    } catch {}
  }
  return s
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.trunc(n));
}

function useWpMediaFiles(mediaIdsRaw: string, kind: string): {
  mediaIds: number[];
  isPending: boolean;
  isError: boolean;
  files: Array<{ id: number; url: string; name: string }>;
} {
  const mediaIds = useMemo(() => parseWpMediaIds(mediaIdsRaw), [mediaIdsRaw]);
  const enabled = mediaIds.length > 0;

  const q = useQuery({
    queryKey: ['wpMedia', kind, mediaIds.join(',') || 'none'],
    enabled,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    gcTime: 4 * 60 * 60 * 1000,
    queryFn: async (): Promise<WordpressMediaResponse[]> => {
      const results = await Promise.all(
        mediaIds.map(async (id) => {
          const res = await fetch(`https://www.endurance-tms.com/wp-json/wp/v2/media/${id}`);
          if (!res.ok) {
            throw new Error(`Failed to load WP media. Status: ${res.status}`);
          }
          return (await res.json()) as WordpressMediaResponse;
        }),
      );
      return results;
    },
  });

  const files = (q.data ?? [])
    .map((m, idx) => {
      const id = typeof m?.id === 'number' ? m.id : mediaIds[idx] ?? 0;
      const url =
        (m?.source_url ?? '').trim()
        || (m?.media_details?.sizes?.full?.source_url ?? '').trim();
      const name = (m?.title?.rendered ?? '').trim() || `${kind}_${id || idx + 1}`;
      return { id, url, name };
    })
    .filter((f) => f.id > 0 && f.url);

  return { mediaIds, isPending: q.isPending, isError: q.isError, files };
}

function formatBookedDate(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoneyFromString(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const n = Number(String(s).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return s;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatMilesFromString(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const n = Number(String(s).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatWeightFromString(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const n = Number(String(s).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return s;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs`;
}

function canOpenUrl(url: string): boolean {
  return !!url && typeof url === 'string';
}

export default function LoadDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<OSMMapViewRef | null>(null);
  const { authState } = useAuth();
  const { socket, isConnected } = useWebSocket();
  const { id, loadJson } = useLocalSearchParams<{ id?: string; loadJson?: string }>();
  const [contentTab, setContentTab] = useState<'load' | 'trip' | 'accounting'>('load');
  const [isDriverInfoOpen, setIsDriverInfoOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedHistoryPointIndex, setSelectedHistoryPointIndex] = useState<number | null>(null);
  const [isOpeningLoadChat, setIsOpeningLoadChat] = useState(false);

  const canAccess = canAccessWorkTab(authState.user?.role);
  const role = (authState.user?.role ?? '').trim().toUpperCase();
  const isDriverRole = role === 'DRIVER';
  const showDriversTab = canAccessDriversAndOffers(role);

  useEffect(() => {
    if (authState.isAuthenticated && !canAccess) {
      router.replace('/final-verify');
    }
  }, [authState.isAuthenticated, canAccess, router]);

  const load = useMemo<YourLoadItem | null>(() => {
    if (!loadJson) return null;
    try {
      return JSON.parse(loadJson) as YourLoadItem;
    } catch {
      return null;
    }
  }, [loadJson]);

  // Removed debug logging for load payload

  const title = load
    ? [load.from_short_address, load.to_short_address].filter(Boolean).join(' -> ')
    : '';
  const headerTitle = load ? (title || '—') : 'Load';

  const routePoints = useMemo(() => {
    if (!load) return [];
    const pu = Array.isArray(load.pick_up_location) ? load.pick_up_location : [];
    const del = Array.isArray(load.delivery_location) ? load.delivery_location : [];
    const points = [
      ...pu.map((p) => ({ ...p, type: normalizeStopType(p) || 'pick_up_location' })),
      ...del.map((p) => ({ ...p, type: normalizeStopType(p) || 'delivery_location' })),
    ];
    return points;
  }, [load]);

  const loadIdForMap = load?.tms_load_id?.trim() || id?.trim() || '';
  const openLoadChat = async () => {
    if (!loadIdForMap || isOpeningLoadChat) return;

    try {
      setIsOpeningLoadChat(true);
      const rooms = await chatApi.getChatRooms();
      const activeLoadChat = rooms.find(
        (room) => room.type === 'LOAD' && room.loadId?.trim() === loadIdForMap,
      );
      if (activeLoadChat?.id) {
        setIsDriverInfoOpen(false);
        setIsHistoryOpen(false);
        router.push(`/chat/${activeLoadChat.id}` as any);
        return;
      }

      const archived = await chatApi.getArchivedLoadChatRooms(1, 50);
      const archivedLoadChat = archived.chatRooms.find(
        (room) => room.type === 'LOAD' && room.loadId?.trim() === loadIdForMap,
      );
      if (archivedLoadChat?.id) {
        setIsDriverInfoOpen(false);
        setIsHistoryOpen(false);
        router.push(`/chat/${archivedLoadChat.id}` as any);
        return;
      }

      Alert.alert('Load chat not found', 'You are not a participant of this load chat or it has not been created yet.');
    } catch (error) {
      console.error('Failed to open load chat:', error);
      Alert.alert('Error', 'Failed to open load chat.');
    } finally {
      setIsOpeningLoadChat(false);
    }
  };

  const loadMapQuery = useQuery({
    queryKey: ['loadMapPayload', loadIdForMap],
    enabled: Boolean(loadIdForMap),
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    queryFn: () => getLoadMapPayload(loadIdForMap),
  });
  const refetchLoadMap = loadMapQuery.refetch;

  useEffect(() => {
    if (!socket || !isConnected || !loadIdForMap) return;

    const handleLocationUpdate = (payload: { trackingLoadId?: string | null }) => {
      if (payload.trackingLoadId?.trim() === loadIdForMap) {
        refetchLoadMap().catch(() => {});
      }
    };

    const handleTrackingPointCreated = (payload: { loadId?: string | null }) => {
      if (payload.loadId?.trim() === loadIdForMap) {
        refetchLoadMap().catch(() => {});
      }
    };

    socket.on('userLocationUpdate', handleLocationUpdate);
    socket.on('driverTrackingPointCreated', handleTrackingPointCreated);
    return () => {
      socket.off('userLocationUpdate', handleLocationUpdate);
      socket.off('driverTrackingPointCreated', handleTrackingPointCreated);
    };
  }, [isConnected, loadIdForMap, refetchLoadMap, socket]);

  const pickupRoutePoint = useMemo(
    () => routePointFromGeocode(loadMapQuery.data?.routeGeocode?.pickup),
    [
      loadMapQuery.data?.routeGeocode?.pickup?.lat,
      loadMapQuery.data?.routeGeocode?.pickup?.lng,
    ],
  );
  const deliveryRoutePoint = useMemo(
    () => routePointFromGeocode(loadMapQuery.data?.routeGeocode?.delivery),
    [
      loadMapQuery.data?.routeGeocode?.delivery?.lat,
      loadMapQuery.data?.routeGeocode?.delivery?.lng,
    ],
  );

  const routeEndpointPoints = useMemo(
    () => [pickupRoutePoint, deliveryRoutePoint].filter((point): point is RoutePoint => point != null),
    [pickupRoutePoint, deliveryRoutePoint],
  );

  const routeDataQuery = useQuery({
    queryKey: [
      'loadRouteByGeocode',
      loadIdForMap,
      routeEndpointPoints.map((p) => `${p.latitude},${p.longitude}`).join('|'),
    ],
    enabled: routeEndpointPoints.length >= 2,
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    queryFn: () => fetchRouteForPoints(routeEndpointPoints),
  });

  const sortedTrackingPoints = useMemo(() => {
    const points = loadMapQuery.data?.trackingPoints ?? [];
    return [...points].sort((a, b) => {
      const aTime = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
      return aTime - bTime;
    });
  }, [loadMapQuery.data?.trackingPoints]);

  const loadHistoryDetails = useMemo<LoadHistoryDetailPoint[]>(() => {
    const drivers = loadMapQuery.data?.drivers ?? [];
    return sortedTrackingPoints
      .map((point) => {
        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }
        const externalDriverId = point.externalDriverId?.trim() || null;
        const driver = externalDriverId
          ? drivers.find((item) => item.externalId?.trim() === externalDriverId)
          : null;
        const driverName = [driver?.firstName, driver?.lastName].filter(Boolean).join(' ').trim();
        return {
          id: point.id ?? null,
          latitude,
          longitude,
          createdAt: point.createdAt ?? null,
          updatedAt: point.updatedAt ?? null,
          driverName: driverName || null,
          placeLabel: point.placeLabel?.trim() || null,
        };
      })
      .filter((point): point is LoadHistoryDetailPoint => point != null);
  }, [loadMapQuery.data?.drivers, sortedTrackingPoints]);

  const historyPoints = useMemo(
    () =>
      sortedTrackingPoints
        .map((point) => ({
          raw: point,
          coordinate: routePointFromTrackingPoint(point),
        }))
        .filter((point): point is { raw: DriverTrackingPoint; coordinate: RoutePoint } => point.coordinate != null),
    [sortedTrackingPoints],
  );

  const currentTrackingDriver = useMemo<LoadMapDriver | null>(() => {
    const drivers = loadMapQuery.data?.drivers ?? [];
    if (sortedTrackingPoints.length > 0) {
      for (let i = sortedTrackingPoints.length - 1; i >= 0; i--) {
        const externalId = sortedTrackingPoints[i]?.externalDriverId?.trim();
        if (!externalId) continue;
        const fromHistory = drivers.find((driver) => driver.externalId?.trim() === externalId);
        if (fromHistory) return fromHistory;
      }
    }
    return drivers[0] ?? null;
  }, [loadMapQuery.data?.drivers, sortedTrackingPoints]);

  const currentDriverLatitude = Number(currentTrackingDriver?.latitude);
  const currentDriverLongitude = Number(currentTrackingDriver?.longitude);
  const hasCurrentDriverCoordinates =
    Number.isFinite(currentDriverLatitude) && Number.isFinite(currentDriverLongitude);
  const isDeliveredLoad = normalizeTrackingStatus(load?.load_status) === 'delivered';
  const isLoadLoadedEnroute = normalizeTrackingStatus(load?.load_status) === 'loaded_enroute';
  const isDriverLoadedEnroute =
    normalizeTrackingStatus(currentTrackingDriver?.driverStatus ?? null) === 'loaded_enroute';
  const showDriverLiveMarker =
    !isDeliveredLoad &&
    isLoadLoadedEnroute &&
    isDriverLoadedEnroute &&
    hasCurrentDriverCoordinates;
  const currentDriverFullName =
    [currentTrackingDriver?.firstName, currentTrackingDriver?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Driver';
  const currentDriverDisplayName = currentTrackingDriver?.externalId
    ? `(${currentTrackingDriver.externalId}) ${currentDriverFullName}`
    : currentDriverFullName;
  const currentDriverLocationLine = formatDriverLocationLine(currentTrackingDriver);
  const currentDriverCoordinates = formatDriverCoordinates(
    currentDriverLatitude,
    currentDriverLongitude,
    hasCurrentDriverCoordinates,
  );
  const currentDriverStatusLabel = getStatusLabelForFilter(currentTrackingDriver?.driverStatus);
  const currentDriverLastUpdate = formatDriverUpdateTime(currentTrackingDriver?.lastLocationUpdateAt);
  const currentDriverPhoneDialUrl = getPhoneDialUrl(currentTrackingDriver?.phone);

  const endpointMarkers = useMemo(() => {
    const pickupStop = routePoints.find((point) => point.type === 'pick_up_location');
    const deliveryStop = [...routePoints].reverse().find((point) => point.type === 'delivery_location');
    const pickupLabel = loadMapQuery.data?.routeGeocode?.pickup?.addressLabel;
    const deliveryLabel = loadMapQuery.data?.routeGeocode?.delivery?.addressLabel;
    const items = [];

    if (pickupRoutePoint) {
      items.push({
        kind: 'pickup' as const,
        coordinate: pickupRoutePoint,
        markerColor: '#2563EB',
        tooltipType: 'Pick up',
        tooltipAddress:
          String(pickupStop?.address ?? pickupStop?.short_address ?? pickupLabel ?? '').trim(),
        tooltipTime: pickupStop ? formatStopTime(pickupStop as TmsLoadLocationPoint) : '',
      });
    }

    if (deliveryRoutePoint) {
      items.push({
        kind: 'delivery' as const,
        coordinate: deliveryRoutePoint,
        markerColor: '#16A34A',
        tooltipType: 'Delivery',
        tooltipAddress:
          String(deliveryStop?.address ?? deliveryStop?.short_address ?? deliveryLabel ?? '').trim(),
        tooltipTime: deliveryStop ? formatStopTime(deliveryStop as TmsLoadLocationPoint) : '',
      });
    }

    return items;
  }, [
    deliveryRoutePoint,
    loadMapQuery.data?.routeGeocode?.delivery?.addressLabel,
    loadMapQuery.data?.routeGeocode?.pickup?.addressLabel,
    pickupRoutePoint,
    routePoints,
  ]);

  const historyMarkerCoordinates = useMemo(
    () => spreadOverlappingCoordinates(historyPoints.map((point) => point.coordinate)),
    [historyPoints],
  );

  const historyMarkers = useMemo(
    () =>
      historyPoints.map((point, index) => ({
        kind: 'history' as const,
        coordinate: historyMarkerCoordinates[index] ?? point.coordinate,
        label: String(index + 1),
        historyIndex: index,
        isLastHistoryPoint: index === historyPoints.length - 1,
        tooltipType: `History point ${index + 1}`,
        tooltipAddress: point.raw.placeLabel ?? '',
        tooltipTime: String(point.raw.createdAt ?? point.raw.updatedAt ?? ''),
      })),
    [historyMarkerCoordinates, historyPoints],
  );

  const driverLiveMarker = useMemo(
    () =>
      showDriverLiveMarker
        ? [
            {
              kind: 'liveDriver' as const,
              coordinate: {
                latitude: currentDriverLatitude,
                longitude: currentDriverLongitude,
              },
              tooltipType:
                [currentTrackingDriver?.firstName, currentTrackingDriver?.lastName]
                  .filter(Boolean)
                  .join(' ')
                  .trim() || 'Driver',
              tooltipAddress: [currentTrackingDriver?.city, currentTrackingDriver?.state]
                .filter(Boolean)
                .join(', '),
              tooltipTime: currentTrackingDriver?.lastLocationUpdateAt ?? '',
            },
          ]
        : [],
    [
      currentDriverLatitude,
      currentDriverLongitude,
      currentTrackingDriver?.city,
      currentTrackingDriver?.firstName,
      currentTrackingDriver?.lastLocationUpdateAt,
      currentTrackingDriver?.lastName,
      currentTrackingDriver?.state,
      showDriverLiveMarker,
    ],
  );

  const markers = useMemo(
    () => [...endpointMarkers, ...historyMarkers, ...driverLiveMarker],
    [driverLiveMarker, endpointMarkers, historyMarkers],
  );
  const polylineCoordinates = routeDataQuery.data?.polyline ?? undefined;
  const historyPolyline = useMemo(
    () => historyPoints.map((point) => point.coordinate),
    [historyPoints],
  );
  const mapPolylines = useMemo(
    () =>
      historyPolyline.length > 1
        ? [
            {
              coordinates: historyPolyline,
              color: HISTORY_POLYLINE_COLOR,
              weight: 4,
              opacity: 0.85,
            },
          ]
        : [],
    [historyPolyline],
  );
  const routeLoading = loadMapQuery.isLoading || routeDataQuery.isLoading;
  const loadStatusRaw = (load?.load_status ?? '').trim();
  const loadStatusLabel = loadStatusRaw ? labelForDriverLoadStatus(loadStatusRaw) : '';
  const statusBadge = badgeForStatus(loadStatusRaw);

  const meta = (load?.raw?.meta_data ?? {}) as Record<string, unknown>;
  const contactName = cleanText(meta.contact_name);
  const contactPhone = cleanText(meta.contact_phone);
  const contactPhoneExt = cleanText(meta.contact_phone_ext);
  const contactEmail = cleanText(meta.contact_email);
  const additionalContacts = useMemo(
    () => parseAdditionalContacts(meta.additional_contacts),
    [meta.additional_contacts],
  );

  const referenceNumber = cleanText(meta.reference_number);
  const loadTypeRaw = cleanText(meta.load_type);
  const loadTypeDisplay = useMemo(() => {
    if (!loadTypeRaw) return '';
    return loadTypeRaw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }, [loadTypeRaw]);

  const dateCreatedRaw =
    cleanText(load?.raw?.date_created) || cleanText(meta.date_created);
  const dateBookedDisplay = useMemo(
    () => formatBookedDate(dateCreatedRaw),
    [dateCreatedRaw],
  );
  const sourceRaw = cleanText(meta.source);
  const sourceDisplay = useMemo(() => {
    if (!sourceRaw) return '';
    return sourceRaw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }, [sourceRaw]);
  const dispatcherExternalId = cleanText(meta.dispatcher_initials);
  const { data: dispatcherUser, isLoading: dispatcherLoading, error: dispatcherError } =
    useUserByExternalId(dispatcherExternalId || undefined);
  const dispatcherFullName = useMemo(() => {
    if (!dispatcherUser) return '';
    const fn = String(dispatcherUser.firstName ?? '').trim();
    const ln = String(dispatcherUser.lastName ?? '').trim();
    return [fn, ln].filter(Boolean).join(' ');
  }, [dispatcherUser]);
  const dispatcherPhone = cleanText(dispatcherUser?.phone);

  const dispatcherNameUi = !dispatcherExternalId
    ? '—'
    : dispatcherLoading
      ? 'Loading…'
      : dispatcherError
        ? '—'
        : dispatcherFullName || '—';
  const dispatcherPhoneUi = !dispatcherExternalId
    ? '—'
    : dispatcherLoading
      ? 'Loading…'
      : dispatcherError
        ? '—'
        : dispatcherPhone || '—';

  const unitNumberNameRaw = cleanText(meta.unit_number_name);
  const unitNumberNameDisplay = useMemo(
    () => humanizeUnderscores(unitNumberNameRaw),
    [unitNumberNameRaw],
  );
  const driverRateRaw =
    cleanText(meta.driver_rate) ||
    (typeof load?.driver_rate === 'number' && Number.isFinite(load.driver_rate)
      ? String(load.driver_rate)
      : '');
  const driverRateDisplay = useMemo(
    () => formatMoneyFromString(driverRateRaw),
    [driverRateRaw],
  );
  const driverPhone = cleanText(meta.driver_phone);
  const profitRaw = cleanText(meta.profit);
  const profitDisplay = useMemo(() => formatMoneyFromString(profitRaw), [profitRaw]);

  const secondDriverMarked = isDriverSlotMarked(meta.second_driver);
  const thirdDriverMarked = isDriverSlotMarked(meta.third_driver);

  const secondUnitRaw = cleanText(meta.second_unit_number_name);
  const secondUnitDisplay = useMemo(() => humanizeUnderscores(secondUnitRaw), [secondUnitRaw]);
  const secondRateRaw = cleanText(meta.second_driver_rate);
  const secondRateDisplay = useMemo(
    () => formatMoneyFromString(secondRateRaw),
    [secondRateRaw],
  );
  const secondPhone = cleanText(meta.second_driver_phone);

  const thirdUnitRaw = cleanText(meta.third_unit_number_name);
  const thirdUnitDisplay = useMemo(() => humanizeUnderscores(thirdUnitRaw), [thirdUnitRaw]);
  const thirdRateRaw = cleanText(meta.third_driver_rate);
  const thirdRateDisplay = useMemo(() => formatMoneyFromString(thirdRateRaw), [thirdRateRaw]);
  const thirdPhone = cleanText(meta.third_driver_phone);

  const instructionsRaw = cleanText(meta.instructions);
  const instructionLabels = useMemo(
    () => parseInstructionsToLabels(instructionsRaw),
    [instructionsRaw],
  );

  const cargoCommodity = cleanText(meta.commodity);
  const cargoWeight = cleanText(meta.weight);
  const cargoWeightUi = cargoWeight ? formatWeightFromString(cargoWeight) : '—';
  const cargoNotes = cleanText(meta.notes);
  const allMilesRaw = cleanText(meta.all_miles);
  const allEmptyMilesRaw = cleanText(meta.all_empty_miles);
  const loadedMilesUi = allMilesRaw ? formatMilesFromString(allMilesRaw) : '—';
  const emptyMilesUi = allEmptyMilesRaw ? formatMilesFromString(allEmptyMilesRaw) : '—';

  const factoringStatusRaw = cleanText(meta.factoring_status);
  const factoringStatusDisplay = useMemo(
    () => humanizeUnderscores(factoringStatusRaw),
    [factoringStatusRaw],
  );
  const invoicedProofRaw = cleanText(meta.invoiced_proof);
  const invoicedProofUi =
    invoicedProofRaw === ''
      ? '—'
      : invoicedProofRaw === '1'
        ? 'Yes'
        : 'No';

  const driverPayStatusesRaw = cleanText(meta.driver_pay_statuses);
  const driverPayStatusLabels = useMemo(() => {
    if (!driverPayStatusesRaw.trim()) return [];
    // Accept comma-separated or JSON array.
    const s = driverPayStatusesRaw.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const parsed: unknown = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed
            .map((x) => humanizeUnderscores(String(x ?? '').trim()))
            .filter(Boolean);
        }
      } catch {}
    }
    return s
      .split(',')
      .map((p) => humanizeUnderscores(p))
      .filter(Boolean);
  }, [driverPayStatusesRaw]);

  const pod = useWpMediaFile(cleanText(meta.proof_of_delivery), 'proof_of_delivery');
  const updatedRateConfirmation = useWpMediaFile(
    cleanText(meta.updated_rate_confirmation),
    'updated_rate_confirmation',
  );
  const freightPictures = useWpMediaFiles(cleanText(meta.freight_pictures), 'freight_pictures');
  const otherFiles = useWpMediaFiles(cleanText(meta.attached_files), 'attached_files');
  const dispatchMessage = useWpMediaFile(cleanText(meta.screen_picture), 'screen_picture');

  const focusRoutePointOnMap = (pointIndex: number) => {
    const marker = routeEndpointPoints[pointIndex];
    if (!marker || !mapRef.current) return;

    mapRef.current.animateToRegion({
      latitude: marker.latitude,
      longitude: marker.longitude,
      latitudeDelta: ROUTE_POINT_FOCUS_DELTA,
      longitudeDelta: ROUTE_POINT_FOCUS_DELTA,
    });
  };

  const focusHistoryPointOnMap = (index: number) => {
    const point = historyMarkerCoordinates[index] ?? loadHistoryDetails[index];
    if (!point || !mapRef.current) return;
    setSelectedHistoryPointIndex(index);
    setIsHistoryOpen(false);
    mapRef.current.animateToRegion({
      latitude: point.latitude,
      longitude: point.longitude,
      latitudeDelta: ROUTE_POINT_FOCUS_DELTA,
      longitudeDelta: ROUTE_POINT_FOCUS_DELTA,
    });
  };

  useEffect(() => {
    const bounds = routeDataQuery.data?.bounds;
    if (!bounds || !mapRef.current) return;
    const b = bounds;
    const pad = 0.15;
    mapRef.current.animateToRegion({
      latitude: (b.minLat + b.maxLat) / 2,
      longitude: (b.minLng + b.maxLng) / 2,
      latitudeDelta: b.maxLat - b.minLat + pad,
      longitudeDelta: b.maxLng - b.minLng + pad,
    });
  }, [routeDataQuery.data?.bounds]);

  return (
    <View
      style={[
        styles.screenWrap,
        { paddingBottom: Platform.OS === 'android' ? insets.bottom : 0 },
      ]}
    >
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <ArrowLeft width={24} height={24} color={colors.neutral.white} />
              </TouchableOpacity>
              <Text style={styles.screenTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.mainScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={Platform.OS === 'android'}
            stickyHeaderIndices={[1]}
          >
            <View style={styles.mapWrap} collapsable={false}>
              {routeLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color={colors.primary.blue} />
                  <Text style={styles.loadingText}>Loading route…</Text>
                </View>
              ) : null}
              {loadStatusLabel ? (
                <View style={styles.mapStatusBadgeWrap} pointerEvents="none">
                  <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                    <Text
                      style={[styles.statusBadgeText, { color: statusBadge.fg }]}
                      numberOfLines={1}
                    >
                      {loadStatusLabel}
                    </Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.historyOverlay} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.historyButton}
                  activeOpacity={0.85}
                  onPress={() => setIsHistoryOpen((prev) => !prev)}
                >
                  <Text style={styles.historyButtonText}>
                    {isHistoryOpen ? 'Hide history' : 'History'}
                  </Text>
                  {!isHistoryOpen && loadHistoryDetails.length > 0 ? (
                    <View style={styles.historyCountBadge}>
                      <Text style={styles.historyCountBadgeText}>{loadHistoryDetails.length}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                {isHistoryOpen ? (
                  <View style={styles.historyPanel}>
                    <TouchableOpacity
                      style={styles.historyCloseButton}
                      activeOpacity={0.8}
                      onPress={() => setIsHistoryOpen(false)}
                    >
                      <Text style={styles.historyCloseText}>×</Text>
                    </TouchableOpacity>
                    <View style={styles.historyPanelHeader}>
                      <Text style={styles.historyPanelTitle}>Load history</Text>
                      <View style={styles.historyPanelCountBadge}>
                        <Text style={styles.historyPanelCountText}>{loadHistoryDetails.length}</Text>
                      </View>
                    </View>
                    <ScrollView
                      style={styles.historyList}
                      contentContainerStyle={styles.historyListContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      {loadHistoryDetails.length > 0 ? (
                        loadHistoryDetails.map((point, index) => {
                          const isSelected = selectedHistoryPointIndex === index;
                          return (
                            <TouchableOpacity
                              key={
                                point.id ??
                                `${point.latitude}-${point.longitude}-${point.createdAt ?? index}`
                              }
                              style={[
                                styles.historyItemCard,
                                isSelected && styles.historyItemCardSelected,
                              ]}
                              activeOpacity={0.85}
                              onPress={() => focusHistoryPointOnMap(index)}
                            >
                              <Text style={styles.historyItemStep}>Step {index + 1}</Text>
                              <Text style={styles.historyItemLine}>
                                <Text style={styles.historyItemLabel}>Coordinates: </Text>
                                {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                              </Text>
                              {point.placeLabel ? (
                                <Text style={styles.historyItemLine}>
                                  <Text style={styles.historyItemLabel}>Place: </Text>
                                  {point.placeLabel}
                                </Text>
                              ) : null}
                              {point.driverName ? (
                                <Text style={styles.historyItemLine}>
                                  <Text style={styles.historyItemLabel}>Driver: </Text>
                                  {point.driverName}
                                </Text>
                              ) : null}
                              <Text style={styles.historyItemLine}>
                                <Text style={styles.historyItemLabel}>Tracked: </Text>
                                {formatHistoryDate(point.createdAt)}
                              </Text>
                              <Text style={styles.historyItemLine}>
                                <Text style={styles.historyItemLabel}>Updated: </Text>
                                {formatHistoryDate(point.updatedAt)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <Text style={styles.historyEmptyText}>No history points yet.</Text>
                      )}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              {currentTrackingDriver ? (
                <View style={styles.driverInfoOverlay} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.driverInfoButton}
                    activeOpacity={0.85}
                    onPress={() => setIsDriverInfoOpen((prev) => !prev)}
                  >
                    <Text style={styles.driverInfoButtonText}>
                      {isDriverInfoOpen ? 'Hide driver' : 'Driver info'}
                    </Text>
                  </TouchableOpacity>
                  {isDriverInfoOpen ? (
                    <View style={styles.driverInfoCard}>
                      <TouchableOpacity
                        style={styles.driverInfoCloseButton}
                        activeOpacity={0.8}
                        onPress={() => setIsDriverInfoOpen(false)}
                      >
                        <Text style={styles.driverInfoCloseText}>×</Text>
                      </TouchableOpacity>
                      <View style={styles.driverInfoHeader}>
                        <View style={styles.driverAvatar}>
                          {currentTrackingDriver.profilePhoto ? (
                            <Image
                              source={{ uri: currentTrackingDriver.profilePhoto }}
                              style={styles.driverAvatarImage}
                            />
                          ) : (
                            <Text style={styles.driverAvatarText}>
                              {getDriverInitials(currentTrackingDriver)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.driverHeaderTextWrap}>
                          <Text style={styles.driverNameText} numberOfLines={2}>
                            {currentDriverDisplayName}
                          </Text>
                          <Text style={styles.driverSubText} numberOfLines={1}>
                            {currentDriverLocationLine}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.driverInfoGrid}>
                        <View style={styles.driverInfoCell}>
                          <Text style={styles.driverInfoLabel}>Phone</Text>
                          {currentDriverPhoneDialUrl ? (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => Linking.openURL(currentDriverPhoneDialUrl)}
                            >
                              <Text
                                style={[styles.driverInfoValue, styles.driverInfoLinkValue]}
                                numberOfLines={1}
                              >
                                {currentTrackingDriver.phone}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.driverInfoValue} numberOfLines={1}>
                              N/A
                            </Text>
                          )}
                        </View>
                        <View style={styles.driverInfoCell}>
                          <Text style={styles.driverInfoLabel}>Driver Status</Text>
                          <Text style={styles.driverInfoValue} numberOfLines={1}>
                            {currentDriverStatusLabel}
                          </Text>
                        </View>
                        <View style={styles.driverInfoCell}>
                          <Text style={styles.driverInfoLabel}>Coordinates</Text>
                          <Text style={styles.driverInfoValue} numberOfLines={2}>
                            {currentDriverCoordinates}
                          </Text>
                        </View>
                        <View style={styles.driverInfoCell}>
                          <Text style={styles.driverInfoLabel}>Load Status</Text>
                          <Text style={styles.driverInfoValue} numberOfLines={1}>
                            {loadStatusLabel || 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.driverInfoCell}>
                          <Text style={styles.driverInfoLabel}>Last Driver Update</Text>
                          <Text style={styles.driverInfoValue} numberOfLines={1}>
                            {currentDriverLastUpdate}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.openLoadChatButton,
                            (!loadIdForMap || isOpeningLoadChat) && styles.openLoadChatButtonDisabled,
                          ]}
                          activeOpacity={0.85}
                          disabled={!loadIdForMap || isOpeningLoadChat}
                          onPress={openLoadChat}
                        >
                          {isOpeningLoadChat ? (
                            <ActivityIndicator size="small" color={colors.neutral.white} />
                          ) : (
                            <Text style={styles.openLoadChatButtonText}>Open chat</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <OSMMapView
                ref={mapRef}
                initialRegion={DEFAULT_REGION}
                markers={markers as any}
                polylineCoordinates={polylineCoordinates}
                polylines={mapPolylines}
                useMapTilerBasemap
                style={StyleSheet.absoluteFill}
              />
            </View>

            <View style={[styles.tabsStickyWrap, { width: SCREEN_WIDTH }]}>
              <View style={styles.tabsGrid}>
                {LOAD_DETAIL_TAB_ROWS.map((row, rowIndex) => (
                  <View key={`load-tab-row-${rowIndex}`} style={styles.tabsRow}>
                    {row.map((t) => (
                      <TouchableOpacity
                        key={t.key}
                        style={[
                          styles.tabButton,
                          contentTab === t.key && styles.tabButtonActive,
                        ]}
                        onPress={() => setContentTab(t.key)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[styles.tabText, contentTab === t.key && styles.tabTextActive]}
                          numberOfLines={1}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            </View>

            {contentTab === 'trip' ? (
              <>
                <View style={styles.milesCard}>
                  <View style={styles.milesCol}>
                    <Text style={styles.milesLabel}>Loaded miles</Text>
                    <Text style={styles.milesValue}>{loadedMilesUi}</Text>
                  </View>
                  <View style={styles.milesDivider} />
                  <View style={styles.milesCol}>
                    <Text style={styles.milesLabel}>Empty miles</Text>
                    <Text style={styles.milesValue}>{emptyMilesUi}</Text>
                  </View>
                </View>

                {routePoints.length > 0 ? (
                  <View style={styles.routeSection}>
                    <Text style={styles.routeSectionTitle}>Route</Text>
                    {routePoints.map((point, idx) => (
                      <View
                        key={`${idx}-${String(point.address ?? point.short_address ?? '')}`}
                        style={[
                          styles.routeStopCard,
                          idx < routePoints.length - 1 && styles.routeStopDivider,
                        ]}
                      >
                        <View style={styles.routeStopHeader}>
                          <View
                            style={[
                              styles.routePointDot,
                              { backgroundColor: getRoutePointColor(routePoints, idx) },
                            ]}
                          />
                          <Text style={styles.routeStopTitle}>
                            {point.type === 'pick_up_location' ? 'Pick up' : 'Delivery'}
                          </Text>
                        </View>
                        <View style={styles.routeStopRow}>
                          <TouchableOpacity
                            style={styles.routeStopAddressWrap}
                            activeOpacity={routeEndpointPoints[idx] ? 0.7 : 1}
                            disabled={!routeEndpointPoints[idx]}
                            onPress={() => focusRoutePointOnMap(idx)}
                          >
                            <Text style={styles.routeStopAddress}>
                              {String(point.address ?? point.short_address ?? '—') || '—'}
                            </Text>
                          </TouchableOpacity>
                          <Text style={styles.routeStopTime}>
                            {formatStopTime(point as TmsLoadLocationPoint) || '—'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : contentTab === 'customer' ? (
              <>
                <View style={styles.contactsSection}>
                  <Text style={styles.contactsSectionTitle}>Contacts</Text>

                  <View style={styles.contactsRow}>
                    <Text style={styles.contactsLabel}>Name</Text>
                    <Text style={styles.contactsValue} numberOfLines={2}>
                      {contactName || '—'}
                    </Text>
                  </View>

                  <View style={styles.contactsRow}>
                    <Text style={styles.contactsLabel}>Phone</Text>
                    {contactPhone ? (
                      <TouchableOpacity
                        style={styles.contactsValueWrap}
                        activeOpacity={0.7}
                        onPress={() => {
                          const tel = `tel:${contactPhone}`;
                          if (canOpenUrl(tel)) Linking.openURL(tel).catch(() => {});
                        }}
                      >
                        <Text style={styles.contactsLink} numberOfLines={2}>
                          {contactPhone}
                          {contactPhoneExt ? ` ext ${contactPhoneExt}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.contactsValue} numberOfLines={2}>
                        —
                      </Text>
                    )}
                  </View>

                  <View style={styles.contactsRow}>
                    <Text style={styles.contactsLabel}>Email</Text>
                    {contactEmail ? (
                      <TouchableOpacity
                        style={styles.contactsValueWrap}
                        activeOpacity={0.7}
                        onPress={() => {
                          const mail = `mailto:${contactEmail}`;
                          if (canOpenUrl(mail)) Linking.openURL(mail).catch(() => {});
                        }}
                      >
                        <Text style={styles.contactsLink} numberOfLines={2}>
                          {contactEmail}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.contactsValue} numberOfLines={2}>
                        —
                      </Text>
                    )}
                  </View>
                </View>

                {additionalContacts.length > 0 ? (
                  <View style={styles.additionalContactsSection}>
                    <Text style={styles.additionalContactsSectionTitle}>Additional contacts</Text>
                    {additionalContacts.map((c, idx) => (
                      <View
                        key={`ac-${idx}-${c.email ?? c.phone ?? c.name ?? ''}`}
                        style={[
                          styles.additionalContactBlock,
                          idx < additionalContacts.length - 1 && styles.additionalContactGap,
                        ]}
                      >
                        {c.name ? (
                          <View style={styles.additionalContactRow}>
                            <Text style={styles.additionalContactLabel}>Name</Text>
                            <Text style={styles.additionalContactValue} numberOfLines={2}>
                              {c.name}
                            </Text>
                          </View>
                        ) : null}

                        {c.phone ? (
                          <View style={styles.additionalContactRow}>
                            <Text style={styles.additionalContactLabel}>Phone</Text>
                            <Text style={styles.additionalContactValue} numberOfLines={2}>
                              {c.phone}
                              {c.phoneExt ? ` ext ${c.phoneExt}` : ''}
                            </Text>
                          </View>
                        ) : null}

                        {c.email ? (
                          <View style={styles.additionalContactRow}>
                            <Text style={styles.additionalContactLabel}>Email</Text>
                            <Text style={styles.additionalContactValue} numberOfLines={2}>
                              {c.email}
                            </Text>
                          </View>
                        ) : null}

                        {!c.name && !c.phone && !c.email ? (
                          <View style={styles.additionalContactRow}>
                            <Text style={styles.additionalContactLabel}>Contact</Text>
                            <Text style={styles.additionalContactValue}>—</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : contentTab === 'load' ? (
              <>
                <View style={styles.loadInfoSection}>
                  <Text style={styles.loadInfoSectionTitle}>Load</Text>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Reference number</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {referenceNumber || '—'}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Load status</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {loadStatusLabel || '—'}
                    </Text>
                  </View>

                  {!isDriverRole ? (
                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Load type</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {loadTypeDisplay || '—'}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.loadInfoSection}>
                  <Text style={styles.loadInfoSectionTitle}>Dispatcher</Text>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Date Booked</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {dateBookedDisplay || '—'}
                    </Text>
                  </View>

                  {!isDriverRole ? (
                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Source</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {sourceDisplay || sourceRaw || '—'}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Dispatcher</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {dispatcherNameUi}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Dispatcher phone</Text>
                    {dispatcherPhone && !dispatcherLoading && !dispatcherError && dispatcherExternalId ? (
                      <TouchableOpacity
                        style={styles.contactsValueWrap}
                        activeOpacity={0.7}
                        onPress={() => {
                          const tel = `tel:${dispatcherPhone}`;
                          if (canOpenUrl(tel)) Linking.openURL(tel).catch(() => {});
                        }}
                      >
                        <Text style={styles.contactsLink} numberOfLines={2}>
                          {dispatcherPhone}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {dispatcherPhoneUi}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.loadInfoSection}>
                  <Text style={styles.loadInfoSectionTitle}>Driver</Text>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Unit number</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {unitNumberNameDisplay || unitNumberNameRaw || '—'}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Driver rate</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {driverRateDisplay || '—'}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Driver phone</Text>
                    {driverPhone ? (
                      <TouchableOpacity
                        style={styles.contactsValueWrap}
                        activeOpacity={0.7}
                        onPress={() => {
                          const tel = `tel:${driverPhone}`;
                          if (canOpenUrl(tel)) Linking.openURL(tel).catch(() => {});
                        }}
                      >
                        <Text style={styles.contactsLink} numberOfLines={2}>
                          {driverPhone}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        —
                      </Text>
                    )}
                  </View>

                  {!isDriverRole ? (
                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Profit</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {profitDisplay || '—'}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {secondDriverMarked ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Driver 2</Text>

                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Unit number</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {secondUnitDisplay || secondUnitRaw || '—'}
                      </Text>
                    </View>

                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Driver rate</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {secondRateDisplay || '—'}
                      </Text>
                    </View>

                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Driver phone</Text>
                      {secondPhone ? (
                        <TouchableOpacity
                          style={styles.contactsValueWrap}
                          activeOpacity={0.7}
                          onPress={() => {
                            const tel = `tel:${secondPhone}`;
                            if (canOpenUrl(tel)) Linking.openURL(tel).catch(() => {});
                          }}
                        >
                          <Text style={styles.contactsLink} numberOfLines={2}>
                            {secondPhone}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.loadInfoValue} numberOfLines={2}>
                          —
                        </Text>
                      )}
                    </View>
                  </View>
                ) : null}

                {thirdDriverMarked ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Driver 3</Text>

                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Unit number</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {thirdUnitDisplay || thirdUnitRaw || '—'}
                      </Text>
                    </View>

                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Driver rate</Text>
                      <Text style={styles.loadInfoValue} numberOfLines={2}>
                        {thirdRateDisplay || '—'}
                      </Text>
                    </View>

                    <View style={styles.loadInfoRow}>
                      <Text style={styles.loadInfoLabel}>Driver phone</Text>
                      {thirdPhone ? (
                        <TouchableOpacity
                          style={styles.contactsValueWrap}
                          activeOpacity={0.7}
                          onPress={() => {
                            const tel = `tel:${thirdPhone}`;
                            if (canOpenUrl(tel)) Linking.openURL(tel).catch(() => {});
                          }}
                        >
                          <Text style={styles.contactsLink} numberOfLines={2}>
                            {thirdPhone}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.loadInfoValue} numberOfLines={2}>
                          —
                        </Text>
                      )}
                    </View>
                  </View>
                ) : null}

                {instructionLabels.length > 0 ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Instructions</Text>
                    <View style={styles.instructionsChipsWrap}>
                      {instructionLabels.map((label, idx) => (
                        <View key={`instr-${idx}-${label}`} style={styles.instructionChip}>
                          <Text style={styles.instructionChipText}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.loadInfoSection}>
                  <Text style={styles.loadInfoSectionTitle}>
                    Additional information about the cargo
                  </Text>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Commodity</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={4}>
                      {cargoCommodity || '—'}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Weight</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {cargoWeightUi}
                    </Text>
                  </View>

                  <View style={[styles.loadInfoRow, styles.cargoNotesRow]}>
                    <Text style={[styles.loadInfoLabel, styles.cargoNotesLabel]}>Notes</Text>
                    <Text style={[styles.loadInfoValue, styles.cargoNotesValue]}>
                      {cargoNotes || '—'}
                    </Text>
                  </View>
                </View>
              </>
            ) : contentTab === 'documents' ? (
              <>
                {pod.mediaId != null ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Proof Of Delivery</Text>
                    {pod.isPending ? (
                      <Text style={styles.documentsHint}>Loading…</Text>
                    ) : pod.isError ? (
                      <Text style={styles.documentsHint}>Could not load file</Text>
                    ) : pod.fileUrl ? (
                      <View style={styles.documentPreviewWrap}>
                        <FilePreviewCard fileUrl={pod.fileUrl} fileName={pod.fileName} isSender={false} />
                      </View>
                    ) : (
                      <Text style={styles.documentsHint}>File link not found</Text>
                    )}
                  </View>
                ) : null}

                {updatedRateConfirmation.mediaId != null ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Updated rate confirmation</Text>
                    {updatedRateConfirmation.isPending ? (
                      <Text style={styles.documentsHint}>Loading…</Text>
                    ) : updatedRateConfirmation.isError ? (
                      <Text style={styles.documentsHint}>Could not load file</Text>
                    ) : updatedRateConfirmation.fileUrl ? (
                      <View style={styles.documentPreviewWrap}>
                        <FilePreviewCard
                          fileUrl={updatedRateConfirmation.fileUrl}
                          fileName={updatedRateConfirmation.fileName}
                          isSender={false}
                        />
                      </View>
                    ) : (
                      <Text style={styles.documentsHint}>File link not found</Text>
                    )}
                  </View>
                ) : null}

                {freightPictures.mediaIds.length > 0 ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Freight Pictures</Text>
                    {freightPictures.isPending ? (
                      <Text style={styles.documentsHint}>Loading…</Text>
                    ) : freightPictures.isError ? (
                      <Text style={styles.documentsHint}>Could not load files</Text>
                    ) : freightPictures.files.length > 0 ? (
                      <View style={styles.freightPicturesWrap}>
                        {freightPictures.files.map((f) => (
                          <FilePreviewCard
                            key={`freight-${f.id}`}
                            fileUrl={f.url}
                            fileName={f.name}
                            isSender={false}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.documentsHint}>File links not found</Text>
                    )}
                  </View>
                ) : null}

                {otherFiles.mediaIds.length > 0 ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Other files</Text>
                    {otherFiles.isPending ? (
                      <Text style={styles.documentsHint}>Loading…</Text>
                    ) : otherFiles.isError ? (
                      <Text style={styles.documentsHint}>Could not load files</Text>
                    ) : otherFiles.files.length > 0 ? (
                      <View style={styles.freightPicturesWrap}>
                        {otherFiles.files.map((f) => (
                          <FilePreviewCard
                            key={`other-${f.id}`}
                            fileUrl={f.url}
                            fileName={f.name}
                            isSender={false}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.documentsHint}>File links not found</Text>
                    )}
                  </View>
                ) : null}

                {dispatchMessage.mediaId != null ? (
                  <View style={styles.loadInfoSection}>
                    <Text style={styles.loadInfoSectionTitle}>Dispatch message</Text>
                    {dispatchMessage.isPending ? (
                      <Text style={styles.documentsHint}>Loading…</Text>
                    ) : dispatchMessage.isError ? (
                      <Text style={styles.documentsHint}>Could not load file</Text>
                    ) : dispatchMessage.fileUrl ? (
                      <View style={styles.documentPreviewWrap}>
                        <FilePreviewCard
                          fileUrl={dispatchMessage.fileUrl}
                          fileName={dispatchMessage.fileName}
                          isSender={false}
                        />
                      </View>
                    ) : (
                      <Text style={styles.documentsHint}>File link not found</Text>
                    )}
                  </View>
                ) : null}
              </>
            ) : contentTab === 'billing' ? (
              <View style={styles.loadInfoSection}>
                <Text style={styles.loadInfoSectionTitle}>Billing</Text>

                <View style={styles.loadInfoRow}>
                  <Text style={styles.loadInfoLabel}>Factoring status</Text>
                  <Text style={styles.loadInfoValue} numberOfLines={2}>
                    {factoringStatusDisplay || factoringStatusRaw || '—'}
                  </Text>
                </View>

                <View style={styles.loadInfoRow}>
                  <Text style={styles.loadInfoLabel}>Invoiced proof</Text>
                  <Text style={styles.loadInfoValue} numberOfLines={2}>
                    {invoicedProofUi}
                  </Text>
                </View>
              </View>
            ) : contentTab === 'accounting' ? (
              <View style={styles.loadInfoSection}>
                <Text style={styles.loadInfoSectionTitle}>Accounting</Text>

                <View style={styles.loadInfoRow}>
                  <Text style={styles.loadInfoLabel}>Driver pay statuses</Text>
                  <Text style={styles.loadInfoValue} numberOfLines={3}>
                    {driverPayStatusLabels.length > 0 ? driverPayStatusLabels.join(', ') : '—'}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={{ height: rem(12) }} />
          </ScrollView>
        </View>
      </View>

      <BottomNavigation currentRoute="/work" androidAvoidSystemNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    position: 'relative',
  },
  screenContent: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
    position: 'relative',
    paddingBottom: BOTTOM_NAV_SCROLL_PADDING,
    backgroundColor: 'rgba(247, 248, 255, 1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
    marginBottom: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    padding: rem(4),
    marginRight: rem(12),
  },
  screenTitle: {
    flex: 1,
    fontSize: fp(22),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  mainScroll: {
    flex: 1,
    minHeight: 0,
  },
  mainScrollContent: {
    paddingBottom: rem(24),
  },
  tabsStickyWrap: {
    alignSelf: 'stretch',
    backgroundColor: '#0d1a2d',
  },
  tabsGrid: {
    width: '100%',
    backgroundColor: '#0d1a2d',
  },
  tabsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: rem(10),
    paddingHorizontal: rem(4),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.blue,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  tabButtonActive: {
    backgroundColor: '#0d1a2d',
    borderTopWidth: 3,
    borderTopColor: 'rgba(0, 0, 0, 0.6)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    ...Platform.select({
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  tabText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: 'rgba(255, 255, 255, 0.7)',
  },
  tabTextActive: {
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  mapWrap: {
    height: MAP_MAX_HEIGHT,
    maxHeight: MAP_MAX_HEIGHT,
    position: 'relative',
  },
  mapStatusBadgeWrap: {
    position: 'absolute',
    top: rem(10),
    right: rem(12),
    zIndex: 5,
    maxWidth: '75%',
  },
  historyOverlay: {
    position: 'absolute',
    left: rem(12),
    top: rem(10),
    zIndex: 9,
    alignItems: 'flex-start',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(6),
    backgroundColor: colors.primary.blue,
    borderRadius: rem(8),
    paddingHorizontal: rem(12),
    paddingVertical: rem(8),
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: rem(6),
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  historyButtonText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  historyCountBadge: {
    minWidth: rem(18),
    height: rem(18),
    borderRadius: rem(9),
    paddingHorizontal: rem(5),
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCountBadgeText: {
    fontSize: fp(10),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  historyPanel: {
    position: 'absolute',
    left: rem(104),
    top: 0,
    width: rem(268),
    maxHeight: MAP_MAX_HEIGHT * 0.82,
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    paddingTop: rem(12),
    paddingHorizontal: rem(10),
    paddingBottom: rem(8),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: rem(10),
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  historyCloseButton: {
    position: 'absolute',
    top: rem(5),
    right: rem(6),
    width: rem(24),
    height: rem(24),
    borderRadius: rem(12),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  historyCloseText: {
    fontSize: fp(20),
    lineHeight: fp(22),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
  },
  historyPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
    marginBottom: rem(8),
    paddingRight: rem(20),
  },
  historyPanelTitle: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  historyPanelCountBadge: {
    borderRadius: rem(999),
    paddingHorizontal: rem(8),
    paddingVertical: rem(2),
    backgroundColor: '#F3F4F6',
  },
  historyPanelCountText: {
    fontSize: fp(10),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
  },
  historyList: {
    maxHeight: MAP_MAX_HEIGHT * 0.68,
  },
  historyListContent: {
    paddingBottom: rem(4),
    gap: rem(8),
  },
  historyItemCard: {
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: rem(8),
    backgroundColor: '#F9FAFB',
    padding: rem(10),
  },
  historyItemCardSelected: {
    borderColor: colors.primary.blue,
    backgroundColor: '#EFF6FF',
  },
  historyItemStep: {
    fontSize: fp(11),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(4),
  },
  historyItemLine: {
    fontSize: fp(10),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
    marginTop: rem(2),
  },
  historyItemLabel: {
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
  },
  historyEmptyText: {
    fontSize: fp(11),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    paddingVertical: rem(8),
  },
  driverInfoOverlay: {
    position: 'absolute',
    left: rem(12),
    bottom: rem(10),
    zIndex: 8,
    alignItems: 'flex-start',
  },
  driverInfoButton: {
    backgroundColor: colors.primary.blue,
    borderRadius: rem(8),
    paddingHorizontal: rem(12),
    paddingVertical: rem(8),
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: rem(6),
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  driverInfoButtonText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  driverInfoCard: {
    position: 'absolute',
    left: rem(104),
    bottom: 0,
    width: rem(250),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(12),
    paddingTop: rem(14),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: rem(10),
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  driverInfoCloseButton: {
    position: 'absolute',
    top: rem(5),
    right: rem(7),
    width: rem(24),
    height: rem(24),
    borderRadius: rem(12),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  driverInfoCloseText: {
    fontSize: fp(20),
    lineHeight: fp(22),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
  },
  driverInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(10),
    marginBottom: rem(10),
  },
  driverAvatar: {
    width: rem(42),
    height: rem(42),
    borderRadius: rem(21),
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverAvatarImage: {
    width: '100%',
    height: '100%',
  },
  driverAvatarText: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
  },
  driverHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  driverNameText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  driverSubText: {
    marginTop: rem(2),
    fontSize: fp(10),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  driverInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8),
  },
  driverInfoCell: {
    width: '48%',
    minWidth: 0,
  },
  driverInfoCellWide: {
    width: '100%',
  },
  driverInfoLabel: {
    fontSize: fp(9),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  driverInfoValue: {
    marginTop: rem(1),
    fontSize: fp(11),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  driverInfoLinkValue: {
    color: colors.primary.blue,
    textDecorationLine: 'underline',
  },
  openLoadChatButton: {
    width: '48%',
    marginTop: rem(1),
    borderRadius: rem(8),
    backgroundColor: colors.primary.blue,
    paddingHorizontal: rem(10),
    paddingVertical: rem(7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  openLoadChatButtonDisabled: {
    opacity: 0.65,
  },
  openLoadChatButtonText: {
    fontSize: fp(10),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  loadId: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  loadMetaRow: {
    marginTop: rem(12),
    marginHorizontal: rem(20),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rem(10),
  },
  statusBadge: {
    paddingHorizontal: rem(12),
    paddingVertical: rem(6),
    borderRadius: rem(999),
    maxWidth: '100%',
  },
  statusBadgeText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
  },
  routeSection: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  routeSectionTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  milesCard: {
    marginTop: rem(12),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    paddingVertical: rem(12),
    paddingHorizontal: rem(12),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  milesCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rem(2),
  },
  milesDivider: {
    width: 1,
    backgroundColor: colors.neutral.lightGrey,
  },
  milesLabel: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
    marginBottom: rem(6),
    textAlign: 'center',
  },
  milesValue: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    textAlign: 'center',
  },
  routeStopCard: {
    paddingVertical: rem(4),
  },
  routeStopDivider: {
    paddingBottom: rem(12),
    marginBottom: rem(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
  },
  routeStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: rem(8),
  },
  routePointDot: {
    width: rem(8),
    height: rem(8),
    borderRadius: rem(999),
    marginRight: rem(6),
    flexShrink: 0,
  },
  routeStopTitle: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    flexShrink: 1,
  },
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rem(12),
  },
  routeStopAddressWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: rem(4),
  },
  routeStopAddress: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
    textDecorationLine: 'underline',
  },
  routeStopTime: {
    flexShrink: 0,
    maxWidth: '42%',
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    textAlign: 'right',
  },
  contactsSection: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  contactsSectionTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  contactsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(12),
    paddingVertical: rem(8),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
  },
  contactsLabel: {
    width: '28%',
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  contactsValueWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  contactsValue: {
    flex: 1,
    minWidth: 0,
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
    textAlign: 'right',
  },
  contactsLink: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
    textDecorationLine: 'underline',
    textAlign: 'right',
  },
  additionalContactsSection: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  additionalContactsSectionTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  additionalContactBlock: {
    paddingVertical: rem(8),
    paddingHorizontal: rem(12),
    borderRadius: rem(12),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    backgroundColor: '#F9FAFB',
  },
  additionalContactGap: {
    marginBottom: rem(10),
  },
  additionalContactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(12),
    paddingVertical: rem(6),
  },
  additionalContactLabel: {
    width: '28%',
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  additionalContactValue: {
    flex: 1,
    minWidth: 0,
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
    textAlign: 'right',
  },
  loadInfoSection: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  loadInfoSectionTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  loadInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(12),
    paddingVertical: rem(8),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
  },
  loadInfoLabel: {
    width: '38%',
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  loadInfoValue: {
    flex: 1,
    minWidth: 0,
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
    textAlign: 'right',
  },
  /** Same as CreateOfferSheet `specChipOn` + `specChipTextOn` (selected special requirements). */
  instructionsChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8),
  },
  instructionChip: {
    paddingHorizontal: rem(12),
    paddingVertical: rem(7),
    borderRadius: rem(8),
    backgroundColor: colors.primary.blue,
  },
  instructionChipText: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  cargoNotesRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: rem(6),
  },
  cargoNotesLabel: {
    width: '100%',
  },
  cargoNotesValue: {
    width: '100%',
    textAlign: 'left',
  },
  documentsHint: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  documentPreviewWrap: {
    alignSelf: 'flex-start',
  },
  freightPicturesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(12),
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    zIndex: 10,
  },
  loadingText: {
    marginTop: rem(8),
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
});

