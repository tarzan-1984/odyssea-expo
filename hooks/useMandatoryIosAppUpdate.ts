import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
import { eventBus } from '@/services/EventBus';

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

  if (Platform.OS === 'ios') {
    const listing = await fetchAppStoreListing(applicationId);
    if (listing?.trackViewUrl) {
      return {
        phase: 'force',
        storeUrl: listing.trackViewUrl,
        storeName: 'App Store',
      };
    }
    return null;
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
 * Blocks the app when the installed build is older than the public store listing
 * or the server-configured minimumAppVersion (from GET /v1/app-settings).
 */
export function useMandatoryIosAppUpdate(): MandatoryIosUpdateState {
  const [state, setState] = useState<MandatoryIosUpdateState>(() =>
    shouldSkipStoreCheck() ? { phase: 'skip' } : { phase: 'loading' },
  );

  const runChecks = useCallback(async (cancelled: () => boolean) => {
    if (shouldSkipStoreCheck()) {
      if (!cancelled()) setState({ phase: 'skip' });
      return;
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

    void runChecks(isCancelled);

    const unsubscribe = eventBus.on('APP_LOCATION_SETTINGS_SYNCED', () => {
      void runChecks(isCancelled);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runChecks]);

  return state;
}
