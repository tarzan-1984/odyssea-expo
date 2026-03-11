import { useQuery } from '@tanstack/react-query';
import {
  fetchOfferRoute,
  OfferRouteResult,
} from '@/services/offerRouteService';

const CACHE_STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches and caches offer route: geocodes addresses and OSRM road geometry.
 * Cached for ~5 minutes.
 */
export function useOfferRoute(locations: string[] | undefined): {
  data: OfferRouteResult | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const key = Array.isArray(locations)
    ? locations.join('|')
    : 'empty';
  const enabled =
    Array.isArray(locations) &&
    locations.length > 0 &&
    locations.some((l) => (l || '').trim());

  const query = useQuery({
    queryKey: ['offerRoute', key],
    queryFn: async () => fetchOfferRoute(locations ?? []),
    staleTime: CACHE_STALE_MS,
    gcTime: CACHE_STALE_MS * 2,
    enabled,
  });

  return {
    data: query.data ?? (enabled ? undefined : null),
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
