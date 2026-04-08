/**
 * Proactive JWT access refresh: read exp from access token (no signature verify),
 * refresh via POST /v1/auth/refresh when expired or within threshold of expiry.
 * Keeps secureStorage and AsyncStorage @user_access_token in sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

/** Refresh access when remaining TTL is at or below this (2 days), or when already expired. */
export const ACCESS_TOKEN_REFRESH_THRESHOLD_SEC = 2 * 24 * 60 * 60;

export type ProactiveRefreshResult =
  | { outcome: 'skipped'; accessToken: string }
  | { outcome: 'refreshed'; accessToken: string }
  | { outcome: 'auth_lost' }
  | { outcome: 'no_session' };

function decodeJwtPayloadExp(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2 || !parts[1]) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    if (typeof globalThis.atob !== 'function') return null;
    const json = globalThis.atob(base64);
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function accessTokenNeedsProactiveRefresh(accessToken: string): boolean {
  const exp = decodeJwtPayloadExp(accessToken);
  if (exp == null) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec >= exp) return true;
  const secondsLeft = exp - nowSec;
  return secondsLeft <= ACCESS_TOKEN_REFRESH_THRESHOLD_SEC;
}

export async function persistAccessTokenToAllStorages(
  accessToken: string,
): Promise<void> {
  try {
    await secureStorage.setItemAsync('accessToken', accessToken);
  } catch (e) {
    console.warn('[accessTokenRefresh] secureStorage accessToken failed:', e);
    throw e;
  }
  try {
    await AsyncStorage.setItem('@user_access_token', accessToken);
  } catch (e) {
    console.warn('[accessTokenRefresh] Failed to cache access token in AsyncStorage:', e);
  }
}

async function postRefresh(refreshToken: string): Promise<string | null> {
  if (!API_BASE_URL) {
    console.warn('[accessTokenRefresh] API_BASE_URL missing');
    return null;
  }
  const url = `${API_BASE_URL}/v1/auth/refresh`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json().catch(() => null)) as
    | { accessToken?: string; data?: { accessToken?: string } }
    | null;
  const raw =
    data && typeof data === 'object'
      ? (data as { accessToken?: string }).accessToken
      : undefined;
  if (raw && typeof raw === 'string') return raw;
  const nested =
    data && typeof data === 'object' && 'data' in data
      ? (data as { data?: { accessToken?: string } }).data?.accessToken
      : undefined;
  return nested && typeof nested === 'string' ? nested : null;
}

let refreshPromise: Promise<ProactiveRefreshResult> | null = null;

/**
 * If access is missing / unreadable / expired / within threshold, exchange refresh for new access.
 * Single-flight: concurrent callers share one refresh.
 */
export function proactiveAccessTokenRefresh(
  accessToken: string,
  refreshToken: string,
): Promise<ProactiveRefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<ProactiveRefreshResult> => {
    try {
      if (!refreshToken.trim()) {
        return { outcome: 'auth_lost' };
      }

      if (!accessTokenNeedsProactiveRefresh(accessToken)) {
        await persistAccessTokenToAllStorages(accessToken);
        return { outcome: 'skipped', accessToken };
      }

      const newAccess = await postRefresh(refreshToken);
      if (!newAccess) {
        return { outcome: 'auth_lost' };
      }

      await persistAccessTokenToAllStorages(newAccess);
      console.log('✅ [accessTokenRefresh] Access token refreshed and synced to storages');
      return { outcome: 'refreshed', accessToken: newAccess };
    } catch (e) {
      console.warn('[accessTokenRefresh] Refresh failed:', e);
      return { outcome: 'auth_lost' };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Read tokens from secure storage and run proactive refresh (for AppState / cold path).
 */
export async function proactiveRefreshFromSecureStorage(): Promise<ProactiveRefreshResult> {
  const accessToken = await secureStorage.getItemAsync('accessToken');
  const refreshToken = await secureStorage.getItemAsync('refreshToken');
  if (!accessToken || !refreshToken) {
    return { outcome: 'no_session' };
  }
  return proactiveAccessTokenRefresh(accessToken, refreshToken);
}
