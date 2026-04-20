import { useQuery } from '@tanstack/react-query';
import { fetchOfferRoute, type OfferRouteResult } from '@/services/offerRouteService';

const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function useLoadRoute(locations: string[] | undefined): {
  data: OfferRouteResult | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const key = Array.isArray(locations) ? locations.join('|') : 'empty';
  const enabled =
    Array.isArray(locations) &&
    locations.length > 0 &&
    locations.some((l) => (l || '').trim());

  const query = useQuery({
    queryKey: ['loadRoute', key],
    queryFn: async () => fetchOfferRoute(locations ?? []),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 2,
    enabled,
  });

  return {
    data: query.data ?? (enabled ? undefined : null),
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

