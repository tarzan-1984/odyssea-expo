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
  active: boolean;
  is_selected: boolean;
  rate: number | null;
  action_time?: number | null;
  action_time_display?: string | null;
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
  is_driver_selected: boolean;
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
  status?: 'active' | 'inactive' | 'assigned';
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

export interface SetDriverRatePayload {
  rate: number;
  rateTimeMinutes: number;
  driverEta: string;
}

export interface ExtendDriverTimePayload {
  extendTimeMinutes: number;
}

export interface SetDriverRateResponse {
  offer_id: number;
  driver_id: string;
  rate: number | null;
  driver_eta: string | null;
  action_time: number | null;
  action_time_display: string | null;
}

export interface RemoveDriverFromOfferResponse {
  success: boolean;
  message?: string;
}

export interface SelectDriverForOfferResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DeactivateOfferResponse {
  success: boolean;
  error?: string;
}

export interface CreateOfferPayload {
  externalId?: string;
  driverIds: string[];
  route: OfferRoutePoint[];
  loadedMiles: number;
  driverEmptyMiles?: Record<string, number>;
  weight: number;
  commodity?: string;
  specialRequirements?: string[];
  notes?: string;
}

export interface CreateOfferResult {
  success: boolean;
  data?: { id: number; [key: string]: unknown };
  error?: string;
  errors?: string[];
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

export interface DriverParticipationCountResponse {
  count: number;
}

export async function getDriverParticipationCount(): Promise<DriverParticipationCountResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/driver-participation-count`;
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
      errorData.message ||
        `Failed to fetch driver participation count. Status: ${response.status}`
    );
  }

  const data = await response.json();
  const payload = data.data ?? data;
  return { count: payload.count ?? 0 };
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

export async function getOfferById(
  offerId: number,
  driverId?: string
): Promise<OfferRow> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const searchParams = new URLSearchParams();
  if (driverId != null && driverId !== '') {
    searchParams.set('driver_id', driverId);
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  const payload = data.data ?? data;

  if (!response.ok) {
    throw new Error(
      (payload && (payload.error || payload.message)) ||
        `Failed to fetch offer. Status: ${response.status}`
    );
  }

  return payload as OfferRow;
}

export async function setDriverRateForOfferDriver(
  offerId: number,
  driverExternalId: string,
  payload: SetDriverRatePayload
): Promise<SetDriverRateResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}/drivers/${encodeURIComponent(
    driverExternalId
  )}/rate`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data && (data.error || data.message)) ||
        `Failed to set driver rate. Status: ${response.status}`
    );
  }

  return data as SetDriverRateResponse;
}

export async function extendDriverTimeForOfferDriver(
  offerId: number,
  driverExternalId: string,
  payload: ExtendDriverTimePayload
): Promise<SetDriverRateResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}/drivers/${encodeURIComponent(
    driverExternalId
  )}/extend-time`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data && (data.error || data.message)) ||
        `Failed to extend driver time. Status: ${response.status}`
    );
  }

  return data as SetDriverRateResponse;
}

export async function removeDriverFromOfferDriver(
  offerId: number,
  driverExternalId: string
): Promise<RemoveDriverFromOfferResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}/drivers/${encodeURIComponent(
    driverExternalId
  )}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data && (data.error || data.message)) ||
        `Failed to decline offer. Status: ${response.status}`
    );
  }

  return data as RemoveDriverFromOfferResponse;
}

export interface ReturnDriverToOfferResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function returnDriverToOffer(
  offerId: number,
  driverExternalId: string
): Promise<ReturnDriverToOfferResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}/drivers/${encodeURIComponent(
    driverExternalId
  )}/return`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data && (data.error || data.message)) ||
        `Failed to return driver. Status: ${response.status}`
    );
  }

  const payload = data.data ?? data;
  return {
    success: payload?.success ?? true,
    message: payload?.message,
  };
}

export async function selectDriverForOffer(
  offerId: number,
  driverExternalId: string
): Promise<SelectDriverForOfferResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}/drivers/${encodeURIComponent(
    driverExternalId
  )}/select`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data && (data.error || data.message)) ||
        `Failed to select driver. Status: ${response.status}`
    );
  }

  const payload = data.data ?? data;
  return {
    success: payload?.success ?? true,
    message: payload?.message,
  };
}

/**
 * Create offer (Nest POST /v1/offers) — same payload as Next.js /api/offers/create proxy.
 */
export async function createOffer(payload: CreateOfferPayload): Promise<CreateOfferResult> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (response.ok) {
    const inner = (data as { data?: unknown }).data ?? data;
    return {
      success: true,
      data: inner as { id: number },
    };
  }

  const err = data as { message?: string; error?: string; errors?: string[] };
  const errorMsg = err?.message ?? err?.error ?? 'Failed to create offer';
  const details =
    Array.isArray(err?.errors) && err.errors.length > 0 ? err.errors.join('. ') : '';
  return {
    success: false,
    error: details ? `${errorMsg}: ${details}` : errorMsg,
    errors: err?.errors,
  };
}

export async function deactivateOffer(offerId: number): Promise<DeactivateOfferResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/offers/${offerId}/deactivate-offer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (data && (data.error || data.message)) ||
        `Failed to deactivate offer. Status: ${response.status}`
    );
  }

  const payload = data.data ?? data;
  return { success: payload?.success ?? true };
}
