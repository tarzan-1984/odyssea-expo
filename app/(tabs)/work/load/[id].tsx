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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, rem, fp } from '@/lib';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import ArrowLeft from '@/icons/ArrowLeft';
import OSMMapView, { type Region, type OSMMapViewRef } from '@/components/maps/OSMMapView';
import { useLoadRoute } from '@/hooks/useLoadRoute';
import { useUserByExternalId } from '@/hooks/useUserByExternalId';
import type { TmsLoadLocationPoint, YourLoadItem } from '@/app-api/loads';
import { labelForDriverLoadStatus } from '@/constants/driverLoadStatuses';
import { CREATE_OFFER_SPECIAL_REQUIREMENTS } from '@/constants/driversListConstants';
import { useQuery } from '@tanstack/react-query';
import FilePreviewCard from '@/components/FilePreviewCard';

const MAP_MAX_HEIGHT = Dimensions.get('window').height * 0.25;
const ROUTE_POINT_FOCUS_DELTA = 1.2;
const ROUTE_POINT_COLORS = {
  initialPickup: '#1D4ED8',
  intermediatePickup: '#60A5FA',
  finalDelivery: '#15803D',
  intermediateDelivery: '#4ADE80',
} as const;

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

function canOpenUrl(url: string): boolean {
  return !!url && typeof url === 'string';
}

export default function LoadDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<OSMMapViewRef | null>(null);
  const { authState } = useAuth();
  const { id, loadJson } = useLocalSearchParams<{ id?: string; loadJson?: string }>();
  const [contentTab, setContentTab] = useState<
    'customer' | 'load' | 'trip' | 'documents' | 'billing' | 'accounting'
  >('customer');

  const canAccess = canAccessWorkTab(authState.user?.role);
  const role = (authState.user?.role ?? '').trim().toUpperCase();
  const showDriversTab = canAccessDriversAndOffers(role);
  const isAdministrator = role === 'ADMINISTRATOR';

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

  const locations = useMemo(() => {
    const fromStops = routePoints
      .map((p) => String(p.address ?? p.short_address ?? '').trim())
      .filter(Boolean);
    // Backward-compatible fallback: older cached loads may not include stop arrays.
    const fallback = load
      ? [load.from_short_address, load.to_short_address]
          .map((v) => String(v ?? '').trim())
          .filter(Boolean)
      : [];
    return fromStops.length > 0 ? fromStops : fallback;
  }, [routePoints, load]);

  const { data: routeData, isLoading: routeLoading } = useLoadRoute(
    locations.length > 0 ? locations : undefined
  );

  // Removed debug logging for route data

  const markers = (routeData?.markers ?? []).map((p, i) => ({
    coordinate: { latitude: p.latitude, longitude: p.longitude },
    markerColor: getRoutePointColor(routePoints, i),
    tooltipType:
      routePoints[i]?.type === 'pick_up_location'
        ? 'Pick up'
        : routePoints[i]?.type === 'delivery_location'
          ? 'Delivery'
          : '',
    tooltipAddress: String(routePoints[i]?.address ?? routePoints[i]?.short_address ?? '').trim(),
    tooltipTime: formatStopTime(routePoints[i] as TmsLoadLocationPoint),
  }));
  const polylineCoordinates = routeData?.polyline ?? undefined;
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
  const bookedRateRaw = cleanText(meta.booked_rate);
  const loadTypeRaw = cleanText(meta.load_type);
  const bookedRateDisplay = useMemo(
    () => formatMoneyFromString(bookedRateRaw),
    [bookedRateRaw],
  );
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
  const cargoNotes = cleanText(meta.notes);
  const allMilesRaw = cleanText(meta.all_miles);
  const allEmptyMilesRaw = cleanText(meta.all_empty_miles);
  const loadedMilesUi = allMilesRaw || '—';
  const emptyMilesUi = allEmptyMilesRaw || '—';

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
    const marker = routeData?.markers?.[pointIndex];
    if (!marker || !mapRef.current) return;

    mapRef.current.animateToRegion({
      latitude: marker.latitude,
      longitude: marker.longitude,
      latitudeDelta: ROUTE_POINT_FOCUS_DELTA,
      longitudeDelta: ROUTE_POINT_FOCUS_DELTA,
    });
  };

  useEffect(() => {
    if (!routeData?.bounds || !mapRef.current) return;
    const b = routeData.bounds;
    const pad = 0.15;
    mapRef.current.animateToRegion({
      latitude: (b.minLat + b.maxLat) / 2,
      longitude: (b.minLng + b.maxLng) / 2,
      latitudeDelta: b.maxLat - b.minLat + pad,
      longitudeDelta: b.maxLng - b.minLng + pad,
    });
  }, [routeData?.bounds]);

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

          {!isAdministrator ? (
            <View style={styles.tabsGrid}>
              {(
                [
                  { key: 'customer', label: 'Customer' },
                  { key: 'load', label: 'Load' },
                  { key: 'trip', label: 'Trip' },
                  { key: 'documents', label: 'Documents' },
                  { key: 'billing', label: 'Billing' },
                  { key: 'accounting', label: 'Accounting' },
                ] as const
              ).map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.tabButton2Col,
                    contentTab === t.key && styles.tabButtonActive2Col,
                  ]}
                  onPress={() => setContentTab(t.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabText, contentTab === t.key && styles.tabTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.mainScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={Platform.OS === 'android'}
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
              <OSMMapView
                ref={mapRef}
                initialRegion={DEFAULT_REGION}
                markers={markers as any}
                polylineCoordinates={polylineCoordinates}
                style={StyleSheet.absoluteFill}
              />
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
                            activeOpacity={routeData?.markers?.[idx] ? 0.7 : 1}
                            disabled={!routeData?.markers?.[idx]}
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

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Booked rate</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {bookedRateDisplay || '—'}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Load type</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {loadTypeDisplay || '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.loadInfoSection}>
                  <Text style={styles.loadInfoSectionTitle}>Dispatcher</Text>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Date Booked</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {dateBookedDisplay || '—'}
                    </Text>
                  </View>

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Source</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {sourceDisplay || sourceRaw || '—'}
                    </Text>
                  </View>

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

                  <View style={styles.loadInfoRow}>
                    <Text style={styles.loadInfoLabel}>Profit</Text>
                    <Text style={styles.loadInfoValue} numberOfLines={2}>
                      {profitDisplay || '—'}
                    </Text>
                  </View>
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
                      {cargoWeight || '—'}
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
    paddingBottom: 70,
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
  tabsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    backgroundColor: '#0d1a2d',
  },
  tabButton2Col: {
    width: '33.3333%',
    paddingVertical: rem(10),
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
  tabButtonActive2Col: {
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

