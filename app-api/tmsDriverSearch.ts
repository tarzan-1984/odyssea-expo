/**
 * TMS driver search — same query contract as Next.js GET /api/users/drivers/search
 * (proxies to endurance-tms driver/search).
 */

const DEFAULT_TMS_SEARCH_URL =
  'https://www.endurance-tms.com/wp-json/tms/v1/driver/search';

export interface TmsDriverMeta {
  driver_status?: string;
  current_city?: string;
  current_location?: string;
  current_zipcode?: string;
  status_date?: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  languages?: string;
  vehicle_type?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  dimensions?: string;
  payload?: string;
  notes?: string;
  twic?: string;
  hazmat_certificate?: string;
  team_driver_enabled?: string;
  driver_licence_type?: string;
  hazmat_endorsement?: string;
  change_9_training?: string;
  tanker_endorsement?: string;
  background_check?: string;
  lift_gate?: string;
  pallet_jack?: string;
  dock_high?: string;
  e_tracks?: string;
  load_bars?: string;
  ramp?: string;
  sleeper?: string;
  printer?: string;
  side_door?: string;
  macro_point?: string;
  trucker_tools?: string;
  [key: string]: unknown;
}

export interface TmsDriver {
  id: string;
  date_available?: string | null;
  date_updated?: string;
  updated_zipcode?: string;
  meta_data?: TmsDriverMeta;
  rating?: { avg_rating: number; count: number };
  notes?: { count: number };
}

export interface TmsDriversSearchPage {
  data: {
    results: TmsDriver[];
    pagination: {
      current_page: number;
      total_pages: number;
      total_posts: number;
    };
    has_distance_data?: boolean;
    id_posts?: Record<string, { distance?: string | number }>;
  };
}

export interface TmsDriverSearchQueryParams {
  currentPage: number;
  itemsPerPage: number;
  capabilitiesFilter: string[];
  addressFilter: string;
  radiusFilter: string;
  locationFilter: 'USA' | 'Canada';
  statusFilter: string;
  /** Logged-in user role (lowercase); if truthy, Next sends role=administrator to TMS */
  role: string;
}

function getTmsSearchUrl(): string {
  return (
    process.env.EXPO_PUBLIC_TMS_DRIVER_SEARCH_URL?.trim() || DEFAULT_TMS_SEARCH_URL
  );
}

function getTmsApiKey(): string {
  return process.env.EXPO_PUBLIC_TMS_API_KEY?.trim() || 'tms_api_key_2024_driver_access';
}

export async function fetchTmsDriversPage(
  params: TmsDriverSearchQueryParams
): Promise<TmsDriversSearchPage> {
  const {
    currentPage,
    itemsPerPage,
    capabilitiesFilter,
    addressFilter,
    radiusFilter,
    locationFilter,
    statusFilter,
    role,
  } = params;

  const searchParams = new URLSearchParams();
  searchParams.set('paged', String(currentPage));
  searchParams.set('per_page_loads', String(itemsPerPage));

  if (capabilitiesFilter.length) {
    searchParams.set('capabilities', capabilitiesFilter.join(','));
  }

  if (role?.trim()) {
    searchParams.set('role', 'administrator');
  }

  if (addressFilter?.trim() && radiusFilter && locationFilter) {
    searchParams.set('my_search', addressFilter.trim());
    searchParams.set('radius', radiusFilter);
    searchParams.set('country', locationFilter);
  }

  const trimmedStatus = statusFilter?.trim() ?? '';
  // "all" / empty → omit status_filter (same as Next.js resolveStatusFilterForQuery)
  if (trimmedStatus && trimmedStatus !== 'all') {
    searchParams.set('status_filter', trimmedStatus);
  }

  const url = `${getTmsSearchUrl()}?${searchParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': getTmsApiKey(),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg =
      (data as { message?: string })?.message ||
      (data as { error?: string })?.error ||
      `TMS driver search failed (${response.status})`;
    throw new Error(msg);
  }

  const root = data as Record<string, unknown>;
  const inner = (root.data as Record<string, unknown> | undefined) ?? root;
  const results = (inner.results as TmsDriver[]) ?? [];
  const pagination = (inner.pagination as TmsDriversSearchPage['data']['pagination']) ?? {
    current_page: 1,
    total_pages: 1,
    total_posts: results.length,
  };

  return {
    data: {
      results,
      pagination,
      has_distance_data: inner.has_distance_data as boolean | undefined,
      id_posts: inner.id_posts as TmsDriversSearchPage['data']['id_posts'],
    },
  };
}
