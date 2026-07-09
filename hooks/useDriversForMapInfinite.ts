import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchDriversSearchPage,
  getAccessToken,
  type DriversMapSearchFilters,
  type DriverForMap,
} from '@/app-api/driversSearch';
import { driverMapStatusMatchesFilter } from '@/constants/driversMapFilters';

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes
const PAGE_SIZE = 60;

/**
 * Hook to fetch drivers for map - SAME as Next.js useDriversForMap.
 * ALWAYS uses TMS API via NestJS proxy. No our DB.
 */
export function useDriversForMapInfinite(filters: DriversMapSearchFilters) {
  const { authState } = useAuth();
  const baseParams = {
    capabilitiesFilter: filters.capabilitiesFilter ?? [],
    addressFilter: filters.addressFilter ?? '',
    radiusFilter: filters.radiusFilter ?? '500',
    locationFilter: filters.locationFilter ?? 'USA',
    statusFilter: filters.statusFilter ?? '',
    role: filters.role ?? 'administrator',
  };

  const query = useInfiniteQuery({
    queryKey: [
      'drivers-map',
      {
        capabilitiesFilter: baseParams.capabilitiesFilter,
        addressFilter: baseParams.addressFilter,
        radiusFilter: baseParams.radiusFilter,
        locationFilter: baseParams.locationFilter,
        statusFilter: baseParams.statusFilter,
      },
    ],
    queryFn: async ({ pageParam }) => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return fetchDriversSearchPage(
        { ...baseParams, currentPage: pageParam },
        token,
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage?.data?.pagination;
      if (!pagination) return undefined;
      const { current_page, total_pages } = pagination;
      if (current_page < total_pages) return current_page + 1;
      return undefined;
    },
    staleTime: STALE_TIME_MS,
    gcTime: STALE_TIME_MS,
    enabled: authState.isAuthenticated,
  });

  const { hasNextPage, fetchNextPage, isFetchingNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage().catch(() => undefined);
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rawDrivers: DriverForMap[] = (query.data?.pages ?? [])
    .flatMap((page) => page?.data?.results ?? [])
    .filter((d) => d && typeof d.latitude === 'number' && typeof d.longitude === 'number');

  // Same as Next.js: client-side status filter only when address present (API sends status_filter when no address)
  const drivers = useMemo(() => {
    const statusFilter = baseParams.statusFilter;
    if (!statusFilter || statusFilter === 'all') return rawDrivers;
    const hasAddressFilter = Boolean(baseParams.addressFilter?.trim());
    if (!hasAddressFilter) return rawDrivers; // API already filtered via status_filter
    return rawDrivers.filter((d) =>
      driverMapStatusMatchesFilter(d.driverStatus, statusFilter)
    );
  }, [rawDrivers, baseParams.statusFilter, baseParams.addressFilter]);

  return {
    drivers,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}
