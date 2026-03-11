import { useInfiniteQuery } from '@tanstack/react-query';
import { getOffers, GetOffersParams } from '@/app-api/offers';
import { useAuth } from '@/context/AuthContext';

/** Roles that see offers filtered by creator (external_user_id) */
const DISPATCHER_ROLES = [
  'DISPATCHER',
  'DISPATCHER_TL',
  'EXPEDITE_MANAGER',
  'MORNING_TRACKING',
  'NIGHTSHIFT_TRACKING',
];

export interface UseOffersParams extends Partial<GetOffersParams> {
  enabled?: boolean;
}

export function useOffers(params?: UseOffersParams) {
  const { authState } = useAuth();
  const user = authState.user;
  const role = user?.role?.trim().toUpperCase() ?? '';
  const externalId = user?.externalId ?? '';

  const isDriver = role === 'DRIVER';
  const isAdmin = role === 'ADMINISTRATOR';
  const isDispatcherLike = DISPATCHER_ROLES.includes(role);

  const limit = params?.limit ?? 20;
  // Drivers must see both active and inactive offers (inactive shown with red border)
  const defaultStatus = isDriver ? undefined : (params?.status ?? 'active');
  const baseParams: Omit<GetOffersParams, 'page'> = {
    limit,
    status: params?.status ?? defaultStatus,
    sort_order: params?.sort_order ?? 'action_time_asc',
    is_expired: params?.is_expired,
    user_id: params?.user_id,
    driver_id: params?.driver_id,
  };

  if (isDriver) {
    if (externalId) {
      baseParams.driver_id = externalId;
    }
  } else if (isDispatcherLike) {
    if (externalId) {
      baseParams.user_id = externalId;
    }
  }

  const hasAccess = isDriver || isAdmin || isDispatcherLike;
  const queryEnabled =
    authState.isAuthenticated &&
    hasAccess &&
    (isDriver ? !!externalId : true) &&
    (params?.enabled !== false);

  return useInfiniteQuery({
    queryKey: ['offers', 'infinite', baseParams],
    queryFn: ({ pageParam }) =>
      getOffers({ ...baseParams, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { pagination } = lastPage;
      if (pagination.has_next_page && pagination.current_page < pagination.total_pages) {
        return pagination.current_page + 1;
      }
      return undefined;
    },
    staleTime: 60 * 1000,
    enabled: queryEnabled,
  });
}
