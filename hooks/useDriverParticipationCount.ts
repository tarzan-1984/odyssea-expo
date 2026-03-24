import { useQuery } from '@tanstack/react-query';
import { getDriverParticipationCount } from '@/app-api/offers';
import { useAuth } from '@/context/AuthContext';

export const DRIVER_PARTICIPATION_COUNT_QUERY_KEY = [
  'offers',
  'driver-participation-count',
] as const;

/**
 * Fetches the count of offers where the driver has placed a bid but is not yet selected.
 * Used for participation limit (max 2) in mobile app.
 * Cached with staleTime; invalidate on offerUpdated via WebSocket.
 */
export function useDriverParticipationCount() {
  const { authState } = useAuth();
  const role = authState.user?.role?.trim().toUpperCase() ?? '';
  const isDriver = role === 'DRIVER';
  const externalId = authState.user?.externalId ?? '';

  return useQuery({
    queryKey: [...DRIVER_PARTICIPATION_COUNT_QUERY_KEY, externalId],
    queryFn: getDriverParticipationCount,
    staleTime: 30 * 1000, // 30 seconds
    enabled:
      authState.isAuthenticated && isDriver && !!externalId,
  });
}
