import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import WorkTopMenu from '@/components/work/WorkTopMenu';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import { getDriverDraftLoads } from '@/app-api/offers';
import DraftLoadCard from '@/components/offers/DraftLoadCard';

const DRAFT_LOADS_QUERY_KEY = ['driver-draft-loads'] as const;

export default function LoadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const canAccess = canAccessWorkTab(role);
  const showDriversTab = canAccessDriversAndOffers(role);
  const isDriver = role === 'DRIVER';

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: DRAFT_LOADS_QUERY_KEY,
    queryFn: getDriverDraftLoads,
    enabled: authState.isAuthenticated && isDriver,
  });

  useEffect(() => {
    if (authState.isAuthenticated && !canAccess) {
      router.replace('/final-verify');
    }
  }, [authState.isAuthenticated, canAccess, router]);

  const items = data?.items ?? [];

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <WorkTopMenu currentPage="loads" showDriversTab={showDriversTab} />

          <View style={styles.content}>
            {!isDriver ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderTitle}>Loads</Text>
                <Text style={styles.placeholderSubtitle}>
                  Draft loads in progress are shown to drivers only.
                </Text>
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
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: rem(16),
    paddingTop: rem(8),
    paddingBottom: rem(100),
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
