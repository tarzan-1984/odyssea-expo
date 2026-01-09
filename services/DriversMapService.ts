import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

const DRIVERS_CACHE_KEY = '@drivers_cache';
const DRIVERS_LAST_UPDATE_KEY = '@drivers_last_update';
const UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (temporarily changed from 10 minutes)
const PAGE_SIZE = 100;

export interface DriverForMap {
  id: string;
  externalId: string | null;
  latitude: number;
  longitude: number;
  driverStatus: string | null;
}

interface DriversMapResponse {
  drivers: DriverForMap[];
  pagination?: {
    current_page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
    has_next_page: boolean;
    has_prev_page: boolean;
  };
}

/**
 * Check if drivers cache should be updated (based on last update timestamp and cache content).
 * @param force - If true, always return true (bypass all checks)
 */
export async function shouldUpdateDriversCache(force: boolean = false): Promise<boolean> {
  if (force) {
    return true;
  }
  
  try {
    // First check if cache has any data
    const cached = await AsyncStorage.getItem(DRIVERS_CACHE_KEY);
    if (!cached) {
      return true;
    }
    
    const parsed = JSON.parse(cached) as DriverForMap[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return true;
    }
    
    // Then check timestamp
    const ts = await AsyncStorage.getItem(DRIVERS_LAST_UPDATE_KEY);
    if (!ts) {
      return true;
    }
    const last = parseInt(ts, 10);
    if (Number.isNaN(last)) {
      return true;
    }
    const age = Date.now() - last;
    const needsUpdate = age >= UPDATE_INTERVAL_MS;
    return needsUpdate;
  } catch (error) {
    // On any error, treat as needing update
    return true;
  }
}

/**
 * Get drivers from local cache (AsyncStorage).
 */
export async function getCachedDriversForMap(): Promise<DriverForMap[]> {
  try {
    const cached = await AsyncStorage.getItem(DRIVERS_CACHE_KEY);
    if (!cached) {
      return [];
    }
    const parsed = JSON.parse(cached) as DriverForMap[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    return [];
  }
}

/**
 * Sync all drivers for map from backend with pagination.
 * Runs a series of paginated requests and updates both cache and optional UI callback incrementally.
 *
 * @param accessToken - Access token for Authorization header
 * @param onPageLoaded - Optional callback invoked for each loaded page of drivers
 * @param force - If true, bypasses cache freshness check (used for first sync after login)
 */
export async function syncDriversForMap(
  accessToken: string,
  onPageLoaded?: (drivers: DriverForMap[]) => void,
  force: boolean = false,
): Promise<void> {
  if (!API_BASE_URL) {
    console.warn('[DriversMapService] ⚠️ API_BASE_URL is not configured, skipping sync');
    return;
  }

  console.log('[DriversMapService] 🚀 Starting drivers sync process...');
  const syncStartTime = Date.now();
  let page = 1;
  let hasNext = true;
  const allDrivers: DriverForMap[] = [];
  let totalPages = 0;
  let totalCount = 0;

  try {
    while (hasNext) {
      // Check if app is in background - skip requests if so
      const appState = AppState.currentState;
      if (appState !== 'active') {
        // Save partial data before pausing
        if (allDrivers.length > 0) {
          try {
            await AsyncStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(allDrivers));
          } catch (saveError) {
            // Silent fail
          }
        }
        
        // Break the loop - sync will resume when app becomes active again
        break;
      }
      
      const url = `${API_BASE_URL}/v1/users/drivers/map?page=${page}&limit=${PAGE_SIZE}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        break;
      }

      const responseData = (await response.json()) as { data: DriversMapResponse; timestamp?: string; path?: string };
      
      // Backend wraps response in { data: {...}, timestamp, path } due to TransformInterceptor
      const data = responseData.data || responseData as any;
      const pageDrivers = Array.isArray(data?.drivers) ? data.drivers : [];

      // Filter out invalid coordinates just in case
      const validDrivers = pageDrivers.filter(
        (d) =>
          typeof d.latitude === 'number' &&
          typeof d.longitude === 'number' &&
          !Number.isNaN(d.latitude) &&
          !Number.isNaN(d.longitude),
      );

      allDrivers.push(...validDrivers);

      // Incremental UI update
      if (onPageLoaded && validDrivers.length > 0) {
        onPageLoaded(validDrivers);
      }

      const pagination = data?.pagination;
      if (pagination) {
        totalPages = pagination.total_pages || 0;
        totalCount = pagination.total_count || 0;
        
        if (typeof pagination.has_next_page === 'boolean') {
          hasNext = pagination.has_next_page;
          const nextPage = (pagination.current_page || page) + 1;
          page = nextPage;
        } else {
          hasNext = false;
        }
      } else {
        // Fallback: stop if we received less than page size
        hasNext = validDrivers.length === PAGE_SIZE;
        page += 1;
      }

      // Small delay between requests to avoid stressing backend
      if (hasNext) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    const syncEndTime = Date.now();
    const syncDuration = syncEndTime - syncStartTime;
    
    // Save final cache
    await AsyncStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(allDrivers));
    await AsyncStorage.setItem(DRIVERS_LAST_UPDATE_KEY, Date.now().toString());
    
    console.log(`[DriversMapService] Total drivers: ${allDrivers.length}`);
  } catch (error) {
    const syncEndTime = Date.now();
    const syncDuration = syncEndTime - syncStartTime;
    
    // Save partial data if we collected any drivers before the error
    // This is especially important when app goes to background during sync
    if (allDrivers.length > 0) {
      try {
        await AsyncStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(allDrivers));
        // Don't update last update timestamp if sync failed - will retry next time
      } catch (saveError) {
        // Silent fail
      }
    }
    
    // Do not throw further to avoid breaking login flow
  }
}

/**
 * Helper to start sync after login for non-DRIVER users.
 * Tries to use provided accessToken, falls back to stored one if needed.
 * Always performs full sync after login with force=true (ignores cache freshness check).
 */
export async function syncDriversForMapAfterLogin(
  accessTokenFromLogin?: string,
  onPageLoaded?: (drivers: DriverForMap[]) => void,
): Promise<void> {
  try {
    let token: string | null | undefined = accessTokenFromLogin;

    // Fallback: try get from AsyncStorage or secureStorage if not provided
    if (!token) {
      try {
        const cachedToken = await AsyncStorage.getItem('@user_access_token');
        if (cachedToken) {
          token = cachedToken;
        }
      } catch (error) {
        // Silent fail
      }
    }

    if (!token) {
      token = await secureStorage.getItemAsync('accessToken');
      if (!token) {
        return;
      }
    }

    // Ensure token is string before passing to syncDriversForMap
    if (!token) {
      return;
    }

    // After login, always perform full sync with force=true (ignore cache freshness)
    // This ensures we get all drivers on first login
    await syncDriversForMap(token, onPageLoaded, true); // Pass force=true
  } catch (error) {
    // Silent fail
  }
}


