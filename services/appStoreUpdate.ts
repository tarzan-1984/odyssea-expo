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

export type GooglePlayListing = {
  version: string;
  webUrl: string;
  marketUrl: string;
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractGooglePlayVersion(html: string): string | null {
  const patterns = [
    /"softwareVersion"\s*:\s*"([^"]+)"/u,
    /Current Version[\s\S]{0,800}?>(\d+(?:\.\d+)+(?:[-\w.]*)?)</iu,
    /Version[\s\S]{0,800}?>(\d+(?:\.\d+)+(?:[-\w.]*)?)</iu,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const version = match?.[1] ? decodeHtmlEntities(match[1]) : '';
    if (/^\d+(?:\.\d+)+(?:[-\w.]*)?$/u.test(version)) {
      return version;
    }
  }

  return null;
}

/**
 * Fetches the public Google Play listing for the Android package id.
 * Google Play does not provide a stable public version API, so this is best-effort
 * and fail-open when the listing format changes.
 */
export async function fetchGooglePlayListing(packageId: string): Promise<GooglePlayListing | null> {
  if (Platform.OS !== 'android' || !packageId) {
    return null;
  }

  const webUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en&gl=US`;
  const marketUrl = `market://details?id=${encodeURIComponent(packageId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(webUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) {
      return null;
    }

    const html = await res.text();
    const version = extractGooglePlayVersion(html);
    if (!version) {
      return null;
    }

    return { version, webUrl, marketUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
