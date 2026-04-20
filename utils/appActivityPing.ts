import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/config';
import { LOCATION_LAST_API_SEND_AT_KEY } from '@/constants/locationSendThrottle';
import { getResolvedAppLocationSettings } from '@/utils/appLocationSettings';
import { fileLogger } from '@/utils/fileLogger';

/** Throttle successful activity-ping HTTP calls (matches “try ~every 10 min” intent). */
export const APP_ACTIVITY_PING_LAST_HTTP_MS_KEY = '@app_activity_ping_last_http_ms';

const MIN_SILENCE_AFTER_LOCATION_MS = 15 * 60 * 1000;
const MIN_INTERVAL_BETWEEN_PINGS_MS = 10 * 60 * 1000;

const PING_STATUSES = new Set(['available', 'loaded_enroute']);

export type AppActivityPingResult = {
  sent: boolean;
  reason: string;
};

/**
 * Background-safe: uses AsyncStorage only. Sends POST /v1/app-settings/activity-ping
 * when the driver is in a tracking-eligible status, sharing is on, the last *successful*
 * location API send was at least 15 minutes ago, and at least 10 minutes passed since the last ping.
 */
export async function runAppActivityPingIfEligible(): Promise<AppActivityPingResult> {
  if (!API_BASE_URL) {
    return { sent: false, reason: 'no_api_base' };
  }

  try {
    const settings = await AsyncStorage.getItem('@odyssea_app_settings');
    if (!settings) {
      return { sent: false, reason: 'no_settings' };
    }
    const parsed = JSON.parse(settings) as { automaticLocationSharing?: boolean };
    if (!parsed.automaticLocationSharing) {
      return { sent: false, reason: 'sharing_off' };
    }

    const role = (await AsyncStorage.getItem('@user_role'))?.trim().toUpperCase() || '';
    if (role !== 'DRIVER') {
      return { sent: false, reason: 'not_driver' };
    }

    const statusRaw = (await AsyncStorage.getItem('@user_status'))?.trim().toLowerCase() || '';
    if (!PING_STATUSES.has(statusRaw)) {
      return { sent: false, reason: 'status_not_eligible' };
    }

    const appLocEnv = await getResolvedAppLocationSettings();
    if (appLocEnv.locationEnvironmentMode === 'test') {
      const allowed = (appLocEnv.locationTestDriverExternalId || '').trim();
      const currentExternalId =
        (await AsyncStorage.getItem('@user_external_id').catch(() => null))?.trim() || '';
      if (!allowed || !currentExternalId || currentExternalId !== allowed) {
        return { sent: false, reason: 'test_mode_gate' };
      }
    }

    const lastSendStr = await AsyncStorage.getItem(LOCATION_LAST_API_SEND_AT_KEY);
    const lastSendMs = lastSendStr ? parseInt(lastSendStr, 10) : 0;
    if (!Number.isFinite(lastSendMs) || lastSendMs <= 0) {
      return { sent: false, reason: 'no_prior_location_send' };
    }

    const now = Date.now();
    if (now - lastSendMs < MIN_SILENCE_AFTER_LOCATION_MS) {
      return { sent: false, reason: 'location_send_recent' };
    }

    const lastPingStr = await AsyncStorage.getItem(APP_ACTIVITY_PING_LAST_HTTP_MS_KEY);
    const lastPingMs = lastPingStr ? parseInt(lastPingStr, 10) : 0;
    if (
      Number.isFinite(lastPingMs) &&
      lastPingMs > 0 &&
      now - lastPingMs < MIN_INTERVAL_BETWEEN_PINGS_MS
    ) {
      return { sent: false, reason: 'ping_interval' };
    }

    const token = (await AsyncStorage.getItem('@user_access_token'))?.trim() || '';
    if (!token) {
      return { sent: false, reason: 'no_token' };
    }

    const url = `${API_BASE_URL}/v1/app-settings/activity-ping`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      fileLogger.error('appActivityPing', 'HTTP_FAILED', { status: response.status });
      return { sent: false, reason: `http_${response.status}` };
    }

    await AsyncStorage.setItem(APP_ACTIVITY_PING_LAST_HTTP_MS_KEY, String(now));
    return { sent: true, reason: 'ok' };
  } catch (e) {
    fileLogger.error('appActivityPing', 'EXCEPTION', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { sent: false, reason: 'exception' };
  }
}
