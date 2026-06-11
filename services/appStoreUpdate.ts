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

export type DefaultStoreUrls = {
  storeUrl: string;
  fallbackStoreUrl?: string;
  storeName: 'App Store' | 'Google Play';
};

/** Fallback store links when only the server minimum-version gate triggers force update. */
export function getDefaultStoreUrls(applicationId: string): DefaultStoreUrls | null {
  if (!applicationId) return null;
  if (Platform.OS === 'android') {
    const webUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(applicationId)}`;
    return {
      storeUrl: `market://details?id=${encodeURIComponent(applicationId)}`,
      fallbackStoreUrl: webUrl,
      storeName: 'Google Play',
    };
  }
  return null;
}

/** ISO 3166-1 alpha-2 storefront country derived from the device locale (e.g. ua, de, us). */
export function getDeviceStoreCountryCode(): string {
  try {
    const localeTag = Intl.DateTimeFormat().resolvedOptions().locale ?? '';

    if (typeof Intl.Locale === 'function' && localeTag) {
      const region = new Intl.Locale(localeTag).region;
      if (region && /^[a-zA-Z]{2}$/u.test(region)) {
        return region.toLowerCase();
      }
    }

    const match = /[-_](?<region>[a-zA-Z]{2})\b/u.exec(localeTag);
    if (match?.groups?.region) {
      return match.groups.region.toLowerCase();
    }
  } catch {
    // Fall back below when locale cannot be resolved.
  }

  return 'us';
}

async function fetchItunesLookup(
  bundleId: string,
  country: string,
): Promise<AppStoreListing | null> {
  // country is required — lookup without it can return a stale marketing version.
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=${encodeURIComponent(country)}`;

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

/**
 * Fetches the public App Store listing for the bundle id (TestFlight builds are not returned here).
 */
export async function fetchAppStoreListing(bundleId: string): Promise<AppStoreListing | null> {
  if (Platform.OS !== 'ios' || !bundleId) {
    return null;
  }

  const deviceCountry = getDeviceStoreCountryCode();
  const countriesToTry =
    deviceCountry === 'us' ? ['us'] : [deviceCountry, 'us'];

  for (const country of countriesToTry) {
    const listing = await fetchItunesLookup(bundleId, country);
    if (listing) {
      return listing;
    }
  }

  return null;
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

function isValidAppVersion(version: string): boolean {
  return /^\d+(?:\.\d+)+(?:[-\w.]*)?$/u.test(version);
}

function extractGooglePlayVersion(html: string): string | null {
  const patterns = [
    // Google Play embeds the current version in AF_initDataCallback ds:5 (field id 141).
    /"141"\s*:\s*\[\[\["(\d+(?:\.\d+)+(?:[-\w.]*)?)"\]\]/u,
    /"softwareVersion"\s*:\s*"([^"]+)"/u,
    /Current Version[\s\S]{0,800}?>(\d+(?:\.\d+)+(?:[-\w.]*)?)</iu,
    /Version[\s\S]{0,800}?>(\d+(?:\.\d+)+(?:[-\w.]*)?)</iu,
    // Triple-nested array form used in Play Store payloads.
    /\[\[\["(\d+(?:\.\d+)+(?:[-\w.]*)?)"\]\]/u,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const version = match?.[1] ? decodeHtmlEntities(match[1]) : '';
    if (isValidAppVersion(version)) {
      return version;
    }
  }

  // Last resort: app detail pages usually expose exactly one marketing semver.
  const quotedVersions = [
    ...new Set(
      [...html.matchAll(/"(\d+\.\d+\.\d+)"/gu)].map((match) => match[1]),
    ),
  ];
  if (quotedVersions.length === 1 && isValidAppVersion(quotedVersions[0])) {
    return quotedVersions[0];
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

  const storeCountry = getDeviceStoreCountryCode().toUpperCase();
  const webUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en&gl=${encodeURIComponent(storeCountry)}`;
  const marketUrl = `market://details?id=${encodeURIComponent(packageId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(webUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
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
