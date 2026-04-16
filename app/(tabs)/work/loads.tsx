import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import WorkTopMenu from '@/components/work/WorkTopMenu';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import { getDriverDraftLoads, getStaffDraftLoads } from '@/app-api/offers';
import { getYourLoads } from '@/app-api/loads';
import DraftLoadCard from '@/components/offers/DraftLoadCard';
import LoadCard from '@/components/offers/LoadCard';
import OffersAdminUserFilter from '@/components/offers/OffersAdminUserFilter';
import YourLoadsStatusPicker from '@/components/work/YourLoadsStatusPicker';
import {
  DEFAULT_DRIVER_LOAD_STATUS,
  type DriverLoadStatusValue,
} from '@/constants/driverLoadStatuses';

export default function LoadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const canAccess = canAccessWorkTab(role);
  const showDriversTab = canAccessDriversAndOffers(role);
  const isDriver = role === 'DRIVER';
  const isAdministrator = role === 'ADMINISTRATOR';
  const draftLoadsQueryEnabled = authState.isAuthenticated && canAccess;
  const [tab, setTab] = useState<'your' | 'drafts'>('your');
  const [yourLoadsStatus, setYourLoadsStatus] =
    useState<DriverLoadStatusValue>(DEFAULT_DRIVER_LOAD_STATUS);
  /** ADMINISTRATOR only: optional TMS user_id filter (externalId), '' = all loads */
  const [adminLoadsUserId, setAdminLoadsUserId] = useState('');
  const externalId = authState.user?.externalId?.trim() ?? '';
  const yourLoadsNeedExternalId = isDriver || !isAdministrator;
  const yourLoadsQueryEnabled =
    authState.isAuthenticated &&
    canAccess &&
    tab === 'your' &&
    (!yourLoadsNeedExternalId || externalId.length > 0);
  const yourLoadsStaleTimeMs = 10 * 60 * 1000;
  const draftLoadsStaleTimeMs = 5 * 60 * 1000;

  const {
    isPending,
    isError,
    error,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    data,
  } = useInfiniteQuery({
    queryKey: isDriver ? ['driver-draft-loads'] : ['staff-draft-loads'],
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const base = { page, per_page: 50 as const };
      return isDriver
        ? getDriverDraftLoads(base)
        : getStaffDraftLoads({ ...base, is_flt: 'false' });
    },
    enabled: draftLoadsQueryEnabled && tab === 'drafts',
    initialPageParam: 1,
    staleTime: draftLoadsStaleTimeMs,
    getNextPageParam: (lastPage) => {
      const tms = lastPage?.tms;
      const page = typeof tms?.page === 'number' ? tms.page : 1;
      const totalPages = typeof tms?.total_pages === 'number' ? tms.total_pages : 1;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  useEffect(() => {
    if (authState.isAuthenticated && !canAccess) {
      router.replace('/final-verify');
    }
  }, [authState.isAuthenticated, canAccess, router]);

  const items = data?.pages?.flatMap((p) => p.items ?? []) ?? [];

  const {
    isPending: yourPending,
    isError: yourIsError,
    error: yourError,
    isRefetching: yourIsRefetching,
    fetchNextPage: fetchNextYour,
    hasNextPage: yourHasNextPage,
    isFetchingNextPage: yourIsFetchingNextPage,
    refetch: refetchYour,
    data: yourData,
  } = useInfiniteQuery({
    queryKey: ['your-loads', role, externalId, yourLoadsStatus, adminLoadsUserId],
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const loadStatus =
        yourLoadsStatus === 'all' ? undefined : String(yourLoadsStatus);
      return getYourLoads({
        role,
        externalId,
        adminUserTmsId: isAdministrator ? adminLoadsUserId : undefined,
        load_status: loadStatus,
        page,
        per_page: 20,
      });
    },
    enabled: yourLoadsQueryEnabled,
    initialPageParam: 1,
    staleTime: yourLoadsStaleTimeMs,
    getNextPageParam: (lastPage) => {
      const tms = lastPage?.tms;
      const page = typeof tms?.page === 'number' ? tms.page : 1;
      const totalPages = typeof tms?.total_pages === 'number' ? tms.total_pages : 1;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const yourItems = yourData?.pages?.flatMap((p) => p.items ?? []) ?? [];

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <WorkTopMenu
            currentPage="loads"
            compactBottom
            showDriversTab={showDriversTab}
          />

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabButton, tab === 'your' && styles.tabButtonActive]}
              onPress={() => setTab('your')}
            >
              <Text style={[styles.tabText, tab === 'your' && styles.tabTextActive]}>
                YOUR LOADS
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, tab === 'drafts' && styles.tabButtonActive]}
              onPress={() => setTab('drafts')}
            >
              <Text style={[styles.tabText, tab === 'drafts' && styles.tabTextActive]}>
                DRAFTS LOADS
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {tab === 'your' ? (
              <View style={styles.yourLoadsWrap}>
                {isAdministrator ? (
                  <OffersAdminUserFilter value={adminLoadsUserId} onChange={setAdminLoadsUserId} />
                ) : null}
                <YourLoadsStatusPicker value={yourLoadsStatus} onChange={setYourLoadsStatus} />
                {!yourLoadsQueryEnabled ? (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderTitle}>Your loads</Text>
                    <Text style={styles.placeholderSubtitle}>
                      {externalId || !yourLoadsNeedExternalId
                        ? 'Loading...'
                        : 'External ID is missing. Contact support to link your account.'}
                    </Text>
                  </View>
                ) : yourPending ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary.blue} />
                  </View>
                ) : yourIsError ? (
                  <View style={styles.placeholder}>
                    <Text style={styles.errorTitle}>Could not load your loads</Text>
                    <Text style={styles.placeholderSubtitle}>
                      {yourError instanceof Error ? yourError.message : 'Something went wrong.'}
                    </Text>
                  </View>
                ) : yourItems.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Image
                      source={require('@/icons/no_offers_found.png')}
                      style={styles.emptyImage}
                      contentFit="contain"
                    />
                    <Text style={styles.emptyText}>No loads found</Text>
                  </View>
                ) : (
                  <FlatList
                    data={yourItems}
                    keyExtractor={(row) => `load-${row.tms_load_id}`}
                    renderItem={({ item }) => <LoadCard item={item} />}
                    contentContainerStyle={styles.listContent}
                    onEndReachedThreshold={0.6}
                    onEndReached={() => {
                      if (yourHasNextPage && !yourIsFetchingNextPage) {
                        fetchNextYour();
                      }
                    }}
                    ListFooterComponent={
                      yourIsFetchingNextPage ? (
                        <View style={styles.footerLoading}>
                          <ActivityIndicator size="small" color={colors.primary.blue} />
                        </View>
                      ) : null
                    }
                    refreshControl={
                      <RefreshControl
                        refreshing={yourIsRefetching}
                        onRefresh={() => refetchYour()}
                        tintColor={colors.primary.blue}
                      />
                    }
                  />
                )}
              </View>
            ) : !draftLoadsQueryEnabled ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary.blue} />
              </View>
            ) : isPending ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary.blue} />
              </View>
            ) : isError ? (
              <View style={styles.placeholder}>
                <Text style={styles.errorTitle}>Could not load drafts</Text>
                <Text style={styles.placeholderSubtitle}>
                  {error instanceof Error ? error.message : 'Something went wrong.'}
                </Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Image
                  source={require('@/icons/no_offers_found.png')}
                  style={styles.emptyImage}
                  contentFit="contain"
                />
                <Text style={styles.emptyText}>No draft loads found</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(row) => `draft-${row.tms_draft_id}`}
                renderItem={({ item }) => <DraftLoadCard item={item} />}
                contentContainerStyle={styles.listContent}
                onEndReachedThreshold={0.6}
                onEndReached={() => {
                  if (hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                  }
                }}
                ListFooterComponent={
                  isFetchingNextPage ? (
                    <View style={styles.footerLoading}>
                      <ActivityIndicator size="small" color={colors.primary.blue} />
                    </View>
                  ) : null
                }
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={() => refetch()}
                    tintColor={colors.primary.blue}
                  />
                }
              />
            )}
          </View>
        </View>
        <BottomNavigation currentRoute="/work/loads" />
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
  tabRow: {
    flexDirection: 'row',
    width: '100%',
    minHeight: rem(48),
    backgroundColor: '#0d1a2d',
  },
  tabButton: {
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
  content: {
    flex: 1,
  },
  yourLoadsWrap: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rem(40),
    gap: rem(16),
  },
  emptyImage: {
    width: rem(200),
    height: rem(200),
  },
  emptyText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  listContent: {
    paddingHorizontal: rem(16),
    paddingTop: rem(8),
    paddingBottom: rem(100),
  },
  footerLoading: {
    paddingVertical: rem(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(24),
  },
  placeholderTitle: {
    fontSize: fp(24),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(10),
    textAlign: 'center',
  },
  placeholderSubtitle: {
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: fp(18),
    fontFamily: fonts['700'],
    color: '#c62828',
    marginBottom: rem(8),
    textAlign: 'center',
  },
});
