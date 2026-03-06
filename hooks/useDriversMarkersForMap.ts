import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { MarkerData } from '@/components/maps/OSMMapView';
import {
  getCachedDriversForMap,
  syncDriversForMap,
  syncDriversForMapAfterLogin,
  shouldUpdateDriversCache,
  DriverForMap,
} from '@/services/DriversMapService';
import { secureStorage } from '@/utils/secureStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';

/**
 * Hook to manage driver markers for map display.
 * - Loads cached drivers on mount
 * - Syncs with backend if cache is stale
 * - Updates markers incrementally as pages are loaded
 * - Handles periodic updates (every 2 minutes - temporarily changed from 10 minutes)
 * - Checks cache when app becomes active (opened or returning from background)
 */
export function useDriversMarkersForMap() {
  const { authState } = useAuth();
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const syncInProgressRef = useRef(false);
  const markersMapRef = useRef<Map<string, MarkerData>>(new Map());
  const firstSyncAfterLoginRef = useRef(true); // Track if this is first sync after login

  /**
   * Convert driver data to marker data format
   */
  const driverToMarker = useCallback((driver: DriverForMap): MarkerData => {
    return {
      coordinate: {
        latitude: driver.latitude,
        longitude: driver.longitude,
      },
      driverStatus: driver.driverStatus,
      driverId: driver.id,
      driverExternalId: driver.externalId,
      status: driver.status,
    };
  }, []);

  /**
   * Add/update drivers to markers state incrementally
   * @param newDrivers - New drivers to add/update
   * @param receivedDriverIds - Set to track driver IDs received in current sync (for cleanup)
   */
  const addDriversToMarkers = useCallback((
    newDrivers: DriverForMap[], 
    receivedDriverIds?: Set<string>
  ) => {
    const updateTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[useDriversMarkersForMap] 🎨 Updating ${newDrivers.length} drivers in markers... [${updateTime}]`);
    
    let updatedCount = 0;
    let addedCount = 0;
    
    // Add/update drivers in map
    newDrivers.forEach((driver) => {
      const key = `${driver.id}`; // Use only id as key to allow updates of same driver
      const existed = markersMapRef.current.has(key);
      
      // Update or add marker
      markersMapRef.current.set(key, driverToMarker(driver));
      
      if (existed) {
        updatedCount++;
      } else {
        addedCount++;
      }
      
      // Track received driver IDs for cleanup
      if (receivedDriverIds) {
        receivedDriverIds.add(driver.id);
      }
    });

    // Convert map to array and update state
    const updatedMarkers = Array.from(markersMapRef.current.values());
    setMarkers(updatedMarkers);
    setTotalDrivers(updatedMarkers.length);
    
    console.log(`[useDriversMarkersForMap] ✅ Markers updated: ${updatedCount} updated, ${addedCount} added. Total: ${updatedMarkers.length} [${updateTime}]`);
  }, [driverToMarker]);

  /**
   * Remove drivers that are not in the received set
   * This is called after all pages are received to clean up removed drivers
   */
  const removeDriversNotInSet = useCallback((receivedDriverIds: Set<string>) => {
    const cleanupTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[useDriversMarkersForMap] 🧹 Cleaning up drivers not in sync... [${cleanupTime}]`);
    let removedCount = 0;
    
    // Get all current driver IDs
    const currentDriverIds = Array.from(markersMapRef.current.keys());
    
    // Remove drivers that were not received in current sync
    currentDriverIds.forEach((driverId) => {
      if (!receivedDriverIds.has(driverId)) {
        markersMapRef.current.delete(driverId);
        removedCount++;
      }
    });
    
    if (removedCount > 0) {
      console.log(`[useDriversMarkersForMap] 🗑️ Removed ${removedCount} drivers that are no longer in sync [${cleanupTime}]`);
      
      // Update state
      const updatedMarkers = Array.from(markersMapRef.current.values());
      setMarkers(updatedMarkers);
      setTotalDrivers(updatedMarkers.length);
    } else {
      console.log(`[useDriversMarkersForMap] ✅ No drivers to remove [${cleanupTime}]`);
    }
  }, []);

  /**
   * Load initial markers from cache
   */
  const loadCachedMarkers = useCallback(async () => {
    console.log('[useDriversMarkersForMap] 📖 Loading cached markers...');
    try {
      const cachedDrivers = await getCachedDriversForMap();
      if (cachedDrivers.length > 0) {
        console.log(`[useDriversMarkersForMap] ✅ Loaded ${cachedDrivers.length} drivers from cache`);
        
        // Initialize markers map
        markersMapRef.current.clear();
        cachedDrivers.forEach((driver) => {
          const key = `${driver.id}`; // Use only id as key
          markersMapRef.current.set(key, driverToMarker(driver));
        });
        
        const initialMarkers = Array.from(markersMapRef.current.values());
        setMarkers(initialMarkers);
        setTotalDrivers(initialMarkers.length);
        console.log(`[useDriversMarkersForMap] ✅ Initial markers set: ${initialMarkers.length}`);
      } else {
        console.log('[useDriversMarkersForMap] ⚠️ No cached drivers found');
      }
    } catch (error) {
      console.error('[useDriversMarkersForMap] ❌ Failed to load cached markers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [driverToMarker]);

  /**
   * Sync drivers from backend
   */
  const syncDrivers = useCallback(async (force = false) => {
    if (syncInProgressRef.current && !force) {
      console.log('[useDriversMarkersForMap] ⏸️ Sync already in progress, skipping...');
      return;
    }

    console.log('[useDriversMarkersForMap] 🔄 Starting sync...');
    syncInProgressRef.current = true;
    setIsSyncing(true);

    try {
      // Get access token
      let accessToken = authState.accessToken;
      if (!accessToken) {
        try {
          const cachedToken = await AsyncStorage.getItem('@user_access_token');
          if (cachedToken) {
            accessToken = cachedToken;
          }
        } catch {
          // ignore
        }
      }

      if (!accessToken) {
        accessToken = await secureStorage.getItemAsync('accessToken');
      }

      if (!accessToken) {
        console.warn('[useDriversMarkersForMap] ❌ No access token available for sync');
        return;
      }

      // Check if update is needed (unless forced)
      if (!force) {
        const needsUpdate = await shouldUpdateDriversCache(false);
        if (!needsUpdate) {
          console.log('[useDriversMarkersForMap] ✅ Cache is fresh, skipping sync');
          return;
        }
      } else {
        console.log('[useDriversMarkersForMap] 🔴 Force sync requested, bypassing cache checks');
      }

      // For periodic sync: update/add drivers incrementally, then clean up removed ones
      // For initial sync: add incrementally for smooth "filling" effect
      // For force sync: clear everything and add fresh
      const isPeriodicSync = !force;
      const receivedDriverIds = new Set<string>(); // Track IDs received in this sync

      // Only clear markers for forced sync (manual refresh)
      if (force) {
        markersMapRef.current.clear();
        setMarkers([]);
        setTotalDrivers(0);
        console.log('[useDriversMarkersForMap] 🧹 Cleared existing markers for forced sync');
      }

      // Sync with incremental updates, pass force flag
      await syncDriversForMap(accessToken, (pageDrivers) => {
        console.log(`[useDriversMarkersForMap] 📄 Received page with ${pageDrivers.length} drivers, updating markers...`);
        // Update/add drivers incrementally, tracking received IDs
        // For periodic sync: update existing or add new, track IDs for cleanup
        // For initial sync: add incrementally for smooth "filling" effect
        addDriversToMarkers(pageDrivers, isPeriodicSync ? receivedDriverIds : undefined);
      }, force);

      // After all pages are received in periodic sync, remove drivers that are no longer in the list
      if (isPeriodicSync && receivedDriverIds.size > 0) {
        const syncCompleteTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.log(`[useDriversMarkersForMap] 📊 Sync complete. Received ${receivedDriverIds.size} drivers. Cleaning up removed drivers... [${syncCompleteTime}]`);
        removeDriversNotInSet(receivedDriverIds);
      }

      // After first sync after login, reset the flag
      if (firstSyncAfterLoginRef.current && force) {
        console.log('[useDriversMarkersForMap] ✅ First sync after login completed, resetting force flag');
        firstSyncAfterLoginRef.current = false;
      }

      const finalSyncTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.log(`[useDriversMarkersForMap] ✅ Sync completed [${finalSyncTime}]`);
    } catch (error) {
      console.error('[useDriversMarkersForMap] ❌ Sync failed:', error);
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [authState.accessToken, addDriversToMarkers, removeDriversNotInSet]);

  /**
   * Initial load: cache first, then sync if needed
   */
  useEffect(() => {
    if (!authState.isAuthenticated) {
      console.log('[useDriversMarkersForMap] ⏸️ User not authenticated, skipping initialization');
      setIsLoading(false);
      // Reset first sync flag when user logs out
      firstSyncAfterLoginRef.current = true;
      return;
    }

    let mounted = true;

    const initialize = async () => {
      console.log('[useDriversMarkersForMap] 🚀 Initializing...');
      
      // Load from cache first (instant display)
      await loadCachedMarkers();

      if (!mounted) return;

      // If this is first sync after login, don't start sync here
      // It will be started by AuthContext with force=true
      if (firstSyncAfterLoginRef.current) {
        console.log('[useDriversMarkersForMap] ⏳ First sync after login - waiting for AuthContext to start sync with force=true');
        // Wait a bit for AuthContext to start sync, then check if it started
        setTimeout(async () => {
          if (!mounted) return;
          // If sync didn't start from AuthContext, start it here with force
          if (firstSyncAfterLoginRef.current) {
            console.log('[useDriversMarkersForMap] 🔄 AuthContext sync not detected, starting sync with force=true...');
            await syncDrivers(true);
          }
        }, 3000); // Wait 3 seconds for AuthContext sync to start
        return;
      }

      // For subsequent syncs, check if update is needed
      const cachedCount = markersMapRef.current.size;
      console.log(`[useDriversMarkersForMap] 📊 Cached drivers count: ${cachedCount}`);
      
      const needsUpdate = await shouldUpdateDriversCache(false);
      
      // If cache is empty or needs update, start sync
      if (cachedCount === 0 || needsUpdate) {
        if (cachedCount === 0) {
          console.log('[useDriversMarkersForMap] 🔄 Cache is empty, starting sync...');
        } else {
          console.log('[useDriversMarkersForMap] 🔄 Cache needs update, starting sync...');
        }
        await syncDrivers(false);
      } else {
        console.log('[useDriversMarkersForMap] ✅ Cache is fresh, no sync needed');
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [authState.isAuthenticated, loadCachedMarkers, syncDrivers]); // Run when authentication state changes

  /**
   * Periodic sync (every 2 minutes - temporarily changed from 10 minutes)
   */
  useEffect(() => {
    if (!authState.isAuthenticated) {
      console.log('[useDriversMarkersForMap] ⏸️ User not authenticated, skipping periodic sync');
      return;
    }

    console.log('[useDriversMarkersForMap] ⏰ Setting up periodic sync (every 2 minutes)...');
    const interval = setInterval(() => {
      console.log('[useDriversMarkersForMap] ⏰ Periodic sync triggered');
      syncDrivers(false); // Periodic sync should not use force
    }, 2 * 60 * 1000); // 2 minutes (temporarily changed from 10 minutes)

    return () => {
      clearInterval(interval);
      console.log('[useDriversMarkersForMap] 🛑 Periodic sync cleared');
    };
  }, [authState.isAuthenticated, syncDrivers]);

  /**
   * Check cache and sync when app becomes active (from background/inactive)
   * This handles:
   * - App opened when user is already logged in
   * - App returning from background to foreground
   */
  useEffect(() => {
    if (!authState.isAuthenticated) {
      return;
    }

    let appState = AppState.currentState;
    let wasInBackground = false;

    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      // Track when app goes to background/inactive
      if (appState.match(/active/) && nextAppState.match(/inactive|background/)) {
        wasInBackground = true;
        console.log('[useDriversMarkersForMap] 📱 App went to background/inactive');
      }

      // When app becomes active again
      if (nextAppState === 'active') {
        if (wasInBackground) {
          console.log('[useDriversMarkersForMap] 📱 App became active after being in background');
          wasInBackground = false;
        } else {
          console.log('[useDriversMarkersForMap] 📱 App became active (opened)');
        }

        // Check if cache needs update
        const needsUpdate = await shouldUpdateDriversCache(false);
        if (needsUpdate) {
          console.log('[useDriversMarkersForMap] 🔄 Cache needs update, starting sync...');
          await syncDrivers(false); // App state sync should not use force
        } else {
          console.log('[useDriversMarkersForMap] ✅ Cache is fresh, no sync needed');
        }
      }

      appState = nextAppState;
    });

    return () => {
      subscription.remove();
      console.log('[useDriversMarkersForMap] 🛑 AppState listener removed');
    };
  }, [authState.isAuthenticated, syncDrivers]);

  return {
    markers,
    isLoading,
    isSyncing,
    totalDrivers,
    syncDrivers: () => syncDrivers(true), // Expose manual sync
  };
}

