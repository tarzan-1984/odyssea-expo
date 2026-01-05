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
 * Check if drivers cache should be updated (based on last update timestamp).
 */
export async function shouldUpdateDriversCache(): Promise<boolean> {
  try {
    const ts = await AsyncStorage.getItem(DRIVERS_LAST_UPDATE_KEY);
    if (!ts) {
      console.log('[DriversMapService] ⚠️ No last update timestamp found, cache needs update');
      return true;
    }
    const last = parseInt(ts, 10);
    if (Number.isNaN(last)) {
      console.log('[DriversMapService] ⚠️ Invalid last update timestamp, cache needs update');
      return true;
    }
    const age = Date.now() - last;
    const ageMinutes = Math.floor(age / 60000);
    const needsUpdate = age >= UPDATE_INTERVAL_MS;
    if (needsUpdate) {
      console.log(`[DriversMapService] ⏰ Cache is ${ageMinutes} minutes old (threshold: 2 minutes), needs update`);
    } else {
      console.log(`[DriversMapService] ✅ Cache is ${ageMinutes} minutes old, still fresh`);
    }
    return needsUpdate;
  } catch (error) {
    console.warn('[DriversMapService] ⚠️ Error checking cache age:', error);
    // On any error, treat as needing update
    return true;
  }
}

/**
 * Get drivers from local cache (AsyncStorage).
 */
export async function getCachedDriversForMap(): Promise<DriverForMap[]> {
  try {
    console.log('[DriversMapService] 📖 Reading cached drivers from AsyncStorage...');
    const cached = await AsyncStorage.getItem(DRIVERS_CACHE_KEY);
    if (!cached) {
      console.log('[DriversMapService] ⚠️ No cached drivers found');
      return [];
    }
    const parsed = JSON.parse(cached) as DriverForMap[];
    if (!Array.isArray(parsed)) {
      console.warn('[DriversMapService] ⚠️ Cached data is not an array');
      return [];
    }
    console.log(`[DriversMapService] ✅ Loaded ${parsed.length} drivers from cache`);
    return parsed;
  } catch (error) {
    console.error('[DriversMapService] ❌ Failed to read cached drivers:', error);
    return [];
  }
}

/**
 * Sync all drivers for map from backend with pagination.
 * Runs a series of paginated requests and updates both cache and optional UI callback incrementally.
 *
 * @param accessToken - Access token for Authorization header
 * @param onPageLoaded - Optional callback invoked for each loaded page of drivers
 */
export async function syncDriversForMap(
  accessToken: string,
  onPageLoaded?: (drivers: DriverForMap[]) => void,
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
        console.log(`[DriversMapService] ⏸️ App is in ${appState} state, pausing sync...`);
        console.log(`[DriversMapService] 💾 Saving ${allDrivers.length} drivers collected so far...`);
        
        // Save partial data before pausing
        if (allDrivers.length > 0) {
          try {
            await AsyncStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(allDrivers));
            console.log(`[DriversMapService] ✅ Saved ${allDrivers.length} drivers to cache`);
          } catch (saveError) {
            console.error('[DriversMapService] ❌ Failed to save partial data:', saveError);
          }
        }
        
        // Break the loop - sync will resume when app becomes active again
        console.log('[DriversMapService] ℹ️ Sync paused. Will resume when app becomes active.');
        break;
      }
      
      const url = `${API_BASE_URL}/v1/users/drivers/map?page=${page}&limit=${PAGE_SIZE}`;
      console.log(`[DriversMapService] 📄 Fetching page ${page}...`);
      console.log(`[DriversMapService] 🔗 URL: ${url}`);

      const pageStartTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const pageFetchTime = Date.now() - pageStartTime;
      console.log(`[DriversMapService] ⏱️ Page ${page} fetch time: ${pageFetchTime}ms`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[DriversMapService] ❌ Failed to fetch page ${page}`);
        console.error(`[DriversMapService] Status: ${response.status}`);
        console.error(`[DriversMapService] Error: ${errorText}`);
        break;
      }

      const responseData = (await response.json()) as { data: DriversMapResponse; timestamp?: string; path?: string };
      
      // Backend wraps response in { data: {...}, timestamp, path } due to TransformInterceptor
      const data = responseData.data || responseData as any;
      const pageDrivers = Array.isArray(data?.drivers) ? data.drivers : [];
      
      console.log(`[DriversMapService] ✅ Page ${page} received: ${pageDrivers.length} drivers`);
      console.log(`[DriversMapService] 🔍 Response structure check - has data wrapper: ${!!responseData.data}, drivers count: ${pageDrivers.length}`);

      // Filter out invalid coordinates just in case
      const validDrivers = pageDrivers.filter(
        (d) =>
          typeof d.latitude === 'number' &&
          typeof d.longitude === 'number' &&
          !Number.isNaN(d.latitude) &&
          !Number.isNaN(d.longitude),
      );

      const invalidCount = pageDrivers.length - validDrivers.length;
      if (invalidCount > 0) {
        console.warn(`[DriversMapService] ⚠️ Page ${page}: ${invalidCount} drivers with invalid coordinates filtered out`);
      }

      allDrivers.push(...validDrivers);
      console.log(`[DriversMapService] 📊 Total drivers collected so far: ${allDrivers.length}`);

      // Incremental UI update
      if (onPageLoaded && validDrivers.length > 0) {
        console.log(`[DriversMapService] 🎨 Updating UI with ${validDrivers.length} drivers from page ${page}`);
        onPageLoaded(validDrivers);
      }

      const pagination = data?.pagination;
      if (pagination) {
        totalPages = pagination.total_pages || 0;
        totalCount = pagination.total_count || 0;
        console.log(`[DriversMapService] 📈 Pagination info: page ${pagination.current_page}/${totalPages}, total: ${totalCount}`);
        
        if (typeof pagination.has_next_page === 'boolean') {
          hasNext = pagination.has_next_page;
          page = (pagination.current_page || page) + 1;
        } else {
          hasNext = false;
        }
      } else {
        // Fallback: stop if we received less than page size
        hasNext = validDrivers.length === PAGE_SIZE;
        page += 1;
        console.log(`[DriversMapService] ⚠️ No pagination info, using fallback logic. Has next: ${hasNext}`);
      }

      // Small delay between requests to avoid stressing backend
      if (hasNext) {
        console.log(`[DriversMapService] ⏳ Waiting 300ms before next page...`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    const syncEndTime = Date.now();
    const syncDuration = syncEndTime - syncStartTime;
    
    // Save final cache
    await AsyncStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(allDrivers));
    await AsyncStorage.setItem(DRIVERS_LAST_UPDATE_KEY, Date.now().toString());
    
    console.log('[DriversMapService] ✅ Sync completed successfully!');
    console.log(`[DriversMapService] 📊 Final statistics:`);
    console.log(`[DriversMapService]    - Total drivers: ${allDrivers.length}`);
    console.log(`[DriversMapService]    - Total pages fetched: ${page - 1}`);
    console.log(`[DriversMapService]    - Total count from backend: ${totalCount}`);
    console.log(`[DriversMapService]    - Sync duration: ${syncDuration}ms`);
    console.log(`[DriversMapService]    - Cache saved to AsyncStorage`);
  } catch (error) {
    const syncEndTime = Date.now();
    const syncDuration = syncEndTime - syncStartTime;
    
    // Check if error is network-related
    const isNetworkError = 
      error instanceof TypeError && 
      (error.message?.includes('Network request failed') || 
       error.message?.includes('Failed to fetch') ||
       error.message?.includes('network'));
    
    if (isNetworkError) {
      console.warn('[DriversMapService] ⚠️ Network error detected (app may have been backgrounded)');
    }
    
    console.error('[DriversMapService] ❌ Failed to sync drivers');
    console.error(`[DriversMapService] Error after ${syncDuration}ms:`, error);
    console.error('[DriversMapService] Drivers collected before error:', allDrivers.length);
    
    // Save partial data if we collected any drivers before the error
    // This is especially important when app goes to background during sync
    if (allDrivers.length > 0) {
      try {
        await AsyncStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(allDrivers));
        // Don't update last update timestamp if sync failed - will retry next time
        console.log(`[DriversMapService] 💾 Saved ${allDrivers.length} drivers to cache (partial sync)`);
        console.log('[DriversMapService] ℹ️ Will retry full sync next time cache is checked');
      } catch (saveError) {
        console.error('[DriversMapService] ❌ Failed to save partial data:', saveError);
      }
    }
    
    // Do not throw further to avoid breaking login flow
  }
}

/**
 * Helper to start sync after login for non-DRIVER users.
 * Tries to use provided accessToken, falls back to stored one if needed.
 */
export async function syncDriversForMapAfterLogin(
  accessTokenFromLogin?: string,
  onPageLoaded?: (drivers: DriverForMap[]) => void,
): Promise<void> {
  console.log('[DriversMapService] 🔐 Starting sync after login...');
  try {
    let token: string | null | undefined = accessTokenFromLogin;

    // Fallback: try get from AsyncStorage or secureStorage if not provided
    if (!token) {
      console.log('[DriversMapService] 🔍 Access token not provided, trying to get from cache...');
      try {
        const cachedToken = await AsyncStorage.getItem('@user_access_token');
        if (cachedToken) {
          token = cachedToken;
          console.log('[DriversMapService] ✅ Found access token in AsyncStorage');
        } else {
          console.log('[DriversMapService] ⚠️ Access token not found in AsyncStorage');
        }
      } catch (error) {
        console.warn('[DriversMapService] ⚠️ Failed to read from AsyncStorage:', error);
      }
    } else {
      console.log('[DriversMapService] ✅ Using provided access token');
    }

    if (!token) {
      console.log('[DriversMapService] 🔍 Trying secureStorage...');
      token = await secureStorage.getItemAsync('accessToken');
      if (token) {
        console.log('[DriversMapService] ✅ Found access token in secureStorage');
      } else {
        console.warn('[DriversMapService] ❌ No access token available for sync');
        return;
      }
    }

    // Ensure token is string before passing to syncDriversForMap
    if (!token) {
      console.warn('[DriversMapService] ❌ No access token available for sync');
      return;
    }

    console.log('[DriversMapService] 🔍 Checking if cache needs update...');
    const needsUpdate = await shouldUpdateDriversCache();
    if (!needsUpdate) {
      console.log('[DriversMapService] ✅ Cache is fresh (less than 2 minutes old), skipping sync');
      return;
    }

    console.log('[DriversMapService] 🔄 Cache is stale or missing, starting sync...');
    await syncDriversForMap(token, onPageLoaded);
  } catch (error) {
    console.error('[DriversMapService] ❌ syncDriversForMapAfterLogin error:', error);
  }
}


