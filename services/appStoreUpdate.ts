import { Platform } from 'react-native';

const LOOKUP_TIMEOUT_MS = 12_000;

/**
 * Compares two dotted app version strings (e.g. App Store marketing versions).
 * @returns negative if a < b, zero if equal, positive if a > b
 */
export function compareAppVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split(/[.\-]/u)
      .map((part) => {
        const n = parseInt(/^\d+/u.exec(part)?.[0] ?? '0', 10);
        return Number.isFinite(n) ? n : 0;
      });

  const pa = parse(a.trim());
  const pb = parse(b.trim());
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export type AppStoreListing = {
  version: string;
  trackViewUrl: string;
};

/**
 * Fetches the public App Store listing for the bundle id (TestFlight builds are not returned here).
 */
export async function fetchAppStoreListing(bundleId: string): Promise<AppStoreListing | null> {
  if (Platform.OS !== 'ios' || !bundleId) {
    return null;
  }

  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      resultCount?: number;
      results?: Array<{ version?: string; trackViewUrl?: string }>;
    };
    const row = json.results?.[0];
    if (!row?.version || !row.trackViewUrl) {
      return null;
    }
    return { version: row.version, trackViewUrl: row.trackViewUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
