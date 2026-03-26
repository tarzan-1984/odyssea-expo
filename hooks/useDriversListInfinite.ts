import { useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchTmsDriversPage,
  type TmsDriverSearchQueryParams,
} from '@/app-api/tmsDriverSearch';

export const DRIVERS_LIST_STALE_MS = 10 * 60 * 1000;

export type DriversListInfiniteFilters = Omit<TmsDriverSearchQueryParams, 'currentPage'>;

export function useDriversListInfinite(
  filters: DriversListInfiniteFilters,
  options: { enabled: boolean }
) {
  const {
    itemsPerPage,
    capabilitiesFilter,
    addressFilter,
    radiusFilter,
    locationFilter,
    statusFilter,
    role,
  } = filters;

  return useInfiniteQuery({
    queryKey: [
      'drivers-list',
      'infinite',
      {
        itemsPerPage,
        capabilitiesFilter,
        addressFilter,
        radiusFilter,
        locationFilter,
        statusFilter,
        role,
      },
    ],
    queryFn: ({ pageParam }) =>
      fetchTmsDriversPage({
        ...filters,
        currentPage: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage?.data?.pagination;
      if (!pagination) return undefined;
      const { current_page, total_pages } = pagination;
      if (current_page < total_pages) return current_page + 1;
      return undefined;
    },
    staleTime: DRIVERS_LIST_STALE_MS,
    enabled: options.enabled,
  });
}
