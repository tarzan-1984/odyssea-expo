import { useQuery } from '@tanstack/react-query';
import {
  getUserByExternalIdFromBackend,
  type BackendUserByExternalId,
} from '@/app-api/users';

const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function useUserByExternalId(externalId: string | undefined): {
  data: BackendUserByExternalId | null | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const id = (externalId ?? '').trim();
  const enabled = id.length > 0;

  const query = useQuery({
    queryKey: ['userByExternalId', id],
    queryFn: async () => getUserByExternalIdFromBackend(id),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 2,
    enabled,
    retry: 1,
  });

  return {
    data: query.data,
    isLoading: enabled && query.isPending,
    error: query.error as Error | null,
  };
}
