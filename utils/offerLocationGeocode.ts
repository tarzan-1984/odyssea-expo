import {
	buildNominatimQuery,
	CA_POSTAL_PATTERN,
	CITY_REGION_CODE_PATTERN,
	isCanadianPostalCode,
	isBarePostalInput,
	isUsZipCode,
	MX_CP_PATTERN,
	nominatimCountryLabel,
	normalizePostalInput,
	parseCityRegionCode,
	parseCityRegionPostalLine,
	resolveOfferGeocodeCountry,
	type OfferGeocodeCountry,
	US_ZIP_PATTERN,
	zippopotamPostalUrl,
	zippopotamUrl,
} from "./offerLocationCountry";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

type NominatimAddress = {
	city?: string;
	town?: string;
	village?: string;
	municipality?: string;
	state?: string;
	postcode?: string;
};

function nominatimHeaders(userAgent: string): HeadersInit {
	return {
		"User-Agent": userAgent,
		"Accept-Language": "en",
	};
}

function cityFromNominatimAddress(addr: NominatimAddress, fallback: string): string {
	return simplifyPlaceName(
		addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? fallback,
		fallback,
	);
}

/**
 * Strip Zippopotam district suffixes in parentheses.
 * e.g. "Edmonton (West Clareview / East Londonderry)" → "Edmonton"
 */
export function simplifyPlaceName(placeName: string, preferredCity?: string): string {
	const trimmed = placeName.trim();
	if (!trimmed) return preferredCity?.trim() ?? "";

	const withoutParens = trimmed.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
	const pref = preferredCity?.trim();

	if (pref) {
		const lowerPref = pref.toLowerCase();
		const candidate = withoutParens || trimmed;
		if (candidate.toLowerCase() === lowerPref || candidate.toLowerCase().startsWith(`${lowerPref} `)) {
			return pref;
		}
	}

	return withoutParens || trimmed;
}

async function fetchNominatim(
	query: string,
	country: OfferGeocodeCountry,
	options: { limit?: string; addressdetails?: string; userAgent: string },
): Promise<Array<{ lat?: string; lon?: string; address?: NominatimAddress }>> {
	const params = new URLSearchParams({
		q: query,
		format: "json",
		limit: options.limit ?? "1",
		countrycodes: country,
	});
	if (options.addressdetails) {
		params.set("addressdetails", options.addressdetails);
	}

	const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
		headers: nominatimHeaders(options.userAgent),
	});
	if (!res.ok) return [];

	const data = (await res.json()) as Array<{ lat?: string; lon?: string; address?: NominatimAddress }>;
	return Array.isArray(data) ? data : [];
}

async function tryZippopotamCityRegion(
	city: string,
	regionCode: string,
	country: OfferGeocodeCountry,
): Promise<{ placeName: string; postal: string } | null> {
	try {
		const zippRes = await fetch(zippopotamUrl(country, regionCode, city), {
			headers: { Accept: "application/json" },
		});
		if (!zippRes.ok) return null;

		const zippData = (await zippRes.json()) as {
			places?: Array<{ "post code"?: string; "place name"?: string }>;
		};
		const firstPlace = zippData.places?.[0];
		const postal = firstPlace?.["post code"];
		if (!postal) return null;

		return {
			placeName: simplifyPlaceName(firstPlace?.["place name"] ?? city, city),
			postal,
		};
	} catch {
		return null;
	}
}

async function tryZippopotamPostal(
	postalInput: string,
	country: OfferGeocodeCountry,
): Promise<{ placeName: string; regionName: string; postal: string; lat?: number; lon?: number } | null> {
	const url = zippopotamPostalUrl(country, postalInput);
	if (!url) return null;

	try {
		const zippRes = await fetch(url, { headers: { Accept: "application/json" } });
		if (!zippRes.ok) return null;

		const zippData = (await zippRes.json()) as {
			"place name"?: string;
			state?: string;
			places?: Array<{
				"place name"?: string;
				"post code"?: string;
				latitude?: string;
				longitude?: string;
			}>;
		};
		const firstPlace = zippData.places?.[0];
		const postal =
			firstPlace?.["post code"] ??
			postalInput.replace(/\s/g, "").toUpperCase();
		const placeName = simplifyPlaceName(
			firstPlace?.["place name"] ?? zippData["place name"] ?? "",
		);
		const regionName =
			zippData.state ??
			(firstPlace as { state?: string } | undefined)?.state ??
			"";
		if (!placeName && !regionName) return null;

		const lat = firstPlace?.latitude != null ? Number.parseFloat(firstPlace.latitude) : undefined;
		const lon = firstPlace?.longitude != null ? Number.parseFloat(firstPlace.longitude) : undefined;

		const inputCompact = postalInput.replace(/\s/g, "").toUpperCase();
		const displayPostal =
			country === "ca" && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(inputCompact)
				? `${inputCompact.slice(0, 3)} ${inputCompact.slice(3)}`
				: postal;

		return { placeName, regionName, postal: displayPostal, lat, lon };
	} catch {
		return null;
	}
}

async function coordsFromZippopotamCityRegion(
	city: string,
	regionCode: string,
	country: OfferGeocodeCountry,
): Promise<{ lat: number; lon: number } | null> {
	try {
		const zippRes = await fetch(zippopotamUrl(country, regionCode, city), {
			headers: { Accept: "application/json" },
		});
		if (!zippRes.ok) return null;

		const data = (await zippRes.json()) as {
			places?: Array<{ latitude?: string; longitude?: string }>;
		};
		const place = data.places?.find((p) => p.latitude != null && p.longitude != null) ?? data.places?.[0];
		if (!place?.latitude || !place?.longitude) return null;

		const lat = Number.parseFloat(place.latitude);
		const lon = Number.parseFloat(place.longitude);
		if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
		return { lat, lon };
	} catch {
		return null;
	}
}

function extractEmbeddedPostal(
	address: string,
	country: OfferGeocodeCountry,
): { postal: string; country: OfferGeocodeCountry } | null {
	const trimmed = address.trim();
	const caMatch = trimmed.match(/\b([A-Z]\d[A-Z](?:\s?\d[A-Z]\d)?)\b/i);
	if (caMatch) {
		return { postal: caMatch[1], country: "ca" };
	}
	const digitMatch = trimmed.match(/\b(\d{5})(?:-\d{4})?\b/);
	if (digitMatch) {
		const compact = digitMatch[1];
		if (country === "mx" || country === "us") {
			return { postal: compact, country };
		}
		return { postal: compact, country: "us" };
	}
	return null;
}

async function coordsFromFormattedLine(
	line: ReturnType<typeof parseCityRegionPostalLine>,
): Promise<{ lat: number; lon: number } | null> {
	if (!line) return null;

	const fromCity = await coordsFromZippopotamCityRegion(
		line.city,
		line.regionCode,
		line.country,
	);
	if (fromCity) return fromCity;

	const zipp = await tryZippopotamPostal(line.postal, line.country);
	if (zipp?.lat != null && zipp.lon != null) {
		return { lat: zipp.lat, lon: zipp.lon };
	}

	return null;
}

function formatZippopotamPostalResult(
	zipp: { placeName: string; regionName: string; postal: string },
	preferredCity?: string,
): string {
	const city = simplifyPlaceName(zipp.placeName, preferredCity);
	const region = zipp.regionName.trim();
	const postal = zipp.postal.trim();
	if (city && region && postal) {
		return `${city}, ${region} ${postal}`;
	}
	if (city && postal) {
		return `${city} ${postal}`;
	}
	return postal;
}

/** Resolve bare 5-digit postal: try US Zippopotam first, then Mexico. */
async function geocodeBareFiveDigitPostal(
	postal: string,
): Promise<{ formatted: string; country: OfferGeocodeCountry } | null> {
	const compact = postal.replace(/\s/g, "");
	if (!MX_CP_PATTERN.test(compact)) return null;

	for (const country of ["us", "mx"] as const) {
		const zipp = await tryZippopotamPostal(compact, country);
		if (zipp) {
			return { formatted: formatZippopotamPostalResult(zipp), country };
		}
	}
	return null;
}

/** Geocode address via Nominatim. Returns lat/lon or null. */
export async function geocodeOfferAddressCoordinates(
	address: string,
	userAgent = "OdysseaApp/1.0 (geocode-coordinates)",
): Promise<{ lat: number; lon: number } | null> {
	const trimmed = normalizePostalInput(address.trim());
	if (!trimmed) return null;

	const country = resolveOfferGeocodeCountry(trimmed);
	const formattedLine = parseCityRegionPostalLine(trimmed);
	if (formattedLine) {
		const fromLine = await coordsFromFormattedLine(formattedLine);
		if (fromLine) return fromLine;
	}

	const parsed = parseCityRegionCode(trimmed);

	if (parsed) {
		const coords = await coordsFromZippopotamCityRegion(
			parsed.city,
			parsed.regionCode,
			parsed.country,
		);
		if (coords) return coords;
	}

	const compact = trimmed.replace(/\s/g, "");
	if (MX_CP_PATTERN.test(compact) && isBarePostalInput(trimmed)) {
		const bare = await geocodeBareFiveDigitPostal(trimmed);
		if (bare) {
			const zipp = await tryZippopotamPostal(compact, bare.country);
			if (zipp?.lat != null && zipp.lon != null) {
				return { lat: zipp.lat, lon: zipp.lon };
			}
		}
	}

	const embeddedPostal = extractEmbeddedPostal(trimmed, country);
	if (embeddedPostal) {
		const zipp = await tryZippopotamPostal(embeddedPostal.postal, embeddedPostal.country);
		if (zipp?.lat != null && zipp.lon != null) {
			return { lat: zipp.lat, lon: zipp.lon };
		}
	}

	const query = buildNominatimQuery(trimmed, country);
	const results = await fetchNominatim(query, country, { userAgent });
	const first = results[0];
	if (!first?.lat || !first?.lon) return null;

	const lat = Number.parseFloat(first.lat);
	const lon = Number.parseFloat(first.lon);
	if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

	return { lat, lon };
}

/**
 * Geocode ZIP / "City, ST" / Canadian postal / Mexican CP to formatted location string.
 */
export async function geocodeOfferToFormattedAddress(
	input: string,
	userAgent = "OdysseaApp/1.0 (geocode-formatted)",
): Promise<string> {
	const trimmed = normalizePostalInput(input.trim());
	if (!trimmed) return trimmed;

	const compact = trimmed.replace(/\s/g, "");
	const isCaPostal = isCanadianPostalCode(trimmed);
	const isFiveDigit = MX_CP_PATTERN.test(compact);
	const isUsPostal = isUsZipCode(trimmed);
	const cityRegion = parseCityRegionCode(trimmed);

	if (!isCaPostal && !isFiveDigit && !isUsPostal && !cityRegion) {
		return trimmed;
	}

	if (cityRegion) {
		const { city, regionCode, country: regionCountry } = cityRegion;

		const zipp = await tryZippopotamCityRegion(city, regionCode, regionCountry);
		if (zipp) {
			return `${simplifyPlaceName(zipp.placeName, city)}, ${regionCode} ${zipp.postal}`;
		}

		const query = buildNominatimQuery(`${city}, ${regionCode}`, regionCountry);
		const results = await fetchNominatim(query, regionCountry, {
			limit: "5",
			addressdetails: "1",
			userAgent,
		});
		const withPostal = results.find((r) => r.address?.postcode);
		if (withPostal?.address) {
			const addr = withPostal.address;
			const resolvedCity = cityFromNominatimAddress(addr, city);
			return `${resolvedCity}, ${regionCode} ${addr.postcode}`;
		}

		return `${city}, ${regionCode}`;
	}

	if (isCaPostal && isBarePostalInput(trimmed)) {
		const zipp = await tryZippopotamPostal(trimmed, "ca");
		if (zipp) {
			return formatZippopotamPostalResult(zipp);
		}
	}

	if (isFiveDigit && isBarePostalInput(trimmed)) {
		const bare = await geocodeBareFiveDigitPostal(trimmed);
		if (bare) return bare.formatted;
	}

	if (isUsPostal && isBarePostalInput(trimmed)) {
		const zipp = await tryZippopotamPostal(trimmed, "us");
		if (zipp) {
			return formatZippopotamPostalResult(zipp);
		}

		const query = buildNominatimQuery(trimmed, "us");
		const results = await fetchNominatim(query, "us", {
			limit: "1",
			addressdetails: "1",
			userAgent,
		});

		if (results.length > 0 && results[0].address) {
			const addr = results[0].address!;
			const city = cityFromNominatimAddress(addr, "");
			const state = addr.state ?? "";
			const postcode = addr.postcode ?? trimmed;
			if (city && state && postcode) {
				return `${city}, ${state} ${postcode}`;
			}
			if (city && state) {
				return `${city}, ${state}`;
			}
		}
	}

	return trimmed;
}

export {
	CA_POSTAL_PATTERN,
	CITY_REGION_CODE_PATTERN,
	US_ZIP_PATTERN,
	isCanadianPostalCode,
	isUsZipCode,
	nominatimCountryLabel,
	resolveOfferGeocodeCountry,
};
