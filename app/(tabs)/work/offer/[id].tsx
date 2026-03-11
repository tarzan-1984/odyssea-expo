import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, rem, fp } from '@/lib';
import { useAuth } from '@/context/AuthContext';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import ArrowLeft from '@/icons/ArrowLeft';
import OSMMapView, { type Region, type OSMMapViewRef } from '@/components/maps/OSMMapView';
import { useOfferRoute } from '@/hooks/useOfferRoute';
import { OfferRow, routeSummary } from '@/app-api/offers';

const MAP_MAX_HEIGHT = Dimensions.get('window').height * 0.25;

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
  const { offerJson } = useLocalSearchParams<{ id?: string; offerJson?: string }>();
  const isDriver = (authState.user?.role ?? '').trim().toUpperCase() === 'DRIVER';

  let offer: OfferRow | null = null;
  if (offerJson) {
    try {
      offer = JSON.parse(offerJson) as OfferRow;
    } catch {
      // ignore
    }
  }

  const locations = (offer?.route ?? [])
    .map((p) => (p.location || '').trim())
    .filter(Boolean);
  const { data: routeData, isLoading: routeLoading } = useOfferRoute(
    locations.length > 0 ? locations : undefined
  );

  const headerTitle = offer ? (routeSummary(offer.route) || '—') : 'Offer';

  const routePoints = offer?.route ?? [];
  const markers = (routeData?.markers ?? []).map((p, i) => ({
    coordinate: { latitude: p.latitude, longitude: p.longitude },
    tooltipAddress: routePoints[i]?.location ?? '',
    tooltipTime: routePoints[i]?.time ?? '',
  }));
  const polylineCoordinates = routeData?.polyline ?? undefined;

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
                      {offer.drivers?.[0]?.empty_miles != null
                        ? offer.drivers[0].empty_miles
                        : '—'}
                    </Text>
                    <Text style={styles.distanceTableValue}>
                      {offer.loaded_miles != null ? offer.loaded_miles : '—'}
                    </Text>
                    <Text style={[styles.distanceTableValue, styles.distanceTableValueBold]}>
                      {offer.drivers?.[0]?.total_miles != null
                        ? offer.drivers[0].total_miles
                        : '—'}
                    </Text>
                  </View>
                </View>
              )}

              {offer.commodity && String(offer.commodity).trim() ? (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoBlockTitle}>Commodity</Text>
                  <Text style={styles.infoBlockText}>{String(offer.commodity).trim()}</Text>
                </View>
              ) : null}

              {offer.notes && String(offer.notes).trim() ? (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoBlockTitle}>Notes</Text>
                  <Text style={styles.infoBlockText}>{String(offer.notes).trim()}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
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
