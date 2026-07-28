import { API_BASE_URL } from '@/lib/config';
import { abbreviateStateInLocationString } from '@/utils/formatDriverLocation';
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
  counter_offer?: number | null;
  action_time?: number | null;
  action_time_display?: string | null;
  empty_miles: number | null;
  total_miles: number | null;
}

export interface OfferRoutePoint {
  type: 'pick_up_location' | 'delivery_location';
  location: string;
  time: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface OfferRow {
  id: number;
  active?: boolean;
  is_driver_selected: boolean;
  external_user_id: string | null;
  create_time: string;
  update_time: string;
  update_date?: string | null;
  route?: OfferRoutePoint[] | null;
  loaded_miles: number | null;
  offered_rate: number | null;
  weight: number | null;
  commodity: string | null;
  special_requirements: unknown;
  notes: string | null;
  drivers: OfferDriver[];
}

export function findOfferDriverEntry(
  offer: OfferRow,
  driverExternalId: string,
): OfferDriver | null {
  const id = driverExternalId.trim();
  if (!id) return null;
  return (
    offer.drivers?.find(
      (d) =>
        (d.externalId ?? '').trim() === id || (d.driver_id ?? '').trim() === id,
    ) ?? null
  );
}

/** Offer inactive for driver (red card, no navigation). */
export function isOfferInactiveForDriver(
  offer: OfferRow,
  driverExternalId: string,
): boolean {
  const driverEntry = findOfferDriverEntry(offer, driverExternalId);
  return (
    offer.active === false || driverEntry?.active === false || driverEntry == null
  );
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

export interface EditDriverRatePayload {
  rate: number;
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
  offeredRate?: number;
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

/** First and last locations from route for short display (e.g. "Toledo, OH 43601 → Minnesota City, MN 55959") */
export function routeSummary(
  route: Array<{ location?: string }> | null | undefined
): string {
  if (!Array.isArray(route) || route.length === 0) return '';
  const first = abbreviateStateInLocationString(route[0]?.location ?? '');
  const last =
    route.length > 1
      ? abbreviateStateInLocationString(route[route.length - 1]?.location ?? '')
      : first;
  return last ? `${first} → ${last}` : first;
}

export function buildExtendBidTimePushMessage(offer: Pick<OfferRow, 'id' | 'route'>): string {
  const offerName = routeSummary(offer.route) || `Offer #${offer.id}`;
  return `Please extend the bid time for the offer - ${offerName}`;
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

export interface DriverDraftLoadItem {
  tms_draft_id: number;
  date_created: string;
  date_updated: string;
  pick_up_date: string;
  delivery_date: string;
  offer_id: string;
  offer_numeric_id: number | null;
  offer_name: string;
  driver_rate: number | null;
  loaded_miles: number | null;
}

export interface DriverDraftLoadsResponse {
  items: DriverDraftLoadItem[];
  tms: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    driver_id: number | string;
    project: string;
  };
}

/** Same card rows as driver drafts; TMS meta uses `user_id` for staff. */
export interface StaffDraftLoadsResponse {
  items: DriverDraftLoadItem[];
  tms: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    user_id: number | string;
    project: string;
  };
}

/** TMS draft loads for the current driver, enriched with local offer data (auth: DRIVER only). */
export async function getDriverDraftLoads(params?: {
  page?: number;
  per_page?: number;
}): Promise<DriverDraftLoadsResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const searchParams = new URLSearchParams();
  searchParams.set('project', 'odysseia');
  if (params?.page != null) searchParams.set('page', String(params.page));
  if (params?.per_page != null) searchParams.set('per_page', String(params.per_page));
  const url = `${API_BASE_URL}/v1/offers/driver/draft-loads?${searchParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg =
      typeof errorData.message === 'string'
        ? errorData.message
        : Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : `Failed to load draft loads. Status: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const payload = data.data ?? data;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const tms = payload.tms && typeof payload.tms === 'object' ? payload.tms : {};
  return {
    items: items as DriverDraftLoadItem[],
    tms: {
      total: typeof tms.total === 'number' ? tms.total : items.length,
      page: typeof tms.page === 'number' ? tms.page : 1,
      per_page: typeof tms.per_page === 'number' ? tms.per_page : 50,
      total_pages: typeof tms.total_pages === 'number' ? tms.total_pages : 1,
      driver_id: tms.driver_id ?? '',
      project: typeof tms.project === 'string' ? tms.project : '',
    },
  };
}

/** TMS draft loads for non-driver roles (TMS `user_id` = server user externalId). */
export async function getStaffDraftLoads(params?: {
  is_flt?: 'true' | 'false';
  page?: number;
  per_page?: number;
}): Promise<StaffDraftLoadsResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const searchParams = new URLSearchParams();
  searchParams.set('project', 'odysseia');
  if (params?.is_flt != null) searchParams.set('is_flt', params.is_flt);
  if (params?.page != null) searchParams.set('page', String(params.page));
  if (params?.per_page != null) searchParams.set('per_page', String(params.per_page));
  const url = `${API_BASE_URL}/v1/offers/draft-loads?${searchParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg =
      typeof errorData.message === 'string'
        ? errorData.message
        : Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : `Failed to load draft loads. Status: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const payload = data.data ?? data;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const tms = payload.tms && typeof payload.tms === 'object' ? payload.tms : {};
  return {
    items: items as DriverDraftLoadItem[],
    tms: {
      total: typeof tms.total === 'number' ? tms.total : items.length,
      page: typeof tms.page === 'number' ? tms.page : 1,
      per_page: typeof tms.per_page === 'number' ? tms.per_page : 100,
      total_pages: typeof tms.total_pages === 'number' ? tms.total_pages : 1,
      user_id: tms.user_id ?? '',
      project: typeof tms.project === 'string' ? tms.project : '',
    },
  };
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

export async function editDriverRateForOfferDriver(
  offerId: number,
  driverExternalId: string,
  payload: EditDriverRatePayload
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
        `Failed to edit driver rate. Status: ${response.status}`
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

export type RespondCounterOfferAction = 'accept' | 'decline';

export interface RespondDriverCounterOfferResponse {
  offer_id: number;
  driver_id: string;
  rate: number | null;
  counter_offer: number | null;
  action: RespondCounterOfferAction;
}

export async function respondDriverCounterOffer(
  offerId: number,
  driverExternalId: string,
  action: RespondCounterOfferAction
): Promise<RespondDriverCounterOfferResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${API_BASE_URL}/v1/offers/${offerId}/drivers/${encodeURIComponent(
    driverExternalId
  )}/counter-offer/respond`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errors = Array.isArray(data?.errors) ? data.errors : [];
    throw new Error(
      (typeof errors[0] === 'string' && errors[0]) ||
        (data && (data.error || data.message)) ||
        `Failed to ${action} counter offer. Status: ${response.status}`
    );
  }

  return data as RespondDriverCounterOfferResponse;
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
