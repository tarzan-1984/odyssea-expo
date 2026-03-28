import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import BottomNavigation from '@/components/navigation/BottomNavigation';
import WorkTopMenu from '@/components/work/WorkTopMenu';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab, canAccessDriversAndOffers } from '@/constants/roleAccess';
import { useDriversListInfinite } from '@/hooks/useDriversListInfinite';
import { getDriverStatusLabel } from '@/constants/driversListConstants';
import type { TmsDriver } from '@/app-api/tmsDriverSearch';
import DriversFiltersModal, {
  type DriversFiltersState,
} from '@/components/drivers/DriversFiltersModal';
import DriverCard from '@/components/drivers/DriverCard';
import CreateOfferSheet from '@/components/drivers/CreateOfferSheet';

const ITEMS_PER_PAGE = 20;

const DISALLOWED_DRIVER_STATUS_FILTER_FOR_NON_ADMIN = new Set([
  'Blocked',
  'Out of service',
  'On vacation',
  'No updates',
]);

const defaultFilters = (): DriversFiltersState => ({
  address: '',
  locationFilter: 'USA',
  radiusFilter: '500',
  statusFilter: '',
  capabilitiesFilter: [],
});

export default function DriversScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const roleLower = authState.user?.role?.trim().toLowerCase() ?? '';
  const canAccessWork = canAccessWorkTab(role);
  const canSeeDrivers = canAccessDriversAndOffers(role);
  const isAdmin = role === 'ADMINISTRATOR';

  const [appliedFilters, setAppliedFilters] = useState<DriversFiltersState>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addressTrimmed = appliedFilters.address.trim();
  const queryEnabled =
    canSeeDrivers && canAccessWork && (isAdmin || addressTrimmed.length > 0);

  const listParams = useMemo(
    () => ({
      itemsPerPage: ITEMS_PER_PAGE,
      capabilitiesFilter: appliedFilters.capabilitiesFilter,
      addressFilter: addressTrimmed,
      radiusFilter: appliedFilters.radiusFilter,
      locationFilter: appliedFilters.locationFilter,
      statusFilter: appliedFilters.statusFilter,
      role: roleLower,
    }),
    [
      appliedFilters.capabilitiesFilter,
      appliedFilters.locationFilter,
      appliedFilters.radiusFilter,
      appliedFilters.statusFilter,
      addressTrimmed,
      roleLower,
    ]
  );

  const {
    data,
    isPending,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useDriversListInfinite(listParams, { enabled: queryEnabled });

  const idPosts = useMemo(() => {
    const m: Record<string, { distance?: string | number }> = {};
    for (const page of data?.pages ?? []) {
      const posts = page?.data?.id_posts;
      if (posts && typeof posts === 'object') {
        Object.assign(m, posts);
      }
    }
    return m;
  }, [data?.pages]);

  const hasDistanceData = useMemo(
    () => Boolean(data?.pages?.some((p) => p?.data?.has_distance_data === true)),
    [data?.pages]
  );

  const drivers = useMemo(() => {
    const rows: TmsDriver[] = [];
    for (const page of data?.pages ?? []) {
      const r = page?.data?.results;
      if (Array.isArray(r)) rows.push(...r);
    }
    const statusF = appliedFilters.statusFilter;
    if (!statusF) return rows;
    // Match Next.js DriversListTable filteredResults (always filter by status label when set)
    return rows.filter(
      (d) => getDriverStatusLabel(d.meta_data?.driver_status) === statusF
    );
  }, [data?.pages, appliedFilters.statusFilter]);

  useEffect(() => {
    if (!authState.isAuthenticated) return;
    if (!canAccessWork) {
      router.replace('/final-verify');
      return;
    }
    if (!canSeeDrivers) {
      router.replace('/work');
    }
  }, [authState.isAuthenticated, canAccessWork, canSeeDrivers, router]);

  useEffect(() => {
    if (isAdmin) return;
    setAppliedFilters((f) =>
      f.statusFilter && DISALLOWED_DRIVER_STATUS_FILTER_FOR_NON_ADMIN.has(f.statusFilter)
        ? { ...f, statusFilter: '' }
        : f
    );
  }, [isAdmin]);

  const canSelect = addressTrimmed.length > 0;

  useEffect(() => {
    if (!addressTrimmed) {
      setSelectedIds(new Set());
    }
  }, [addressTrimmed]);

  const toggleSelect = useCallback(
    (id: string) => {
      if (!canSelect) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [canSelect]
  );

  const removeDriverFromOfferSelection = useCallback((driverId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(driverId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (createOpen && selectedIds.size === 0) {
      setCreateOpen(false);
    }
  }, [createOpen, selectedIds.size]);

  const selectableIds = useMemo(
    () => drivers.map((d) => String(d.id)),
    [drivers]
  );
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (!canSelect || selectableIds.length === 0) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const applyFilters = (next: DriversFiltersState) => {
    setAppliedFilters(next);
    setSelectedIds(new Set());
    setExpandedId(null);
  };

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (addressTrimmed) {
      parts.push(addressTrimmed);
      parts.push(appliedFilters.locationFilter);
      parts.push(`${appliedFilters.radiusFilter} mi`);
    }
    if (appliedFilters.statusFilter) parts.push(appliedFilters.statusFilter);
    if (appliedFilters.capabilitiesFilter.length) {
      parts.push(`${appliedFilters.capabilitiesFilter.length} caps`);
    }
    return parts.join(' · ');
  }, [appliedFilters, addressTrimmed]);

  /** Same as Next.js DriversListTable: driver list id -> rounded empty miles from id_posts. */
  const driverEmptyMiles = useMemo(() => {
    const out: Record<string, number> = {};
    for (const driverId of selectedIds) {
      const item = drivers.find((d) => String(d.id) === driverId);
      if (!item) continue;
      const keyDriver = item.meta_data?.driver_id ?? driverId;
      const dist =
        idPosts[keyDriver]?.distance ?? idPosts[driverId]?.distance;
      if (dist == null) continue;
      const num = typeof dist === 'string' ? parseFloat(dist) : Number(dist);
      if (Number.isFinite(num)) {
        out[driverId] = Math.round(num);
      }
    }
    return out;
  }, [selectedIds, drivers, idPosts]);

  const selectedDriverLines = useMemo(() => {
    return Array.from(selectedIds).map((id) => {
      const d = drivers.find((x) => String(x.id) === id);
      const meta = d?.meta_data;
      const did = String(meta?.driver_id ?? d?.id ?? id);
      const name = meta?.driver_name ?? '—';
      return { id, label: `(${did}) ${name}` };
    });
  }, [selectedIds, drivers]);

  const canCreateOffer =
    selectedIds.size > 0 && Boolean(addressTrimmed) && hasDistanceData;

  const externalId = (authState.user?.externalId ?? '').trim();

  return (
    <View style={[styles.screenWrap, Platform.OS === 'android' && { paddingBottom: insets.bottom }]}>
      <View style={styles.screenContent}>
        <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
        <View style={styles.container}>
          <WorkTopMenu currentPage="drivers" showDriversTab />

          <View style={styles.toolbar}>
            <TouchableOpacity style={styles.filterBtn} onPress={() => setFiltersOpen(true)}>
              <Text style={styles.filterBtnText}>Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createBtn, !canCreateOffer && styles.createBtnDisabled]}
              onPress={() => setCreateOpen(true)}
              disabled={!canCreateOffer}
            >
              <Text style={styles.createBtnText}>Create offer</Text>
            </TouchableOpacity>
          </View>

          <Text
            style={filterSummary ? styles.summary : styles.summaryHint}
            numberOfLines={filterSummary ? 3 : 5}
          >
            {filterSummary ||
              (isAdmin
                ? 'Open Filters — enter an address to enable selection and offers'
                : 'Enter an address in Filters to search and select drivers')}
          </Text>

          {canSelect && drivers.length > 0 ? (
            <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
              <Text style={styles.selectAllText}>
                {allSelected ? 'Deselect all' : 'Select all'} ({drivers.length})
              </Text>
            </TouchableOpacity>
          ) : null}

          {!queryEnabled ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>Driver search</Text>
              <Text style={styles.placeholderSubtitle}>
                {isAdmin
                  ? 'Open Filters to narrow the list, or scroll to load all drivers.'
                  : 'Enter an address in Filters to search for drivers near a location.'}
              </Text>
            </View>
          ) : isPending ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="large" color={colors.primary.blue} />
              <Text style={styles.placeholderSubtitle}>Loading drivers…</Text>
            </View>
          ) : isError ? (
            <View style={styles.placeholder}>
              <Text style={styles.errorText}>{(error as Error).message}</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={styles.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : drivers.length === 0 ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderSubtitle}>No drivers match your filters</Text>
            </View>
          ) : (
            <FlatList
              data={drivers}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const id = String(item.id);
                const distKey = item.meta_data?.driver_id ?? id;
                const raw = idPosts[distKey]?.distance ?? idPosts[id]?.distance;
                let distanceMiles: number | null = null;
                if (raw != null) {
                  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
                  if (Number.isFinite(n)) distanceMiles = n;
                }
                return (
                  <DriverCard
                    driver={item}
                    selected={selectedIds.has(id)}
                    canSelect={canSelect}
                    onToggleSelect={() => toggleSelect(id)}
                    expanded={expandedId === id}
                    onToggleExpand={() =>
                      setExpandedId((e) => (e === id ? null : id))
                    }
                    distanceMiles={distanceMiles}
                  />
                );
              }}
              contentContainerStyle={styles.listContent}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <ActivityIndicator style={{ marginVertical: rem(16) }} color={colors.primary.blue} />
                ) : null
              }
            />
          )}
        </View>
      </View>

      <DriversFiltersModal
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        initial={appliedFilters}
        onApply={applyFilters}
        isAdministrator={isAdmin}
      />

      <CreateOfferSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        externalId={externalId}
        selectedDriverIds={Array.from(selectedIds)}
        selectedDrivers={selectedDriverLines}
        driverEmptyMiles={
          Object.keys(driverEmptyMiles).length > 0 ? driverEmptyMiles : undefined
        }
        onRemoveSelectedDriver={removeDriverFromOfferSelection}
        onSuccess={() => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ['offers'] });
          queryClient.invalidateQueries({ queryKey: ['drivers-list'] });
        }}
      />

      <BottomNavigation currentRoute="/work/drivers" />
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
    backgroundColor: colors.neutral.white,
  },
  toolbar: {
    flexDirection: 'row',
    gap: rem(10),
    paddingHorizontal: rem(16),
    paddingTop: rem(10),
    paddingBottom: rem(6),
  },
  filterBtn: {
    flex: 1,
    paddingVertical: rem(12),
    borderRadius: rem(10),
    borderWidth: 1,
    borderColor: colors.primary.blue,
    alignItems: 'center',
  },
  filterBtnText: {
    fontSize: fp(15),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  createBtn: {
    flex: 1,
    paddingVertical: rem(12),
    borderRadius: rem(10),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.45,
  },
  createBtnText: {
    fontSize: fp(15),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  summary: {
    paddingHorizontal: rem(16),
    paddingBottom: rem(8),
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(20),
  },
  summaryHint: {
    paddingHorizontal: rem(16),
    paddingBottom: rem(10),
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    lineHeight: fp(22),
  },
  selectAllRow: {
    paddingHorizontal: rem(16),
    paddingBottom: rem(8),
  },
  selectAllText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  listContent: {
    paddingHorizontal: rem(16),
    paddingBottom: rem(100),
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  placeholderTitle: {
    fontSize: fp(22),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    marginBottom: rem(8),
  },
  placeholderSubtitle: {
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  errorText: {
    color: colors.semantic.error,
    textAlign: 'center',
    marginBottom: rem(12),
  },
  retry: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
});
