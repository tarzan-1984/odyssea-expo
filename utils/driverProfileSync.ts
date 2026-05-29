import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import { eventBus } from '@/services/EventBus';
import { fileLogger } from '@/utils/fileLogger';

export type DriverProfileSyncPayload = {
  driverStatus: string | null;
  zip: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  statusDate: string | null;
  isAutoupdate: boolean | null;
  /** When set, persisted to @user_deactivate_account (TMS soft-remove / restore). */
  deactivateAccount?: boolean;
  notificationsEnabled: boolean | null;
};

export const DRIVER_PROFILE_SYNC_LAST_FETCH_KEY = '@driver_profile_sync_last_unix';
export const USER_DEACTIVATE_ACCOUNT_STORAGE_KEY = '@user_deactivate_account';

export async function fetchDriverProfileFromBackend(
  userId: string,
  accessToken: string
): Promise<DriverProfileSyncPayload | null> {
  if (!API_BASE_URL) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/v1/users/${userId}/driver-status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const body = data.data ?? data;
    if (!body || typeof body !== 'object') return null;
    return {
      driverStatus: body.driverStatus ?? null,
      zip: body.zip ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      location: body.location ?? null,
      statusDate: body.statusDate ?? null,
      isAutoupdate:
        typeof body.isAutoupdate === 'boolean' ? body.isAutoupdate : null,
      deactivateAccount:
        typeof body.deactivateAccount === 'boolean'
          ? body.deactivateAccount
          : false,
      notificationsEnabled:
        typeof body.notificationsEnabled === 'boolean'
          ? body.notificationsEnabled
          : null,
    };
  } catch (e) {
    fileLogger.error('driverProfileSync', 'FETCH_FAILED', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Persist server driver profile to AsyncStorage + optional secureStorage user merge.
 */
export async function persistDriverProfileLocally(
  payload: DriverProfileSyncPayload,
  options?: { mergeSecureUser?: boolean }
): Promise<void> {
  const mergeSecure = options?.mergeSecureUser !== false;
  try {
    await AsyncStorage.setItem('@user_status', payload.driverStatus ?? '');

    if (payload.zip !== null) {
      await AsyncStorage.setItem('@user_zip', payload.zip || '');
    }
    if (payload.statusDate !== null) {
      await AsyncStorage.setItem('@user_date', payload.statusDate || '');
    }

    if (typeof payload.deactivateAccount === 'boolean') {
      await AsyncStorage.setItem(
        USER_DEACTIVATE_ACCOUNT_STORAGE_KEY,
        payload.deactivateAccount ? '1' : '0'
      );
    }

    try {
      const settingsStr = await AsyncStorage.getItem('@odyssea_app_settings');
      const settings = settingsStr ? JSON.parse(settingsStr) : {};
      const next = { ...settings };
      if (payload.isAutoupdate !== null) {
        next.automaticLocationSharing = payload.isAutoupdate;
      }
      if (payload.notificationsEnabled !== null) {
        next.notificationsEnabled = payload.notificationsEnabled;
      }
      await AsyncStorage.setItem('@odyssea_app_settings', JSON.stringify(next));
      if (payload.notificationsEnabled !== null) {
        eventBus.emit('NOTIFICATION_PREFERENCES_SYNCED', {
          notificationsEnabled: payload.notificationsEnabled,
        });
      }
    } catch {
      // ignore
    }

    try {
      const locJson = await AsyncStorage.getItem('@user_location');
      if (locJson) {
        const loc = JSON.parse(locJson) as Record<string, unknown>;
        const next = { ...loc };
        if (payload.zip !== null) next.zipCode = payload.zip || '';
        if (payload.city !== null) next.city = payload.city || '';
        if (payload.state !== null) next.state = payload.state || '';
        await AsyncStorage.setItem('@user_location', JSON.stringify(next));
      }
    } catch {
      // ignore
    }

    if (mergeSecure) {
      try {
        const userJson = await secureStorage.getItemAsync('user');
        if (userJson) {
          const u = JSON.parse(userJson) as Record<string, unknown>;
          const next = { ...u };
          next.driverStatus = payload.driverStatus ?? '';
          if (payload.zip !== null) next.zip = payload.zip || '';
          if (payload.city !== null) next.city = payload.city || '';
          if (payload.state !== null) next.state = payload.state || '';
          if (payload.location !== null) next.location = payload.location || '';
          if (payload.statusDate !== null) next.statusDate = payload.statusDate || '';
          if (payload.isAutoupdate !== null) next.isAutoupdate = payload.isAutoupdate;
          if (payload.notificationsEnabled !== null) {
            next.notificationsEnabled = payload.notificationsEnabled;
          }
          if (typeof payload.deactivateAccount === 'boolean') {
            next.deactivateAccount = payload.deactivateAccount;
          }
          await secureStorage.setItemAsync('user', JSON.stringify(next));
        }
      } catch {
        // ignore
      }
    }
  } catch (e) {
    fileLogger.error('driverProfileSync', 'PERSIST_FAILED', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Emits profile + status on the app event bus.
 */
export function emitDriverProfileSyncEvents(payload: DriverProfileSyncPayload): void {
  eventBus.emit('DRIVER_PROFILE_SYNCED', payload);
  eventBus.emit('DRIVER_STATUS_UPDATED', {
    driverStatus: payload.driverStatus,
    deactivateAccount: payload.deactivateAccount,
  });
}

/**
 * Throttled fetch from backend (uses cached @user_id / @user_access_token). DRIVER only.
 * Use in background location task with emitEvents: false.
 */
export async function syncDriverProfileWithThrottle(
  minIntervalSec: number,
  options?: { emitEvents?: boolean }
): Promise<DriverProfileSyncPayload | null> {
  const emitEvents = options?.emitEvents !== false;
  const userId = await AsyncStorage.getItem('@user_id');
  const token = await AsyncStorage.getItem('@user_access_token');
  const role = (await AsyncStorage.getItem('@user_role'))?.trim().toUpperCase();
  if (!userId || !token || role !== 'DRIVER') return null;

  const now = Math.floor(Date.now() / 1000);
  const lastStr = await AsyncStorage.getItem(DRIVER_PROFILE_SYNC_LAST_FETCH_KEY);
  const last = lastStr ? parseInt(lastStr, 10) : 0;
  if (Number.isFinite(last) && last > 0 && now - last < minIntervalSec) {
    return null;
  }

  const payload = await fetchDriverProfileFromBackend(userId, token);
  if (!payload) return null;

  await AsyncStorage.setItem(DRIVER_PROFILE_SYNC_LAST_FETCH_KEY, String(now));
  await persistDriverProfileLocally(payload, { mergeSecureUser: true });
  if (emitEvents) {
    emitDriverProfileSyncEvents(payload);
  }
  return payload;
}
