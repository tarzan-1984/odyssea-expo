import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import { useOffers } from '@/hooks/useOffers';
import { useAuth } from '@/context/AuthContext';
import OfferCard from '@/components/offers/OfferCard';
import { OfferRow } from '@/app-api/offers';

type TabType = 'loads' | 'offers';

/** Roles that have access to offers */
const STAFF_ROLES = [
  'ADMINISTRATOR',
  'DISPATCHER',
  'DISPATCHER_TL',
  'EXPEDITE_MANAGER',
  'MORNING_TRACKING',
  'NIGHTSHIFT_TRACKING',
];

/**
 * Work screen - contains Loads and Offers as horizontal sub-tabs
 */
export default function WorkScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('loads');
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const isDriver = role === 'DRIVER';
  const isStaff = STAFF_ROLES.includes(role);

  const {
    data,
    isPending,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOffers({
    enabled: activeTab === 'offers' && (isDriver || isStaff),
  });

  const offers = data?.pages?.flatMap((p) => p.results) ?? [];

  const handleOfferPress = (offer: OfferRow) => {
    router.push({
      pathname: `/work/offer/${offer.id}`,
      params: { offerJson: JSON.stringify(offer) },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'loads' && styles.tabActive]}
            onPress={() => setActiveTab('loads')}
          >
            <Text style={[styles.tabText, activeTab === 'loads' && styles.tabTextActive]}>
              Loads
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'offers' && styles.tabActive]}
            onPress={() => setActiveTab('offers')}
          >
            <Text style={[styles.tabText, activeTab === 'offers' && styles.tabTextActive]}>
              Offers
            </Text>
          </TouchableOpacity>
        </View>
        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'loads' ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>Loads</Text>
              <Text style={styles.placeholderSubtitle}>Available loads will appear here</Text>
            </View>
          ) : !isDriver && !isStaff ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>Offers</Text>
              <Text style={styles.placeholderSubtitle}>
                Access to offers is not available for your role
              </Text>
            </View>
          ) : (
            <View style={styles.offersContent}>
              {isPending ? (
                <View style={styles.placeholder}>
                  <ActivityIndicator size="large" color={colors.primary.blue} />
                  <Text style={styles.placeholderSubtitle}>Loading offers...</Text>
                </View>
              ) : error ? (
                <View style={styles.placeholder}>
                  <Text style={styles.errorText}>
                    {(error as Error).message}
                  </Text>
                </View>
              ) : offers.length === 0 ? (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderTitle}>Offers</Text>
                  <Text style={styles.placeholderSubtitle}>
                    {isDriver
                      ? 'Your offers will appear here'
                      : 'No offers found'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={offers}
                  keyExtractor={(item) => `offer-${item.id}`}
                  renderItem={({ item }) => (
                    <OfferCard
                      offer={item}
                      onPress={() => handleOfferPress(item)}
                      isDriver={isDriver}
                    />
                  )}
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
          )}
        </View>
      </View>
      <BottomNavigation currentRoute="/work" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.lightGrey,
    paddingHorizontal: rem(20),
  },
  tab: {
    paddingVertical: rem(14),
    paddingHorizontal: rem(16),
    marginRight: rem(24),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary.blue,
  },
  tabText: {
    fontSize: fp(16),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  tabTextActive: {
    fontFamily: fonts['700'],
    color: colors.primary.blue,
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
  offersContent: {
    flex: 1,
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
