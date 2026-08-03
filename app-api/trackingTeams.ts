import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

export type TrackingTeamsScope = 'mine' | 'team';

export const TRACKING_TEAMS_QUERY_KEY = 'tracking-teams' as const;
export const TRACKING_TEAMS_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export function trackingTeamsQueryKey(scope: TrackingTeamsScope) {
  return [TRACKING_TEAMS_QUERY_KEY, scope] as const;
}

function normalizeLoadIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id ?? '').trim()).filter(Boolean);
}

/**
 * Nest TransformInterceptor wraps as `{ data: { loadIds } }`.
 * Also accept TMS-shaped `{ data: { load_ids } }` / flat payloads.
 */
export function extractTrackingTeamsLoadIds(body: any): string[] {
  const payload = body?.data && typeof body.data === 'object' ? body.data : body;
  if (Array.isArray(payload?.loadIds)) return normalizeLoadIds(payload.loadIds);
  if (Array.isArray(payload?.load_ids)) return normalizeLoadIds(payload.load_ids);
  if (Array.isArray(payload?.data?.load_ids)) return normalizeLoadIds(payload.data.load_ids);
  if (Array.isArray(payload?.data?.loadIds)) return normalizeLoadIds(payload.data.loadIds);
  return [];
}

/**
 * Fetch TMS tracking/teams load ids via Nest GET /v1/tracking/teams.
 * scope "mine" = My Loads; "team" = My Team (include_subordinates).
 */
export async function fetchTrackingTeamsLoadIds(
  scope: TrackingTeamsScope,
  options?: { refresh?: boolean },
): Promise<string[]> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const qs = new URLSearchParams();
  if (scope === 'team') qs.set('include_subordinates', '1');
  if (options?.refresh) qs.set('refresh', '1');

  const url = `${API_BASE_URL}/v1/tracking/teams${
    qs.toString() ? `?${qs.toString()}` : ''
  }`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.data?.message ||
      `Failed to load tracking teams. Status: ${response.status}`;
    throw new Error(typeof message === 'string' ? message : 'Failed to load tracking teams');
  }

  return extractTrackingTeamsLoadIds(data);
}
