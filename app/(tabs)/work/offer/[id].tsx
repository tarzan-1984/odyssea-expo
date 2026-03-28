import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { colors, fonts, rem, fp, typography } from '@/lib';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import ArrowLeft from '@/icons/ArrowLeft';
import OSMMapView, { type Region, type OSMMapViewRef } from '@/components/maps/OSMMapView';
import { useOfferRoute } from '@/hooks/useOfferRoute';
import {
  type OfferDriver,
  OfferRow,
  deactivateOffer,
  extendDriverTimeForOfferDriver,
  getOfferById,
  removeDriverFromOfferDriver,
  returnDriverToOffer,
  routeSummary,
  selectDriverForOffer,
  setDriverRateForOfferDriver,
} from '@/app-api/offers';
import PhoneAppStatusActiveIcon from '@/icons/PhoneAppStatusActiveIcon';
import PhoneAppStatusInactiveIcon from '@/icons/PhoneAppStatusInactiveIcon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DRIVER_PARTICIPATION_COUNT_QUERY_KEY } from '@/hooks/useDriverParticipationCount';
import CreateRateModal from '@/components/offers/CreateRateModal';
import ExtendTimeModal from '@/components/offers/ExtendTimeModal';
import { RectButton } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';

const MAP_MAX_HEIGHT = Dimensions.get('window').height * 0.25;
const ROUTE_POINT_FOCUS_DELTA = 1.2;
const ROUTE_POINT_COLORS = {
  initialPickup: '#1D4ED8',
  intermediatePickup: '#60A5FA',
  finalDelivery: '#15803D',
  intermediateDelivery: '#4ADE80',
} as const;

function parseSpecialRequirements(sr: unknown): string[] {
  if (!sr) return [];
  if (Array.isArray(sr)) return sr.map((v) => String(v).trim()).filter(Boolean);
  const s = String(sr).trim();
  return s ? [s] : [];
}

function hasHazmatRequirement(sr: unknown): boolean {
  if (!sr) return false;
  if (Array.isArray(sr)) {
    return sr.some((value) => String(value).trim().toLowerCase() === 'hazmat');
  }
  return String(sr).toLowerCase().includes('hazmat');
}

function getRoutePointColor(
  route: Array<{ type?: string | null }> | null | undefined,
  pointIndex: number
): string {
  const points = Array.isArray(route) ? route : [];
  const point = points[pointIndex];

  if (!point) {
    return ROUTE_POINT_COLORS.initialPickup;
  }

  if (point.type === 'pick_up_location') {
    const pickupIndexes = points.reduce<number[]>((acc, currentPoint, index) => {
      if (currentPoint?.type === 'pick_up_location') {
        acc.push(index);
      }
      return acc;
    }, []);

    return pickupIndexes[0] === pointIndex
      ? ROUTE_POINT_COLORS.initialPickup
      : ROUTE_POINT_COLORS.intermediatePickup;
  }

  if (point.type === 'delivery_location') {
    const deliveryIndexes = points.reduce<number[]>((acc, currentPoint, index) => {
      if (currentPoint?.type === 'delivery_location') {
        acc.push(index);
      }
      return acc;
    }, []);

    return deliveryIndexes[deliveryIndexes.length - 1] === pointIndex
      ? ROUTE_POINT_COLORS.finalDelivery
      : ROUTE_POINT_COLORS.intermediateDelivery;
  }

  return ROUTE_POINT_COLORS.initialPickup;
}

function formatSpecialRequirementLabel(value: string): string {
  return String(value)
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function hasDriverRate(rate: number | null | undefined): boolean {
  return rate != null && String(rate).trim() !== '';
}

function getCurrentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeUnixSeconds(value: unknown): number | null {
  if (value == null || value === '') return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.floor(parsed);
}

function getRemainingSeconds(actionTimeUnix: number | null | undefined): number {
  const normalizedActionTimeUnix = normalizeUnixSeconds(actionTimeUnix);
  if (normalizedActionTimeUnix == null) return 0;

  return Math.max(0, Math.floor(normalizedActionTimeUnix - getCurrentUnixSeconds()));
}

function getFutureUnixSeconds(minutesToAdd: number): number {
  return getCurrentUnixSeconds() + minutesToAdd * 60;
}

function getExtendedUnixSeconds(
  currentActionTimeUnix: number | null | undefined,
  minutesToAdd: number
): number {
  const normalizedCurrentActionTimeUnix = normalizeUnixSeconds(currentActionTimeUnix);
  const baseUnixSeconds = Math.max(
    getCurrentUnixSeconds(),
    normalizedCurrentActionTimeUnix ?? 0
  );

  return baseUnixSeconds + minutesToAdd * 60;
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatRateLabel(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '';

  return `$${Number(rate).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;
}

const DEFAULT_REGION: Region = {
  latitude: 39.0,
  longitude: -95.0,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

/**
 * Offer detail screen - map with route from offer addresses
 */
export default function OfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<OSMMapViewRef | null>(null);
  const { authState } = useAuth();
  const queryClient = useQueryClient();
  const { id, offerJson } = useLocalSearchParams<{ id?: string; offerJson?: string }>();
  const canAccess = canAccessWorkTab(authState.user?.role);
  const role = (authState.user?.role ?? '').trim().toUpperCase();
  const isDriver = role === 'DRIVER';
  const isStaffOrAdmin = canAccessDriversAndOffers(role);

  useEffect(() => {
    if (authState.isAuthenticated && !canAccess) {
      router.replace('/final-verify');
    }
  }, [authState.isAuthenticated, canAccess, router]);
  const driverExternalId = (authState.user?.externalId ?? '').trim();
  const [createRateModalVisible, setCreateRateModalVisible] = useState(false);
  const [isSubmittingRate, setIsSubmittingRate] = useState(false);
  const [extendTimeModalVisible, setExtendTimeModalVisible] = useState(false);
  const [isSubmittingExtendTime, setIsSubmittingExtendTime] = useState(false);
  const [isDecliningOffer, setIsDecliningOffer] = useState(false);
  const [isDeactivatingOffer, setIsDeactivatingOffer] = useState(false);
  const [driverActionKey, setDriverActionKey] = useState<string | null>(null);

  const initialOffer = useMemo(() => {
    if (!offerJson) return null;

    try {
      return JSON.parse(offerJson) as OfferRow;
    } catch {
      return null;
    }
  }, [offerJson]);

  const offerId = Number(id ?? initialOffer?.id ?? 0);
  const { data: liveOffer, isFetched: isOfferFetched } = useQuery({
    queryKey: ['offer-detail', offerId, isDriver ? driverExternalId || 'driver' : 'all'],
    queryFn: () => getOfferById(offerId, isDriver ? driverExternalId : undefined),
    enabled: offerId > 0 && (!isDriver || !!driverExternalId),
    initialData: initialOffer ?? undefined,
  });

  const offer = liveOffer ?? initialOffer;

  const matchedOfferDriver =
    offer?.drivers?.find((driver) => {
      const externalId = (driver.externalId ?? '').trim();
      const driverId = (driver.driver_id ?? '').trim();

      return (
        (!!driverExternalId && externalId === driverExternalId) ||
        (!!driverExternalId && driverId === driverExternalId)
      );
    }) ?? null;

  const offerDriver = isDriver
    ? matchedOfferDriver
    : matchedOfferDriver ?? offer?.drivers?.[0] ?? null;
  const isDriverRemovedFromOffer = Boolean(
    isDriver && isOfferFetched && (!offerDriver || offerDriver.active === false)
  );
  const canDeclineOffer = Boolean(
    isDriver &&
      offer &&
      driverExternalId &&
      !isDriverRemovedFromOffer &&
      offer.active !== false &&
      offerDriver?.active !== false
  );
  const isSelectedOfferDriver = Boolean(isDriver && offerDriver?.is_selected);

  const [driverRate, setDriverRate] = useState<number | null>(offerDriver?.rate ?? null);
  const [driverActionTime, setDriverActionTime] = useState<number | null>(
    normalizeUnixSeconds(offerDriver?.action_time)
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(normalizeUnixSeconds(offerDriver?.action_time))
  );

  useEffect(() => {
    setDriverRate(offerDriver?.rate ?? null);
    setDriverActionTime(normalizeUnixSeconds(offerDriver?.action_time));
  }, [offer?.id, offerDriver?.rate, offerDriver?.action_time]);

  useEffect(() => {
    if (!isDriverRemovedFromOffer) return;

    router.replace('/work');
  }, [isDriverRemovedFromOffer, router]);

  const hasSubmittedRate = hasDriverRate(driverRate);
  const isBidExpired = hasSubmittedRate && remainingSeconds <= 0;

  useEffect(() => {
    if (!hasSubmittedRate) {
      setRemainingSeconds(0);
      return;
    }

    const syncCountdown = () => {
      setRemainingSeconds(getRemainingSeconds(driverActionTime));
    };

    syncCountdown();
    const intervalId = setInterval(syncCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [hasSubmittedRate, driverActionTime]);

  // Tick for driver bid timers in staff Drivers section
  const [driverTimerTick, setDriverTimerTick] = useState(0);
  useEffect(() => {
    if (!isStaffOrAdmin || !offer?.drivers?.length) return;
    const id = setInterval(() => setDriverTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStaffOrAdmin, offer?.id, offer?.drivers?.length]);

  const locations = (offer?.route ?? [])
    .map((p) => (p.location || '').trim())
    .filter(Boolean);
  const { data: routeData, isLoading: routeLoading } = useOfferRoute(
    locations.length > 0 ? locations : undefined
  );
  const showHazmatBanner = hasHazmatRequirement(offer?.special_requirements);

  const headerTitle = offer ? (routeSummary(offer.route) || '—') : 'Offer';

  const routePoints = offer?.route ?? [];
  const markers = (routeData?.markers ?? []).map((p, i) => ({
    coordinate: { latitude: p.latitude, longitude: p.longitude },
    markerColor: getRoutePointColor(routePoints, i),
    tooltipType:
      routePoints[i]?.type === 'pick_up_location'
        ? 'Pick up'
        : routePoints[i]?.type === 'delivery_location'
          ? 'Delivery'
          : '',
    tooltipAddress: routePoints[i]?.location ?? '',
    tooltipTime: routePoints[i]?.time ?? '',
  }));
  const polylineCoordinates = routeData?.polyline ?? undefined;

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
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
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

          {!offer ? (
            <View style={styles.placeholder}>
              <Text style={styles.errorText}>Offer not found</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.mainScroll}
              contentContainerStyle={styles.mainScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.mapWrap}>
                {routeLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color={colors.primary.blue} />
                    <Text style={styles.loadingText}>Loading route…</Text>
                  </View>
                ) : null}
                <OSMMapView
                  ref={mapRef}
                  initialRegion={DEFAULT_REGION}
                  markers={markers}
                  polylineCoordinates={polylineCoordinates}
                  style={StyleSheet.absoluteFill}
                />
              </View>

              {isStaffOrAdmin && offer?.active !== false ? (
                <TouchableOpacity
                  style={[
                    styles.deactivateOfferButton,
                    isDeactivatingOffer && styles.deactivateOfferButtonDisabled,
                  ]}
                  onPress={() => {
                    Alert.alert(
                      'Deactivate offer',
                      'Are you sure you want to deactivate this offer?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Deactivate',
                          style: 'destructive',
                          onPress: async () => {
                            if (!offer) return;
                            try {
                              setIsDeactivatingOffer(true);
                              await deactivateOffer(offer.id);
                              await queryClient.invalidateQueries({ queryKey: ['offers'] });
                              await queryClient.invalidateQueries({
                                queryKey: ['offer-detail', offer.id],
                              });
                              router.replace('/work');
                            } catch (err) {
                              console.error('[OfferDetailScreen] Failed to deactivate offer', err);
                              Alert.alert('Error', 'Failed to deactivate offer. Please try again.');
                            } finally {
                              setIsDeactivatingOffer(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                  activeOpacity={0.7}
                  disabled={isDeactivatingOffer}
                >
                  <Text style={styles.deactivateOfferButtonText}>Deactivate offer</Text>
                  <Image
                    source={require('@/icons/deactivate_offer.png')}
                    style={styles.deactivateOfferIcon}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              ) : !isSelectedOfferDriver && isDriver ? (
                <TouchableOpacity
                  style={[
                    styles.createRateButton,
                    hasSubmittedRate && styles.createRateButtonDisabled,
                    isBidExpired && styles.createRateButtonExpired,
                  ]}
                  onPress={() => setCreateRateModalVisible(true)}
                  activeOpacity={hasSubmittedRate ? 1 : 0.7}
                  disabled={hasSubmittedRate}
                >
                  <Text
                    style={[
                      styles.createRateButtonText,
                      hasSubmittedRate && !isBidExpired && styles.createRateTimerText,
                    ]}
                  >
                    {hasSubmittedRate
                      ? isBidExpired
                        ? 'BID TIME EXPIRED'
                        : formatCountdown(remainingSeconds)
                      : 'CREATE RATE'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showHazmatBanner ? (
                <View style={styles.hazmatBanner}>
                  <Image
                    source={require('@/icons/hazmat.png')}
                    style={styles.hazmatBannerIcon}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.hazmatBannerContent}>
                    <Text style={styles.hazmatBannerTitle}>Hazmat Load</Text>
                    <Text style={styles.hazmatBannerText}>
                      This offer includes hazardous material and requires special handling.
                    </Text>
                  </View>
                </View>
              ) : null}

              {canDeclineOffer ? (
                <TouchableOpacity
                  style={[styles.declineOfferButton, isDecliningOffer && styles.declineOfferButtonDisabled]}
                  activeOpacity={0.75}
                  disabled={isDecliningOffer}
                  onPress={() => {
                    Alert.alert(
                      'Decline offer',
                      'Are you sure you want to decline this offer?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Decline',
                          style: 'destructive',
                          onPress: async () => {
                            if (!offer || !driverExternalId) return;

                            try {
                              setIsDecliningOffer(true);
                              await removeDriverFromOfferDriver(offer.id, driverExternalId);
                              await queryClient.invalidateQueries({ queryKey: ['offers'] });
                              await queryClient.invalidateQueries({
                                queryKey: ['offer-detail', offer.id],
                              });
                              await queryClient.invalidateQueries({
                                queryKey: DRIVER_PARTICIPATION_COUNT_QUERY_KEY,
                              });
                              router.replace('/work');
                            } catch (declineError) {
                              console.error('[OfferDetailScreen] Failed to decline offer', declineError);
                              Alert.alert('Error', 'Failed to decline offer. Please try again.');
                            } finally {
                              setIsDecliningOffer(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.declineOfferButtonText}>
                    {isDecliningOffer ? 'Declining…' : 'Decline Offer'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {isDriver && hasSubmittedRate && !isSelectedOfferDriver ? (
                <View style={styles.rateInfoWrap}>
                  <Text style={styles.rateInfoText}>
                    Your rate for this offer:{' '}
                    <Text style={styles.rateInfoValue}>{formatRateLabel(driverRate)}</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.extendTimeButton}
                    onPress={() => setExtendTimeModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.extendTimeButtonText}>Extend Bid Time</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {isStaffOrAdmin && offer?.drivers && offer.drivers.length > 0 && (
                <View style={styles.driversTable}>
                  <View style={styles.driversTableTitleRow}>
                    <Text style={styles.driversTableTitle}>Drivers</Text>
                    {!offer.is_driver_selected && !offer.drivers?.some((d) => d.is_selected) ? (
                      <View style={styles.driversSwipeHint}>
                        <Text style={[styles.driversSwipeHintChevron, { color: colors.semantic.error }]}>
                          {'<'}
                        </Text>
                        <Text style={styles.driversSwipeHintText}>Swipe</Text>
                        <Text style={[styles.driversSwipeHintChevron, { color: colors.semantic.success }]}>
                          {'>'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.driversTableHeaderRow}>
                    <Text style={[styles.driversTableHeader, styles.driversTableHeaderUnit]}>Unit</Text>
                    <Text style={[styles.driversTableHeader, styles.driversTableHeaderRate]}>Rate</Text>
                    <Text style={[styles.driversTableHeader, styles.driversTableHeaderTimer]}>Bid timer</Text>
                  </View>
                  {offer.drivers.map((driver: OfferDriver, driverIdx: number) => {
                    const actionTimeUnix = normalizeUnixSeconds(driver.action_time);
                    const driverRemainingSeconds =
                      actionTimeUnix != null
                        ? Math.max(0, actionTimeUnix - getCurrentUnixSeconds())
                        : 0;
                    const driverKey = driver.externalId ?? driver.driver_id ?? String(driverIdx);
                    const isActioningDriver = driverActionKey === `${offer.id}-${driverKey}`;
                    const hasAcceptedDriver = offer.is_driver_selected || offer.drivers?.some((d) => d.is_selected);
                    const isRemovedDriver = driver.active === false;
                    const canSwipeDriver =
                      !hasAcceptedDriver &&
                      (isRemovedDriver || (!driver.is_selected && !isRemovedDriver));
                    const canAssignDriver = !hasAcceptedDriver && !isRemovedDriver && !driver.is_selected;
                    const canReturnDriver = !hasAcceptedDriver && isRemovedDriver;

                    const rowContent = (
                      <View
                        style={[
                          styles.driversTableDataRow,
                          driver.is_selected && styles.driversTableDataRowSelected,
                          isRemovedDriver && styles.driversTableDataRowRemoved,
                        ]}
                      >
                        <View style={styles.driversTableUnitCell}>
                          <View style={styles.driversTableStatusIcon}>
                            {driver.status?.toUpperCase() === 'ACTIVE' ? (
                              <PhoneAppStatusActiveIcon width={18} height={24} />
                            ) : (
                              <PhoneAppStatusInactiveIcon width={18} height={24} />
                            )}
                          </View>
                          <Text style={styles.driversTableDriverName} numberOfLines={1}>
                            {driver.externalId != null ? `(${driver.externalId}) ` : ''}
                            {[driver.firstName, driver.lastName].filter(Boolean).join(' ') || '—'}
                          </Text>
                        </View>
                        <Text style={styles.driversTableRate}>
                          {driver.rate != null
                            ? `$${Number(driver.rate).toLocaleString('en-US')}`
                            : '—'}
                        </Text>
                        <View style={styles.driversTableTimerCell}>
                          {actionTimeUnix == null ? (
                            <Text style={styles.driversTableTimerDash}>—</Text>
                          ) : driverRemainingSeconds > 0 ? (
                            <View style={styles.driversTableTimerBadge}>
                              <Text style={styles.driversTableTimerText}>
                                {formatCountdown(driverRemainingSeconds)}
                              </Text>
                            </View>
                          ) : (
                            <Image
                              source={require('@/icons/OfferTime.png')}
                              style={styles.driversTableExpiredIcon}
                              contentFit="contain"
                            />
                          )}
                        </View>
                      </View>
                    );

                    if (!canSwipeDriver) {
                      return (
                        <View key={driverKey}>
                          {rowContent}
                        </View>
                      );
                    }

                    return (
                      <Swipeable
                        key={driverKey}
                        overshootLeft={false}
                        overshootRight={false}
                        rightThreshold={rem(70)}
                        leftThreshold={rem(70)}
                        renderLeftActions={() =>
                          canAssignDriver ? (
                            <View style={styles.driversSwipeActionWrap}>
                              <TouchableOpacity
                                style={[
                                  styles.driversSwipeActionButton,
                                  styles.driversSwipeActionButtonAssign,
                                  isActioningDriver && styles.driversSwipeActionButtonDisabled,
                                ]}
                                onPress={async () => {
                                  if (!offer || !driverKey) return;
                                  setDriverActionKey(`${offer.id}-${driverKey}`);
                                  try {
                                    await selectDriverForOffer(offer.id, driverKey);
                                    await queryClient.invalidateQueries({ queryKey: ['offers'] });
                                    await queryClient.invalidateQueries({
                                      queryKey: ['offer-detail', offer.id],
                                    });
                                  } catch (err) {
                                    console.error('[OfferDetailScreen] Failed to assign driver', err);
                                    Alert.alert('Error', 'Failed to assign driver. Please try again.');
                                  } finally {
                                    setDriverActionKey(null);
                                  }
                                }}
                                activeOpacity={0.8}
                                disabled={isActioningDriver}
                              >
                                <Text style={styles.driversSwipeActionText}>Assign</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={{ width: 0 }} />
                          )
                        }
                        renderRightActions={() =>
                          isRemovedDriver ? (
                            <View style={styles.driversSwipeActionWrap}>
                              <RectButton
                                style={[
                                  styles.driversSwipeActionButton,
                                  styles.driversSwipeActionButtonAssign,
                                  isActioningDriver && styles.driversSwipeActionButtonDisabled,
                                ]}
                                onPress={async () => {
                                  if (!offer || !driverKey) return;
                                  setDriverActionKey(`${offer.id}-${driverKey}`);
                                  try {
                                    await returnDriverToOffer(offer.id, driverKey);
                                    await queryClient.invalidateQueries({ queryKey: ['offers'] });
                                    await queryClient.invalidateQueries({
                                      queryKey: ['offer-detail', offer.id],
                                    });
                                  } catch (err) {
                                    console.error('[OfferDetailScreen] Failed to return driver', err);
                                    Alert.alert('Error', 'Failed to return driver. Please try again.');
                                  } finally {
                                    setDriverActionKey(null);
                                  }
                                }}
                                enabled={!isActioningDriver}
                              >
                                <Text style={styles.driversSwipeActionText}>Return</Text>
                              </RectButton>
                            </View>
                          ) : (
                          <View style={styles.driversSwipeActionWrap}>
                            <RectButton
                              style={[
                                styles.driversSwipeActionButton,
                                styles.driversSwipeActionButtonDelete,
                                isActioningDriver && styles.driversSwipeActionButtonDisabled,
                              ]}
                              onPress={async () => {
                                if (!offer || !driverKey) return;
                                Alert.alert(
                                  'Remove driver',
                                  'Are you sure you want to remove this driver from the offer?',
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        setDriverActionKey(`${offer.id}-${driverKey}`);
                                        try {
                                          await removeDriverFromOfferDriver(offer.id, driverKey);
                                          await queryClient.invalidateQueries({ queryKey: ['offers'] });
                                          await queryClient.invalidateQueries({
                                            queryKey: ['offer-detail', offer.id],
                                          });
                                        } catch (err) {
                                          console.error('[OfferDetailScreen] Failed to remove driver', err);
                                          Alert.alert('Error', 'Failed to remove driver. Please try again.');
                                        } finally {
                                          setDriverActionKey(null);
                                        }
                                      },
                                    },
                                  ]
                                );
                              }}
                              enabled={!isActioningDriver}
                            >
                              <Text style={styles.driversSwipeActionText}>Delete</Text>
                            </RectButton>
                          </View>
                          )
                        }
                      >
                        {rowContent}
                      </Swipeable>
                    );
                  })}
                </View>
              )}

              {offer.route && offer.route.length > 0 && (
                <View style={styles.routeTable}>
                  <Text style={styles.routeTableTitle}>Route</Text>
                  <View style={styles.routeTableHeaderRow}>
                    <Text style={[styles.routeTableHeader, styles.routeTableHeaderAction]}>Action</Text>
                    <Text style={[styles.routeTableHeader, styles.routeTableHeaderAddress]}>Address</Text>
                    <Text style={[styles.routeTableHeader, styles.routeTableHeaderTime]}>Time</Text>
                  </View>
                  {offer.route.map((point, idx) => (
                    <View key={idx} style={styles.routeTableDataRow}>
                      <View style={styles.routeTableActionWrap}>
                        <View
                          style={[
                            styles.routePointDot,
                            { backgroundColor: getRoutePointColor(offer.route, idx) },
                          ]}
                        />
                        <Text style={styles.routeTableAction}>
                          {point.type === 'pick_up_location' ? 'Pick up' : 'Delivery'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.routeTableAddressButton}
                        activeOpacity={routeData?.markers?.[idx] ? 0.7 : 1}
                        disabled={!routeData?.markers?.[idx]}
                        onPress={() => focusRoutePointOnMap(idx)}
                      >
                        <Text style={styles.routeTableAddress} numberOfLines={2}>
                          {point.location || '—'}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.routeTableTime}>
                        {point.time || '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {isDriver && (
                <View style={styles.distanceTable}>
                  <Text style={styles.distanceTableTitle}>Distance</Text>
                  <View style={styles.distanceTableHeaderRow}>
                    <Text style={styles.distanceTableHeader}>Empty miles</Text>
                    <Text style={styles.distanceTableHeader}>Loaded miles</Text>
                    <Text style={styles.distanceTableHeader}>Total miles</Text>
                  </View>
                  <View style={styles.distanceTableDataRow}>
                    <Text style={styles.distanceTableValue}>
                      {offerDriver?.empty_miles != null ? offerDriver.empty_miles : '—'}
                    </Text>
                    <Text style={styles.distanceTableValue}>
                      {offer.loaded_miles != null ? offer.loaded_miles : '—'}
                    </Text>
                    <Text style={[styles.distanceTableValue, styles.distanceTableValueBold]}>
                      {offerDriver?.total_miles != null ? offerDriver.total_miles : '—'}
                    </Text>
                  </View>
                </View>
              )}

              {(offer.commodity && String(offer.commodity).trim()) || offer.weight != null ? (
                <View style={styles.infoBlock}>
                  <View style={styles.infoBlockRow}>
                    <View style={styles.infoBlockHalf}>
                      <Text style={styles.infoBlockTitle}>Commodity</Text>
                      <Text style={styles.infoBlockText}>
                        {offer.commodity && String(offer.commodity).trim() ? String(offer.commodity).trim() : '—'}
                      </Text>
                    </View>
                    <View style={styles.infoBlockWeight}>
                      <Text style={styles.infoBlockTitle}>Weight</Text>
                      <Text style={styles.infoBlockText}>
                        {offer.weight != null ? String(offer.weight) : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {offer.notes && String(offer.notes).trim() ? (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoBlockTitle}>Notes</Text>
                  <Text style={styles.infoBlockText}>{String(offer.notes).trim()}</Text>
                </View>
              ) : null}

              {(() => {
                const reqs = parseSpecialRequirements(offer.special_requirements);
                if (reqs.length === 0) return null;
                return (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoBlockTitle}>Special requirements</Text>
                    <Text style={styles.infoBlockText}>
                      {reqs.map(formatSpecialRequirementLabel).join(', ')}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
          )}
        </View>
      </View>
      <CreateRateModal
        visible={createRateModalVisible && !isSelectedOfferDriver}
        onClose={() => setCreateRateModalVisible(false)}
        isSubmitting={isSubmittingRate}
        onCreate={async (data) => {
          if (!offer || !isDriver) {
            setCreateRateModalVisible(false);
            return;
          }

          if (!driverExternalId) {
            console.warn('[OfferDetailScreen] Missing driver externalId, cannot set rate');
            return;
          }

          const rateNumber = Number(String(data.rate).replace(/,/g, '').trim());

          try {
            setIsSubmittingRate(true);
            const result = await setDriverRateForOfferDriver(offer.id, driverExternalId, {
              rate: Number.isNaN(rateNumber) ? 0 : rateNumber,
              rateTimeMinutes: data.rateTimeMinutes,
              driverEta: data.eta,
            });
            const nextActionTime = normalizeUnixSeconds(result.action_time)
              ?? getFutureUnixSeconds(data.rateTimeMinutes);
            setDriverRate(result.rate ?? (Number.isNaN(rateNumber) ? 0 : rateNumber));
            setDriverActionTime(nextActionTime);
            console.log('[OfferDetailScreen] Driver rate saved', result);
            Alert.alert('Success', 'Your rate has been submitted.');
            setCreateRateModalVisible(false);
          } catch (err) {
            console.error('[OfferDetailScreen] Failed to save driver rate', err);
            Alert.alert('Error', 'Failed to submit your rate. Please try again.');
          } finally {
            setIsSubmittingRate(false);
          }
        }}
      />
      <ExtendTimeModal
        visible={extendTimeModalVisible && !isSelectedOfferDriver}
        onClose={() => setExtendTimeModalVisible(false)}
        isSubmitting={isSubmittingExtendTime}
        onSubmit={async (data) => {
          if (!offer || !isDriver) {
            setExtendTimeModalVisible(false);
            return;
          }

          if (!driverExternalId) {
            console.warn('[OfferDetailScreen] Missing driver externalId, cannot extend action time');
            return;
          }

          try {
            setIsSubmittingExtendTime(true);
            const result = await extendDriverTimeForOfferDriver(offer.id, driverExternalId, {
              extendTimeMinutes: data.extendTimeMinutes,
            });
            const nextActionTime = normalizeUnixSeconds(result.action_time)
              ?? getExtendedUnixSeconds(driverActionTime, data.extendTimeMinutes);
            setDriverActionTime(nextActionTime);
            setDriverRate(result.rate ?? driverRate);
            console.log('[OfferDetailScreen] Driver action time extended', result);
            Alert.alert('Success', 'Your offer time has been extended.');
            setExtendTimeModalVisible(false);
          } catch (err) {
            console.error('[OfferDetailScreen] Failed to extend driver action time', err);
            Alert.alert('Error', 'Failed to extend time. Please try again.');
          } finally {
            setIsSubmittingExtendTime(false);
          }
        }}
      />
      <BottomNavigation currentRoute="/work" />
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
    marginBottom: 8,
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
    color: colors.neutral.white,
    fontFamily: fonts['700'],
    fontSize: fp(22),
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: rem(24),
  },
  mapWrap: {
    height: MAP_MAX_HEIGHT,
    maxHeight: MAP_MAX_HEIGHT,
    position: 'relative',
  },
  hazmatBanner: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    padding: rem(14),
    borderRadius: rem(14),
    borderWidth: 1,
    borderColor: '#F7B955',
    backgroundColor: '#FFF6E4',
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(12),
  },
  hazmatBannerIcon: {
    width: rem(46),
    height: rem(46),
  },
  hazmatBannerContent: {
    flex: 1,
  },
  hazmatBannerTitle: {
    fontSize: fp(15),
    fontFamily: fonts['700'],
    color: '#9A3412',
    marginBottom: rem(2),
  },
  hazmatBannerText: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: '#B45309',
    lineHeight: fp(18),
  },
  declineOfferButton: {
    marginTop: rem(14),
    marginHorizontal: rem(20),
    height: rem(46),
    borderRadius: rem(12),
    backgroundColor: colors.semantic.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deactivateOfferButton: {
    marginTop: -rem(27),
    marginHorizontal: rem(20),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(14),
    height: rem(56),
    paddingHorizontal: rem(28),
    borderRadius: rem(14),
    borderWidth: 2,
    borderColor: '#F87171',
    backgroundColor: '#FEF2F2',
    zIndex: 15,
    position: 'relative',
  },
  deactivateOfferButtonDisabled: {
    opacity: 0.7,
  },
  deactivateOfferButtonText: {
    fontSize: fp(20),
    fontFamily: fonts['600'],
    color: '#DC2626',
  },
  deactivateOfferIcon: {
    width: rem(40),
    height: rem(40),
  },
  declineOfferButtonDisabled: {
    opacity: 0.7,
  },
  declineOfferButtonText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  createRateButton: {
    ...typography.buttonGreen,
    marginTop: -rem(27),
    marginHorizontal: rem(20),
    maxWidth: '70%',
    alignSelf: 'center',
    zIndex: 15,
    position: 'relative',
  },
  createRateButtonDisabled: {
    opacity: 1,
  },
  createRateButtonExpired: {
    backgroundColor: colors.semantic.error,
  },
  createRateButtonText: {
    fontSize: fp(18),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
    letterSpacing: 0.5,
  },
  createRateTimerText: {
    fontSize: fp(27),
    fontFamily: fonts['700'],
  },
  rateInfoWrap: {
    marginTop: rem(10),
    marginBottom: rem(16),
    marginHorizontal: rem(20),
    alignItems: 'center',
  },
  rateInfoText: {
    fontSize: fp(18),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  rateInfoValue: {
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  extendTimeButton: {
    marginTop: rem(12),
    minWidth: rem(180),
    paddingHorizontal: rem(18),
    height: rem(44),
    borderRadius: rem(12),
    backgroundColor: colors.primary.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extendTimeButtonText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  routeTable: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  routeTableTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  routeTableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
    paddingBottom: rem(8),
  },
  routeTableHeader: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  routeTableHeaderAction: {
    width: '22%',
  },
  routeTableHeaderAddress: {
    flex: 1,
    paddingHorizontal: rem(8),
  },
  routeTableHeaderTime: {
    width: '22%',
  },
  routeTableDataRow: {
    flexDirection: 'row',
    paddingVertical: rem(8),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
  },
  routeTableActionWrap: {
    width: '22%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  routePointDot: {
    width: rem(8),
    height: rem(8),
    borderRadius: rem(999),
    marginRight: rem(6),
    flexShrink: 0,
  },
  routeTableAction: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  routeTableAddress: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.primary.blue,
    textDecorationLine: 'underline',
  },
  routeTableAddressButton: {
    flex: 1,
    paddingHorizontal: rem(8),
  },
  routeTableTime: {
    width: '22%',
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  driversTable: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  driversTableTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rem(12),
  },
  driversTableTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
  },
  driversSwipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(4),
  },
  driversSwipeHintChevron: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
  },
  driversSwipeHintText: {
    fontSize: fp(11),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  driversTableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
    paddingBottom: rem(8),
  },
  driversTableHeader: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  driversTableHeaderUnit: {
    flex: 1,
    minWidth: 0,
    paddingLeft: rem(8),
  },
  driversTableHeaderRate: {
    width: rem(70),
  },
  driversTableHeaderTimer: {
    width: rem(90),
  },
  driversTableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rem(16),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
    backgroundColor: colors.neutral.white,
  },
  driversTableDataRowSelected: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  driversTableDataRowRemoved: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  driversTableUnitCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: rem(8),
    paddingLeft: rem(8),
  },
  driversTableDriverName: {
    flex: 1,
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.black,
    minWidth: 0,
  },
  driversTableStatusIcon: {
    flexShrink: 0,
  },
  driversTableRate: {
    width: rem(70),
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  driversTableTimerCell: {
    width: rem(90),
    alignItems: 'center',
    justifyContent: 'center',
  },
  driversTableTimerDash: {
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  driversTableTimerBadge: {
    backgroundColor: colors.primary.blue,
    paddingHorizontal: rem(8),
    paddingVertical: rem(4),
    borderRadius: rem(20),
  },
  driversTableTimerText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  driversTableExpiredIcon: {
    width: rem(68),
    height: rem(40),
  },
  driversSwipeActionWrap: {
    width: rem(90),
    marginBottom: 1,
    justifyContent: 'center',
  },
  driversSwipeActionButton: {
    flex: 1,
    borderRadius: rem(12),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rem(12),
    minHeight: rem(56),
  },
  driversSwipeActionButtonAssign: {
    backgroundColor: colors.semantic.success,
  },
  driversSwipeActionButtonDelete: {
    backgroundColor: colors.semantic.error,
  },
  driversSwipeActionButtonDisabled: {
    opacity: 0.7,
  },
  driversSwipeActionText: {
    fontSize: fp(13),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  distanceTable: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  distanceTableTitle: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(12),
  },
  distanceTableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
    paddingBottom: rem(8),
  },
  distanceTableHeader: {
    flex: 1,
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  distanceTableDataRow: {
    flexDirection: 'row',
    paddingTop: rem(8),
  },
  distanceTableValue: {
    flex: 1,
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
    textAlign: 'center',
  },
  distanceTableValueBold: {
    fontFamily: fonts['700'],
  },
  infoBlock: {
    marginTop: rem(16),
    marginHorizontal: rem(20),
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
  },
  infoBlockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoBlockHalf: {
    flex: 1,
  },
  infoBlockWeight: {
    marginLeft: rem(16),
  },
  infoBlockTitle: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.neutral.black,
    marginBottom: rem(6),
  },
  infoBlockText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(20),
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: rem(8),
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
  },
});
