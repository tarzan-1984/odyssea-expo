import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { colors, fonts, rem, fp } from '@/lib';
import {
  OfferRow,
  findOfferDriverEntry,
  isOfferInactiveForDriver,
  routeSummary,
} from '@/app-api/offers';
import { useAuth } from '@/context/AuthContext';
import { canShowOfferId } from '@/utils/offerDisplay';
import OfferBidExpiredIcon from '@/icons/OfferBidExpiredIcon';
import Swipeable from 'react-native-gesture-handler/Swipeable';

function hasHazmat(specialRequirements: unknown): boolean {
  if (!specialRequirements) return false;
  if (Array.isArray(specialRequirements)) {
    return specialRequirements.some(
      (v) => String(v).toLowerCase() === 'hazmat'
    );
  }
  return String(specialRequirements).toLowerCase().includes('hazmat');
}

interface OfferCardProps {
  offer: OfferRow;
  onPress: () => void;
  /** For driver: active offer = green border + clickable; inactive = red border + no navigation */
  isDriver?: boolean;
  /** For staff (ADMINISTRATOR, DISPATCHER, etc.): show Deactivate on swipe left */
  isStaffOrAdmin?: boolean;
  onDecline?: () => void;
  isDeclining?: boolean;
  onDeactivate?: () => void;
  isDeactivating?: boolean;
  /** Show overlay when driver has reached configured max open bids (unassigned offers with a rate, not selected) */
  showParticipationLimitOverlay?: boolean;
  /** Driver offers list tab — controls rate label in preview */
  offerListTab?: 'active' | 'assigned' | 'inactive';
}

function normalizeUnixSeconds(value: unknown): number | null {
  if (value == null || value === '') return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.floor(parsed);
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatOfferRate(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return `$${Number(value).toLocaleString('en-US')}`;
}

function formatLoadedMiles(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Unified offer card for all roles.
 * For drivers: green border when active, red when inactive; inactive blocks navigation.
 */
export default function OfferCard({
  offer,
  onPress,
  isDriver,
  isStaffOrAdmin = false,
  onDecline,
  isDeclining = false,
  onDeactivate,
  isDeactivating = false,
  showParticipationLimitOverlay = false,
  offerListTab = 'active',
}: OfferCardProps) {
  const { authState } = useAuth();
  const showOfferId = canShowOfferId(authState.user);
  const driverExternalId = (authState.user?.externalId ?? '').trim();
  const title = routeSummary(offer.route) || '—';
  const showHazmat = hasHazmat(offer.special_requirements);
  const [isHazmatImageReady, setIsHazmatImageReady] = useState(false);
  const [isStopImageReady, setIsStopImageReady] = useState(false);
  const offerDriver = useMemo(
    () => findOfferDriverEntry(offer, driverExternalId),
    [driverExternalId, offer]
  );
  const isInactiveForDriver = Boolean(
    isDriver && isOfferInactiveForDriver(offer, driverExternalId)
  );
  const isSelectedForDriver = Boolean(isDriver && offerDriver?.is_selected);
  const canNavigate = !isInactiveForDriver && !showParticipationLimitOverlay;
  const [nowUnixSeconds, setNowUnixSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const driverActionTimeUnix = normalizeUnixSeconds(offerDriver?.action_time);
  const hasSubmittedRate =
    isDriver && offerDriver?.rate != null && driverActionTimeUnix != null;
  const remainingSeconds =
    driverActionTimeUnix != null ? Math.max(0, driverActionTimeUnix - nowUnixSeconds) : 0;
  const isBidExpired =
    hasSubmittedRate && driverActionTimeUnix != null && driverActionTimeUnix <= nowUnixSeconds;
  const hasActiveBidTimer = hasSubmittedRate && remainingSeconds > 0;
  const offeredRateLabel = formatOfferRate(offer.offered_rate);
  const driverRateLabel = formatOfferRate(offerDriver?.rate);
  const loadedMilesLabel = formatLoadedMiles(offer.loaded_miles);
  const showOfferedRatePreview = Boolean(
    isDriver && offerListTab !== 'assigned' && offeredRateLabel,
  );
  const showDriverRatePreview = Boolean(
    isDriver && offerListTab === 'assigned' && driverRateLabel,
  );

  useEffect(() => {
    if (!hasSubmittedRate) {
      return;
    }

    setNowUnixSeconds(Math.floor(Date.now() / 1000));
    const intervalId = setInterval(() => {
      setNowUnixSeconds(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [hasSubmittedRate, driverActionTimeUnix]);

  const cardStyle = isDriver
    ? isSelectedForDriver
      ? styles.cardSelected
      : !isInactiveForDriver
      ? styles.cardActive
      : styles.cardInactive
    : styles.card;
  const canSwipeToDecline = Boolean(
    isDriver &&
      !isInactiveForDriver &&
      !showParticipationLimitOverlay &&
      !hasActiveBidTimer &&
      onDecline
  );
  const canSwipeToDeactivate = Boolean(
    isStaffOrAdmin && offer.active !== false && onDeactivate
  );
  const canSwipe = canSwipeToDecline || canSwipeToDeactivate;

  const cardContent = (
    <TouchableOpacity
      style={[styles.card, cardStyle]}
      onPress={canNavigate ? onPress : undefined}
      activeOpacity={canNavigate ? 0.7 : 1}
      disabled={!canNavigate || isDeclining}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
          {showOfferId ? ` (id: ${offer.id})` : ''}
        </Text>
        {showHazmat && (
          <View style={styles.hazmatIconWrap}>
            {!isHazmatImageReady ? <View style={styles.hazmatPlaceholder} /> : null}
            <Image
              source={require('@/icons/hazmat.png')}
              style={[styles.hazmatIcon, !isHazmatImageReady && styles.hiddenImage]}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
              onLoad={() => setIsHazmatImageReady(true)}
              onError={() => setIsHazmatImageReady(true)}
            />
          </View>
        )}
      </View>

      {isInactiveForDriver ? (
        <View style={styles.unavailableBlock}>
          <View style={styles.unavailableBadge}>
            <View style={styles.unavailableIconWrap}>
              {!isStopImageReady ? <View style={styles.unavailableIconPlaceholder} /> : null}
              <Image
                source={require('@/icons/stop.png')}
                style={[styles.unavailableIcon, !isStopImageReady && styles.hiddenImage]}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0}
                onLoad={() => setIsStopImageReady(true)}
                onError={() => setIsStopImageReady(true)}
              />
            </View>
            <Text style={styles.unavailableBadgeText}>Offer is no longer available</Text>
          </View>
        </View>
      ) : null}

      {isSelectedForDriver ? (
        <View style={styles.selectedBlock}>
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>You were selected for this offer</Text>
          </View>
        </View>
      ) : null}

      {showOfferedRatePreview ? (
        <Text style={styles.rateMeta}>Offered rate: {offeredRateLabel}</Text>
      ) : null}

      {showDriverRatePreview ? (
        <Text style={styles.rateMeta}>Driver rate: {driverRateLabel}</Text>
      ) : null}

      {((loadedMilesLabel != null && !isSelectedForDriver) ||
        (hasSubmittedRate && !isSelectedForDriver)) &&
      !isInactiveForDriver && (
        <View style={styles.loadedRow}>
          <Text style={styles.meta}>
            {loadedMilesLabel != null && !isSelectedForDriver ? `Loaded: ${loadedMilesLabel} mi` : ''}
          </Text>
          {hasSubmittedRate && !isBidExpired && !isSelectedForDriver ? (
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>{formatCountdown(remainingSeconds)}</Text>
            </View>
          ) : null}
          {isBidExpired && !isSelectedForDriver ? (
            <OfferBidExpiredIcon width={34} height={28} />
          ) : null}
        </View>
      )}

      {showParticipationLimitOverlay ? (
        <View style={styles.participationLimitOverlay} pointerEvents="auto">
          <BlurView
            intensity={Platform.OS === 'ios' ? 12 : 6}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.participationLimitBackdrop} />
          <View style={styles.participationLimitContent}>
            <Text style={styles.participationLimitText}>
              Offer participation limit reached
            </Text>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  if (!canSwipe) {
    return cardContent;
  }

  return (
    <Swipeable
      overshootRight={false}
      rightThreshold={rem(56)}
      renderRightActions={() => (
        <View style={styles.swipeActionWrap}>
          <TouchableOpacity
            style={[
              styles.swipeActionButton,
              (isDeclining || isDeactivating) && styles.swipeActionButtonDisabled,
            ]}
            onPress={canSwipeToDecline ? onDecline : onDeactivate}
            activeOpacity={0.8}
            disabled={isDeclining || isDeactivating}
          >
            <Text style={styles.swipeActionText}>
              {canSwipeToDecline
                ? isDeclining
                  ? 'Declining…'
                  : 'Decline Offer'
                : isDeactivating
                  ? 'Deactivating…'
                  : 'Deactivate offer'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {cardContent}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    marginBottom: rem(12),
    borderWidth: 2,
    borderColor: colors.neutral.lightGrey,
  },
  swipeActionWrap: {
    width: rem(148),
    marginBottom: rem(12),
    justifyContent: 'stretch',
  },
  swipeActionButton: {
    flex: 1,
    borderRadius: rem(12),
    backgroundColor: colors.semantic.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rem(14),
  },
  swipeActionButtonDisabled: {
    opacity: 0.7,
  },
  swipeActionText: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
    textAlign: 'center',
  },
  cardActive: {
    borderColor: colors.semantic.success,
  },
  cardInactive: {
    borderColor: colors.semantic.error,
    backgroundColor: '#FDE8E8',
  },
  cardSelected: {
    borderColor: colors.semantic.success,
    backgroundColor: '#ECFDF3',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(8),
    marginBottom: rem(6),
  },
  title: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  hiddenImage: {
    opacity: 0,
  },
  hazmatIconWrap: {
    width: rem(44),
    height: rem(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazmatIcon: {
    width: rem(44),
    height: rem(44),
  },
  hazmatPlaceholder: {
    position: 'absolute',
    width: rem(40),
    height: rem(40),
    borderRadius: rem(10),
    backgroundColor: '#F3F4F6',
  },
  unavailableBlock: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: rem(4),
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: rem(12),
    paddingVertical: rem(8),
    borderRadius: rem(999),
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    gap: rem(8),
  },
  unavailableIconWrap: {
    width: rem(20),
    height: rem(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableIcon: {
    width: rem(20),
    height: rem(20),
  },
  unavailableIconPlaceholder: {
    position: 'absolute',
    width: rem(18),
    height: rem(18),
    borderRadius: rem(999),
    backgroundColor: '#FCA5A5',
  },
  unavailableBadgeText: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: '#B91C1C',
  },
  selectedBlock: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: rem(4),
  },
  selectedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: rem(12),
    paddingVertical: rem(8),
    borderRadius: rem(999),
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  selectedBadgeText: {
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: '#166534',
  },
  loadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rem(8),
    marginTop: rem(4),
  },
  meta: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  rateMeta: {
    marginTop: rem(4),
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
  },
  timerBadge: {
    minWidth: rem(88),
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    borderRadius: rem(20),
    backgroundColor: colors.primary.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: fp(15),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  participationLimitOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: rem(10),
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  participationLimitBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(185, 28, 28, 0.18)',
  },
  participationLimitContent: {
    paddingHorizontal: rem(20),
    paddingVertical: rem(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  participationLimitText: {
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: '#1C1917',
    textAlign: 'center',
  },
});
