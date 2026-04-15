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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import WorkTopMenu from '@/components/work/WorkTopMenu';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import { getDriverDraftLoads, getStaffDraftLoads } from '@/app-api/offers';
import DraftLoadCard from '@/components/offers/DraftLoadCard';
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
  const draftLoadsQueryEnabled = authState.isAuthenticated && canAccess;
  const [tab, setTab] = useState<'your' | 'drafts'>('your');
  const [yourLoadsStatus, setYourLoadsStatus] =
    useState<DriverLoadStatusValue>(DEFAULT_DRIVER_LOAD_STATUS);

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
                <YourLoadsStatusPicker value={yourLoadsStatus} onChange={setYourLoadsStatus} />
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderTitle}>Your loads</Text>
                  <Text style={styles.placeholderSubtitle}>
                    Loads assigned to you will appear here.
                  </Text>
                </View>
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
              <View style={styles.placeholder}>
                <Text style={styles.placeholderTitle}>No drafts in progress</Text>
                <Text style={styles.placeholderSubtitle}>
                  Loads you start in TMS will appear here while they are still being completed.
                </Text>
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
