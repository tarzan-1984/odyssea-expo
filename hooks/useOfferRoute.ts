import { useQuery } from '@tanstack/react-query';
import {
  fetchOfferRoute,
  fetchRouteForPoints,
  OfferRouteResult,
  RoutePoint,
} from '@/services/offerRouteService';

const CACHE_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Fetches and caches offer route: geocodes addresses and OSRM road geometry.
 * Cached for ~5 minutes.
 */
export function useOfferRoute(
  locations: string[] | undefined,
  routePoints?: RoutePoint[] | undefined
): {
  data: OfferRouteResult | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const pointsKey = Array.isArray(routePoints)
    ? routePoints.map((p) => `${p.latitude},${p.longitude}`).join('|')
    : '';
  const locationsKey = Array.isArray(locations)
    ? locations.join('|')
    : 'empty';
  const hasRoutePoints = Array.isArray(routePoints) && routePoints.length > 0;
  const hasLocations =
    Array.isArray(locations) &&
    locations.length > 0 &&
    locations.some((l) => (l || '').trim());
  const enabled = hasRoutePoints || hasLocations;

  const query = useQuery({
    queryKey: ['offerRoute', hasRoutePoints ? `points:${pointsKey}` : `locations:${locationsKey}`],
    queryFn: async () => {
      if (hasRoutePoints) {
        return fetchRouteForPoints(routePoints ?? []);
      }
      return fetchOfferRoute(locations ?? []);
    },
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
