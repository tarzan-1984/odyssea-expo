import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { ApplicationReleaseType } from 'expo-application';
import { compareAppVersions, fetchAppStoreListing } from '@/services/appStoreUpdate';

export type MandatoryIosUpdateState =
  | { phase: 'skip' }
  | { phase: 'loading' }
  | { phase: 'ok' }
  | { phase: 'force'; storeUrl: string };

function shouldSkipIosStoreCheck(): boolean {
  if (Platform.OS !== 'ios') {
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

/**
 * Loads the version currently offered on the App Store and blocks the app if the installed
 * build is older. TestFlight-only builds do not affect the lookup, and installs newer than
 * the store (e.g. TF testers) do not trigger the gate (semver: installed < store only).
 */
export function useMandatoryIosAppUpdate(): MandatoryIosUpdateState {
  const [state, setState] = useState<MandatoryIosUpdateState>(() =>
    shouldSkipIosStoreCheck() ? { phase: 'skip' } : { phase: 'loading' },
  );

  useEffect(() => {
    if (shouldSkipIosStoreCheck()) {
      setState({ phase: 'skip' });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const releaseType = await Application.getIosApplicationReleaseTypeAsync();
        if (
          releaseType === ApplicationReleaseType.SIMULATOR ||
          releaseType === ApplicationReleaseType.DEVELOPMENT
        ) {
          if (!cancelled) setState({ phase: 'skip' });
          return;
        }
      } catch {
        // Continue with lookup; fail-open if store cannot be reached
      }

      const bundleId = Application.applicationId ?? '';
      const listing = await fetchAppStoreListing(bundleId);
      if (cancelled) return;

      if (!listing) {
        setState({ phase: 'ok' });
        return;
      }

      const installed = Application.nativeApplicationVersion ?? '0';
      if (compareAppVersions(installed, listing.version) < 0) {
        setState({ phase: 'force', storeUrl: listing.trackViewUrl });
      } else {
        setState({ phase: 'ok' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
