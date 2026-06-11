import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { ApplicationReleaseType } from 'expo-application';
import {
  compareAppVersions,
  fetchAppStoreListing,
  fetchGooglePlayListing,
  getDefaultStoreUrls,
} from '@/services/appStoreUpdate';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';
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

async function resolveForceUpdateFromBackend(
  installed: string,
  applicationId: string,
): Promise<Extract<MandatoryIosUpdateState, { phase: 'force' }> | null> {
  const settings = await getResolvedAppLocationSettings();
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
): Promise<Extract<MandatoryIosUpdateState, { phase: 'force' }> | null> {
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
 * Blocks the app when the installed build is older than:
 * 1) the public App Store / Google Play listing, or
 * 2) the server minimumAppVersion from GET /v1/app-settings (admin Next.js UI).
 *
 * Re-checks on cold start, when the app returns to active, and after settings sync.
 */
export function useMandatoryIosAppUpdate(): MandatoryIosUpdateState {
  const [state, setState] = useState<MandatoryIosUpdateState>(() =>
    shouldSkipStoreCheck() ? { phase: 'skip' } : { phase: 'loading' },
  );
  const hasCompletedInitialCheckRef = useRef(false);

  const runChecks = useCallback(async (cancelled: () => boolean) => {
    if (shouldSkipStoreCheck()) {
      if (!cancelled()) setState({ phase: 'skip' });
      return;
    }

    const isRecheck = hasCompletedInitialCheckRef.current;
    if (!isRecheck && !cancelled()) {
      setState({ phase: 'loading' });
    }

    if (Platform.OS === 'ios') {
      try {
        const releaseType = await Application.getIosApplicationReleaseTypeAsync();
        if (
          releaseType === ApplicationReleaseType.SIMULATOR ||
          releaseType === ApplicationReleaseType.DEVELOPMENT
        ) {
          if (!cancelled()) setState({ phase: 'skip' });
          return;
        }
      } catch {
        // Continue with lookup; fail-open if store cannot be reached
      }
    }

    const installed = Application.nativeApplicationVersion ?? '0';
    const applicationId = Application.applicationId ?? '';

    const [backendForce, storeForce] = await Promise.all([
      resolveForceUpdateFromBackend(installed, applicationId),
      resolveForceUpdateFromStore(installed, applicationId),
    ]);

    if (cancelled()) return;

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
      // Foreground: re-check store listing and cached/server minimumAppVersion.
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
