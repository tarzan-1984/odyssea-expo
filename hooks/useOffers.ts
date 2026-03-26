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
  const externalIdTrimmed = externalId.trim();

  // Set user_id / driver_id only inside role branches so staff never inherit a stray params.user_id
  // and never call the API without user_id (backend would return all offers — wrong for dispatchers).
  const baseParams: Omit<GetOffersParams, 'page'> = {
    limit,
    status: params?.status ?? defaultStatus,
    sort_order: params?.sort_order ?? 'action_time_asc',
    is_expired: params?.is_expired,
  };

  if (isDriver) {
    baseParams.driver_id = externalIdTrimmed || undefined;
    baseParams.user_id = undefined;
  } else if (isAdmin) {
    // Administrator: all offers, or filter by creator external id (same as Next.js User filter)
    const uid = (params?.user_id ?? '').trim();
    baseParams.user_id = uid !== '' ? uid : undefined;
    baseParams.driver_id = undefined;
  } else {
    // Dispatcher-like: only offers they created (external_user_id on offer = their TMS external id)
    baseParams.user_id = externalIdTrimmed !== '' ? externalIdTrimmed : undefined;
    baseParams.driver_id = undefined;
  }

  const hasAccess = isDriver || isAdmin || isDispatcherLike;
  const needsExternalIdForScope = isDriver || isDispatcherLike;
  const queryEnabled =
    authState.isAuthenticated &&
    hasAccess &&
    (needsExternalIdForScope ? externalIdTrimmed !== '' : true) &&
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
