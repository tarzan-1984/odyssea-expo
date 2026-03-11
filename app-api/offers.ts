import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

export interface OfferDriver {
  driver_id: string;
  externalId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  rate: number | null;
  action_time?: string | null;
  empty_miles: number | null;
  total_miles: number | null;
}

export interface OfferRoutePoint {
  type: 'pick_up_location' | 'delivery_location';
  location: string;
  time: string;
}

export interface OfferRow {
  id: number;
  active?: boolean;
  external_user_id: string | null;
  create_time: string;
  update_time: string;
  route?: OfferRoutePoint[] | null;
  loaded_miles: number | null;
  weight: number | null;
  commodity: string | null;
  special_requirements: unknown;
  notes: string | null;
  drivers: OfferDriver[];
}

export interface GetOffersParams {
  page?: number;
  limit?: number;
  is_expired?: boolean;
  user_id?: string;
  driver_id?: string;
  sort_order?: 'action_time_asc' | 'action_time_desc';
  status?: 'active' | 'inactive';
}

export interface GetOffersResponse {
  results: OfferRow[];
  pagination: {
    current_page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
    has_next_page: boolean;
    has_prev_page: boolean;
  };
}

/** First and last locations from route for short display (e.g. "Wauseon, Ohio 43567 → Los Angeles, California 90003") */
export function routeSummary(
  route: Array<{ location?: string }> | null | undefined
): string {
  if (!Array.isArray(route) || route.length === 0) return '';
  const first = route[0]?.location ?? '';
  const last =
    route.length > 1 ? route[route.length - 1]?.location ?? '' : first;
  return last ? `${first} → ${last}` : first;
}

export async function getOffers(
  params: GetOffersParams
): Promise<GetOffersResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set('page', String(params.page));
  if (params.limit != null) searchParams.set('limit', String(params.limit));
  if (params.is_expired != null)
    searchParams.set('is_expired', String(params.is_expired));
  if (params.user_id != null && params.user_id !== '')
    searchParams.set('user_id', params.user_id);
  if (params.driver_id != null && params.driver_id !== '')
    searchParams.set('driver_id', params.driver_id);
  if (params.sort_order != null)
    searchParams.set('sort_order', params.sort_order);
  if (params.status != null) searchParams.set('status', params.status);

  const url = `${API_BASE_URL}/v1/offers${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch offers. Status: ${response.status}`
    );
  }

  const data = await response.json();
  // Backend wraps in { data: { results, pagination } }
  const payload = data.data ?? data;
  return {
    results: payload.results ?? [],
    pagination: payload.pagination ?? {
      current_page: 1,
      per_page: 10,
      total_count: 0,
      total_pages: 1,
      has_next_page: false,
      has_prev_page: false,
    },
  };
}
