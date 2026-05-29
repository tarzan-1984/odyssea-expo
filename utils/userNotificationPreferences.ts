import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/app-api/users';
import { fileLogger } from '@/utils/fileLogger';
import { eventBus } from '@/services/EventBus';

const SETTINGS_STORAGE_KEY = '@odyssea_app_settings';

export async function persistNotificationPreferenceLocally(
  notificationsEnabled: boolean,
): Promise<void> {
  try {
    const settingsStr = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    const settings = settingsStr ? JSON.parse(settingsStr) : {};
    await AsyncStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...settings, notificationsEnabled }),
    );
    eventBus.emit('NOTIFICATION_PREFERENCES_SYNCED', { notificationsEnabled });
  } catch (e) {
    fileLogger.error('userNotificationPreferences', 'PERSIST_LOCAL_FAILED', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Pull server preference into AsyncStorage (foreground sync / login). */
export async function syncNotificationPreferencesFromBackend(
  userId: string,
): Promise<boolean | null> {
  try {
    const remote = await getNotificationPreferences(userId);
    await persistNotificationPreferenceLocally(remote.notificationsEnabled);
    return remote.notificationsEnabled;
  } catch (e) {
    fileLogger.error('userNotificationPreferences', 'SYNC_FROM_SERVER_FAILED', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Persist toggle to server (Settings screen). */
export async function pushNotificationPreferenceToBackend(
  userId: string,
  notificationsEnabled: boolean,
): Promise<void> {
  await updateNotificationPreferences(userId, notificationsEnabled);
}
