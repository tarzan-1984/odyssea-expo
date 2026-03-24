import { API_BASE_URL, COMPANY } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DriversMapSearchFilters {
  statusFilter?: string;
  capabilitiesFilter?: string[];
  addressFilter?: string;
  radiusFilter?: string;
  locationFilter?: 'USA' | 'Canada';
  role?: string;
}

interface TmsDriverResult {
  id: string;
  meta_data?: {
    latitude?: string;
    longitude?: string;
    driver_status?: string;
    driver_id?: string;
    current_zipcode?: string;
  };
  organized_data?: {
    current_location?: {
      coordinates?: { lat?: string | number; lng?: string | number };
    };
  };
  status_post?: string;
}

export interface DriverForMap {
  id: string;
  externalId: string | null;
  latitude: number;
  longitude: number;
  driverStatus: string | null;
  status?: string | null;
}

interface DriversSearchPage {
  data?: {
    results?: TmsDriverResult[];
    pagination?: {
      current_page?: number;
      total_pages?: number;
      total_posts?: number;
    };
  };
}

function mapTmsDriverToDriverForMap(driver: TmsDriverResult): DriverForMap | null {
  let lat = parseFloat(String(driver.meta_data?.latitude ?? ''));
  let lng = parseFloat(String(driver.meta_data?.longitude ?? ''));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    const coords = driver.organized_data?.current_location?.coordinates;
    if (coords) {
      lat = typeof coords.lat === 'number' ? coords.lat : parseFloat(String(coords.lat ?? ''));
      lng = typeof coords.lng === 'number' ? coords.lng : parseFloat(String(coords.lng ?? ''));
    }
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return {
    id: driver.id,
    externalId: driver.meta_data?.driver_id ?? driver.id ?? null,
    latitude: lat,
    longitude: lng,
    driverStatus: driver.meta_data?.driver_status ?? null,
    status: driver.status_post ?? null,
  };
}

const TMS_DRIVER_SEARCH_URL = 'https://www.endurance-tms.com/wp-json/tms/v1/driver/search';

/**
 * Fetch drivers page from TMS API directly (same as Next.js /api/users/drivers/search).
 * Next.js proxies to TMS with X-API-Key; we do the same from Expo.
 */
export async function fetchDriversSearchPage(
  params: { currentPage: number } & DriversMapSearchFilters,
  _accessToken: string,
): Promise<{ data: { results: DriverForMap[]; pagination: { current_page: number; total_pages: number } } }> {
  const apiKey = process.env.EXPO_PUBLIC_TMS_API_KEY || 'tms_api_key_2024_driver_access';
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_TMS_API_KEY not configured');
  }

  const searchParams = new URLSearchParams();
  searchParams.set('paged', String(params.currentPage));
  searchParams.set('per_page_loads', '60');
  if (params.capabilitiesFilter?.length) {
    searchParams.set('capabilities', params.capabilitiesFilter.join(','));
  }
  if (params.role) {
    searchParams.set('role', 'administrator');
  }
  // Same logic as Next.js driversListQueryOptions
  if (params.addressFilter && params.radiusFilter && params.locationFilter) {
    searchParams.set('my_search', params.addressFilter);
    searchParams.set('radius', params.radiusFilter);
    searchParams.set('country', params.locationFilter);
  } else if (!params.addressFilter && params.statusFilter) {
    searchParams.set('extended_search', params.statusFilter);
  }

  const url = `${TMS_DRIVER_SEARCH_URL}?${searchParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.message || `TMS drivers search failed: ${response.status}`);
  }

  const raw = (await response.json()) as any;
  // TMS returns: { success, data: { results, pagination } }
  const results: TmsDriverResult[] = Array.isArray(raw?.data?.results) ? raw.data.results : [];
  const pagination =
    raw?.data?.pagination ?? { current_page: params.currentPage, total_pages: 1 };

  const drivers = results
    .map((d) => mapTmsDriverToDriverForMap(d))
    .filter((d): d is DriverForMap => d !== null);

  return {
    data: {
      results: drivers,
      pagination: {
        current_page: pagination.current_page ?? params.currentPage,
        total_pages: pagination.total_pages ?? 1,
      },
    },
  };
}

/**
 * Fetch drivers from /v1/users/drivers/map (our backend) when no address filter.
 * Fallback when TMS search returns empty - our DB has drivers with coordinates.
 */
export async function fetchDriversMapPage(
  params: { currentPage: number },
  accessToken: string,
): Promise<{ data: { results: DriverForMap[]; pagination: { current_page: number; total_pages: number } } }> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL not configured');
  }

  const companyParam = COMPANY ? `&company=${encodeURIComponent(COMPANY)}` : '';
  const url = `${API_BASE_URL}/v1/users/drivers/map?page=${params.currentPage}&limit=100${companyParam}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.message || `Drivers map failed: ${response.status}`);
  }

  const raw = (await response.json()) as { data?: { drivers?: unknown[]; pagination?: { current_page?: number; total_pages?: number; has_next_page?: boolean } } };
  const data = raw.data ?? (raw as any);
  const driversRaw = Array.isArray(data?.drivers) ? data.drivers : [];
  const pagination = data?.pagination ?? { current_page: params.currentPage, total_pages: 1 };

  const drivers: DriverForMap[] = driversRaw
    .filter((d: any) => typeof d?.latitude === 'number' && typeof d?.longitude === 'number')
    .map((d: any) => ({
      id: d.id,
      externalId: d.externalId ?? null,
      latitude: d.latitude,
      longitude: d.longitude,
      driverStatus: d.driverStatus ?? null,
      status: d.status ?? null,
    }));

  return {
    data: {
      results: drivers,
      pagination: {
        current_page: pagination.current_page ?? params.currentPage,
        total_pages: pagination.total_pages ?? 1,
      },
    },
  };
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem('@user_access_token');
    if (cached) return cached;
    return await secureStorage.getItemAsync('accessToken');
  } catch {
    return null;
  }
}
