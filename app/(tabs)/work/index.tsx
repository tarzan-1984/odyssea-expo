import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import { useOffers } from '@/hooks/useOffers';
import {
  useDriverParticipationCount,
  DRIVER_PARTICIPATION_COUNT_QUERY_KEY,
} from '@/hooks/useDriverParticipationCount';
import { useAuth } from '@/context/AuthContext';
import { useWebSocketConnectionCheck } from '@/hooks/useWebSocketConnectionCheck';
import OfferCard from '@/components/offers/OfferCard';
import {
  OfferRow,
  deactivateOffer,
  findOfferDriverEntry,
  isOfferInactiveForDriver,
  removeDriverFromOfferDriver,
} from '@/app-api/offers';
import WorkTopMenu from '@/components/work/WorkTopMenu';
import OffersAdminUserFilter from '@/components/offers/OffersAdminUserFilter';
import {
  canAccessWorkTab,
  canAccessDriversAndOffers,
} from '@/constants/roleAccess';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';
import { eventBus } from '@/services/EventBus';

export default function OffersScreen() {
  useWebSocketConnectionCheck();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const isDriver = role === 'DRIVER';
  const isStaff = canAccessDriversAndOffers(role);
  const isAdmin = role === 'ADMINISTRATOR';

  // Redirect if user doesn't have access (staff or driver only)
  useEffect(() => {
    if (authState.isAuthenticated && !canAccessWorkTab(role)) {
      router.replace('/final-verify');
    }
  }, [authState.isAuthenticated, role, router]);

  const driverExternalId = (authState.user?.externalId ?? '').trim();
  const [decliningOfferId, setDecliningOfferId] = useState<number | null>(null);
  const [deactivatingOfferId, setDeactivatingOfferId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'assigned' | 'inactive'>('active');
  /** Admin-only: filter offers by creator (external_user_id), mirrors Next.js "User" filter */
  const [adminOffersUserId, setAdminOffersUserId] = useState('');

  const {
    data,
    isPending,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOffers({
    enabled: isDriver || isStaff,
    status: statusFilter,
    user_id: isAdmin ? adminOffersUserId : undefined,
  });

  const rawOffers = data?.pages?.flatMap((page) => page.results) ?? [];

  const offers = useMemo(() => {
    if (!isDriver || statusFilter !== 'active') {
      return rawOffers;
    }
    return [...rawOffers].sort((a, b) => {
      const inactiveA = isOfferInactiveForDriver(a, driverExternalId);
      const inactiveB = isOfferInactiveForDriver(b, driverExternalId);
      if (inactiveA !== inactiveB) {
        return inactiveA ? 1 : -1;
      }

      const driverInA = findOfferDriverEntry(a, driverExternalId);
      const driverInB = findOfferDriverEntry(b, driverExternalId);
      const participatesA = driverInA != null && driverInA.rate != null;
      const participatesB = driverInB != null && driverInB.rate != null;
      if (participatesA && !participatesB) return -1;
      if (!participatesA && participatesB) return 1;
      return 0;
    });
  }, [rawOffers, isDriver, statusFilter, driverExternalId]);

  const { data: participationData } = useDriverParticipationCount();
  const participatingCount = participationData?.count ?? 0;

  const [maxOpenOfferParticipations, setMaxOpenOfferParticipations] = useState(2);

  useEffect(() => {
    let cancelled = false;
    getResolvedAppLocationSettings().then((s) => {
      if (!cancelled) setMaxOpenOfferParticipations(s.maxDriverOpenOfferParticipations);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return eventBus.on('APP_LOCATION_SETTINGS_SYNCED', (s) => {
      setMaxOpenOfferParticipations(s.maxDriverOpenOfferParticipations);
    });
  }, []);

  const handleOfferPress = (offer: OfferRow) => {
    router.push({
      pathname: `/work/offer/${offer.id}`,
      params: { offerJson: JSON.stringify(offer) },
    });
  };

  const handleDeclineOffer = async (offer: OfferRow) => {
    if (!driverExternalId || decliningOfferId != null) {
      return;
    }

    try {
      setDecliningOfferId(offer.id);
      await removeDriverFromOfferDriver(offer.id, driverExternalId);
      await queryClient.invalidateQueries({ queryKey: ['offers'] });
      await queryClient.invalidateQueries({ queryKey: ['offer-detail', offer.id] });
      await queryClient.invalidateQueries({
        queryKey: DRIVER_PARTICIPATION_COUNT_QUERY_KEY,
      });
    } catch (declineError) {
      console.error('[OffersScreen] Failed to decline offer', declineError);
    } finally {
      setDecliningOfferId(null);
    }
  };

  const handleDeactivateOffer = (offer: OfferRow) => {
    if (deactivatingOfferId != null) return;

    Alert.alert(
      'Deactivate offer',
      'Are you sure you want to deactivate this offer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeactivatingOfferId(offer.id);
              await deactivateOffer(offer.id);
              await queryClient.invalidateQueries({ queryKey: ['offers'] });
              await queryClient.invalidateQueries({ queryKey: ['offer-detail', offer.id] });
            } catch (deactivateError) {
              console.error('[OffersScreen] Failed to deactivate offer', deactivateError);
            } finally {
              setDeactivatingOfferId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <WorkTopMenu
            currentPage="offers"
            compactBottom={isDriver || isStaff}
            showDriversTab={isStaff}
          />

          {(isDriver || isStaff) && (
            <View style={styles.statusFilterRow}>
              <TouchableOpacity
                style={[
                  styles.statusFilterButton,
                  statusFilter === 'active' && styles.statusFilterButtonActive,
                ]}
                onPress={() => setStatusFilter('active')}
              >
                <Text
                  style={[
                    styles.statusFilterText,
                    statusFilter === 'active' && styles.statusFilterTextActive,
                  ]}
                >
                  ACTIVE
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusFilterButton,
                  statusFilter === 'assigned' && styles.statusFilterButtonActive,
                ]}
                onPress={() => setStatusFilter('assigned')}
              >
                <Text
                  style={[
                    styles.statusFilterText,
                    statusFilter === 'assigned' && styles.statusFilterTextActive,
                  ]}
                >
                  ASSIGNED
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusFilterButton,
                  statusFilter === 'inactive' && styles.statusFilterButtonActive,
                ]}
                onPress={() => setStatusFilter('inactive')}
              >
                <Text
                  style={[
                    styles.statusFilterText,
                    statusFilter === 'inactive' && styles.statusFilterTextActive,
                  ]}
                >
                  PAST
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isAdmin && (
            <OffersAdminUserFilter value={adminOffersUserId} onChange={setAdminOffersUserId} />
          )}

          <View style={styles.content}>
            {!isDriver && !isStaff ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderTitle}>Offers</Text>
                <Text style={styles.placeholderSubtitle}>
                  Access to offers is not available for your role
                </Text>
              </View>
            ) : isPending ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color={colors.primary.blue} />
                <Text style={styles.placeholderSubtitle}>Loading offers...</Text>
              </View>
            ) : error ? (
              <View style={styles.placeholder}>
                <Text style={styles.errorText}>{(error as Error).message}</Text>
              </View>
            ) : offers.length === 0 ? (
              <View style={styles.emptyOffersWrap}>
                <Text style={styles.emptyOffersText}>No offers found</Text>
              </View>
            ) : (
              <FlatList
                data={offers}
                keyExtractor={(item) => `offer-${item.id}`}
                renderItem={({ item }) => {
                  const driverEntry = findOfferDriverEntry(item, driverExternalId);
                  const driverInOffer = !!driverEntry;
                  const hasSubmittedRateForThisOffer =
                    driverEntry != null && driverEntry.rate != null;
                  const showLimitOverlay =
                    isDriver &&
                    item.active === true &&
                    !item.is_driver_selected &&
                    driverInOffer &&
                    !hasSubmittedRateForThisOffer &&
                    driverEntry?.is_selected !== true &&
                    participatingCount >= maxOpenOfferParticipations;
                  return (
                    <OfferCard
                      offer={item}
                      onPress={() => handleOfferPress(item)}
                      isDriver={isDriver}
                      isStaffOrAdmin={isStaff}
                      onDecline={isDriver ? () => handleDeclineOffer(item) : undefined}
                      isDeclining={decliningOfferId === item.id}
                      onDeactivate={isStaff ? () => handleDeactivateOffer(item) : undefined}
                      isDeactivating={deactivatingOfferId === item.id}
                      showParticipationLimitOverlay={showLimitOverlay}
                    />
                  );
                }}
                contentContainerStyle={styles.offersList}
                showsVerticalScrollIndicator={false}
                onEndReached={() => {
                  if (hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isFetchingNextPage ? (
                    <View style={styles.loadMoreIndicator}>
                      <ActivityIndicator size="small" color={colors.primary.blue} />
                      <Text style={styles.loadMoreText}>Loading more...</Text>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        </View>
      <BottomNavigation currentRoute="/work" />
    </View>
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
    backgroundColor: colors.neutral.white,
  },
  statusFilterRow: {
    flexDirection: 'row',
    width: '100%',
    minHeight: rem(48),
    backgroundColor: '#0d1a2d',
  },
  statusFilterButton: {
    flex: 1,
    paddingVertical: rem(12),
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
  statusFilterButtonActive: {
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
  statusFilterText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: 'rgba(255, 255, 255, 0.7)',
  },
  statusFilterTextActive: {
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  content: {
    flex: 1,
    padding: rem(20),
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyOffersWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rem(40),
  },
  emptyOffersText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  placeholderTitle: {
    fontSize: fp(24),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(10),
  },
  placeholderSubtitle: {
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  offersList: {
    paddingBottom: rem(100),
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.semantic.error,
    textAlign: 'center',
  },
  loadMoreIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rem(16),
    gap: rem(8),
  },
  loadMoreText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
});
