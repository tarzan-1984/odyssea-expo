import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { ApplicationReleaseType } from 'expo-application';
import {
  compareAppVersions,
  fetchAppStoreListing,
  fetchGooglePlayListing,
  getDefaultStoreUrls,
} from '@/services/appStoreUpdate';
import {
  getResolvedAppLocationSettings,
  syncAppLocationSettingsFromBackend,
  type AppLocationSettingsStored,
} from '@/utils/appLocationSettings';
import { eventBus, AppEvents } from '@/services/EventBus';

export type MandatoryIosUpdateState =
  | { phase: 'skip' }
  | { phase: 'loading' }
  | { phase: 'ok' }
  | {
      phase: 'force';
      storeUrl: string;
      fallbackStoreUrl?: string;
      storeName: 'App Store' | 'Google Play';
    };

function shouldSkipStoreCheck(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return true;
  }
  if (__DEV__) {
    return true;
  }
  if (Constants.appOwnership === 'expo') {
    return true;
  }
  return false;
}

function isInstalledBelowMinimum(installed: string, minimum: string): boolean {
  const min = minimum.trim();
  if (!min) return false;
  return compareAppVersions(installed, min) < 0;
}

function isAllowedByServerMinimum(
  installed: string,
  minimumAppVersion: string,
): boolean {
  const min = minimumAppVersion.trim();
  if (!min) return false;
  return !isInstalledBelowMinimum(installed, min);
}

async function refreshCachedSettingsForVersionCheck(): Promise<AppLocationSettingsStored> {
  try {
    const token = await AsyncStorage.getItem('@user_access_token');
    if (token) {
      await syncAppLocationSettingsFromBackend(token, undefined, { emitEvents: false });
    }
  } catch {
    // Best-effort: use cached AsyncStorage when the network request fails.
  }
  return getResolvedAppLocationSettings();
}

async function resolveForceUpdateFromBackend(
  installed: string,
  applicationId: string,
  settings: AppLocationSettingsStored,
): Promise<Extract<MandatoryIosUpdateState, { phase: 'force' }> | null> {
  if (!isInstalledBelowMinimum(installed, settings.minimumAppVersion)) {
    return null;
  }

  // Insurance gate: minimumAppVersion from admin (Next.js app settings).
  if (Platform.OS === 'ios') {
    const listing = await fetchAppStoreListing(applicationId);
    if (listing?.trackViewUrl) {
      return {
        phase: 'force',
        storeUrl: listing.trackViewUrl,
        storeName: 'App Store',
      };
    }
  }

  const defaults = getDefaultStoreUrls(applicationId);
  if (!defaults) return null;

  return {
    phase: 'force',
    storeUrl: defaults.storeUrl,
    fallbackStoreUrl: defaults.fallbackStoreUrl,
    storeName: defaults.storeName,
  };
}

async function resolveForceUpdateFromStore(
  installed: string,
  applicationId: string,
  minimumAppVersion: string,
): Promise<Extract<MandatoryIosUpdateState, { phase: 'force' }> | null> {
  const min = minimumAppVersion.trim();
  // Without an admin minimum, store HTML can mention unreleased builds (Play Console).
  // Force-update is driven by minimumAppVersion; skip unreliable store scraping when unset.
  if (!min) {
    return null;
  }

  // When admin sets minimumAppVersion, installed builds at or above it stay usable
  // even if Play/App Store HTML already mentions an unreleased newer build.
  if (isAllowedByServerMinimum(installed, min)) {
    return null;
  }

  if (Platform.OS === 'ios') {
    const listing = await fetchAppStoreListing(applicationId);
    if (!listing) return null;
    if (compareAppVersions(installed, listing.version) < 0) {
      return {
        phase: 'force',
        storeUrl: listing.trackViewUrl,
        storeName: 'App Store',
      };
    }
    return null;
  }

  const listing = await fetchGooglePlayListing(applicationId);
  if (!listing) return null;
  if (compareAppVersions(installed, listing.version) < 0) {
    return {
      phase: 'force',
      storeUrl: listing.marketUrl,
      fallbackStoreUrl: listing.webUrl,
      storeName: 'Google Play',
    };
  }
  return null;
}

/**
 * Blocks the app when the installed build is older than the server minimumAppVersion
 * from GET /v1/app-settings (admin Next.js UI).
 *
 * When minimumAppVersion is set, builds at or above it skip the store listing check
 * so unreleased uploads (e.g. 2.2.0 in Play Console) do not block production users.
 *
 * Re-checks on cold start, when the app returns to active, and after settings sync.
 * Each run refreshes settings from the backend (when logged in) before evaluating the gate.
 */
export function useMandatoryIosAppUpdate(): MandatoryIosUpdateState {
  const [state, setState] = useState<MandatoryIosUpdateState>(() =>
    shouldSkipStoreCheck() ? { phase: 'skip' } : { phase: 'loading' },
  );
  const hasCompletedInitialCheckRef = useRef(false);
  const checkGenerationRef = useRef(0);

  const runChecks = useCallback(async (cancelled: () => boolean) => {
    const generation = ++checkGenerationRef.current;
    const isStale = () => cancelled() || generation !== checkGenerationRef.current;

    if (shouldSkipStoreCheck()) {
      if (!isStale()) setState({ phase: 'skip' });
      return;
    }

    const isRecheck = hasCompletedInitialCheckRef.current;
    if (!isRecheck && !isStale()) {
      setState({ phase: 'loading' });
    }

    if (Platform.OS === 'ios') {
      try {
        const releaseType = await Application.getIosApplicationReleaseTypeAsync();
        if (
          releaseType === ApplicationReleaseType.SIMULATOR ||
          releaseType === ApplicationReleaseType.DEVELOPMENT
        ) {
          if (!isStale()) setState({ phase: 'skip' });
          return;
        }
      } catch {
        // Continue with lookup; fail-open if store cannot be reached
      }
    }

    if (isStale()) return;

    const installed = Application.nativeApplicationVersion ?? '0';
    const applicationId = Application.applicationId ?? '';
    const settings = await refreshCachedSettingsForVersionCheck();

    if (isStale()) return;

    const [backendForce, storeForce] = await Promise.all([
      resolveForceUpdateFromBackend(installed, applicationId, settings),
      resolveForceUpdateFromStore(installed, applicationId, settings.minimumAppVersion),
    ]);

    if (isStale()) return;

    hasCompletedInitialCheckRef.current = true;
    const force = backendForce ?? storeForce;
    setState(force ?? { phase: 'ok' });
  }, []);

  useEffect(() => {
    if (shouldSkipStoreCheck()) {
      setState({ phase: 'skip' });
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    // Cold start: first check as soon as the gate mounts.
    void runChecks(isCancelled);

    const requestRecheck = () => {
      void runChecks(isCancelled);
    };

    const unsubscribeSettings = eventBus.on('APP_LOCATION_SETTINGS_SYNCED', requestRecheck);
    const unsubscribeUpdateCheck = eventBus.on(AppEvents.AppUpdateCheckRequested, requestRecheck);

    let appState: AppStateStatus = AppState.currentState;
    const appStateSub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // Foreground: refresh server minimumAppVersion, then re-evaluate the gate.
      if (nextAppState === 'active' && appState.match(/inactive|background/)) {
        requestRecheck();
      }
      appState = nextAppState;
    });

    return () => {
      cancelled = true;
      unsubscribeSettings();
      unsubscribeUpdateCheck();
      appStateSub.remove();
    };
  }, [runChecks]);

  return state;
}
