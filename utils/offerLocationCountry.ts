/** Nominatim / Zippopotam country for North America offer route geocoding. */
export type OfferGeocodeCountry = "us" | "ca" | "mx";

/** US ZIP: 5 digits, optionally +4 */
export const US_ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

/** Canadian postal code (FSA or full, with optional space). */
export const CA_POSTAL_PATTERN = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;

/** Mexican CP: 5 digits (same shape as US ZIP). */
export const MX_CP_PATTERN = /^\d{5}$/;

const US_STATE_CODES = new Set([
	"AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
	"IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
	"NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
	"VT", "VA", "WA", "WV", "WI", "WY",
]);

const CA_PROVINCE_CODES = new Set([
	"AB", "BC", "MB", "NB", "NL", "NT", "NS", "NU", "ON", "PE", "QC", "SK", "YT",
]);

const MX_STATE_CODES = new Set([
	"DIF", "CDMX", "AGU", "BCN", "BCS", "CAM", "CHP", "CHIS", "CHH", "COA", "COL", "DUR", "GUA",
	"GRO", "HID", "JAL", "MIC", "MOR", "MEX", "NAY", "NLE", "OAX", "PUE", "QUE", "QRO", "NAQ",
	"ROO", "SLP", "SIN", "SON", "TAB", "TAM", "TLA", "VER", "YUC", "ZAC",
]);

export const US_STATE_ABBR_TO_NAME: Record<string, string> = {
	AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
	CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
	HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
	KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
	MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
	MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
	NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
	OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
	SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
	VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
	DC: "District of Columbia",
};

export const CA_PROVINCE_ABBR_TO_NAME: Record<string, string> = {
	AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
	NL: "Newfoundland and Labrador", NT: "Northwest Territories", NS: "Nova Scotia",
	NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
	SK: "Saskatchewan", YT: "Yukon",
};

export const MX_STATE_ABBR_TO_NAME: Record<string, string> = {
	DIF: "Ciudad de México", CDMX: "Ciudad de México", AGU: "Aguascalientes",
	BCN: "Baja California", BCS: "Baja California Sur", CAM: "Campeche", CHP: "Chiapas",
	CHIS: "Chiapas", CHH: "Chihuahua", COA: "Coahuila", COL: "Colima", DUR: "Durango",
	GUA: "Guanajuato", GRO: "Guerrero", HID: "Hidalgo", JAL: "Jalisco", MIC: "Michoacán",
	MOR: "Morelos", MEX: "México", NAY: "Nayarit", NLE: "Nuevo León", OAX: "Oaxaca",
	PUE: "Puebla", QUE: "Querétaro", QRO: "Querétaro", NAQ: "Querétaro", ROO: "Quintana Roo",
	SLP: "San Luis Potosí", SIN: "Sinaloa", SON: "Sonora", TAB: "Tabasco", TAM: "Tamaulipas",
	TLA: "Tlaxcala", VER: "Veracruz", YUC: "Yucatán", ZAC: "Zacatecas",
};

/** "City, ST" (2 letters) or "City, JAL" (3–4 letters). */
export const CITY_REGION_CODE_PATTERN = /^([^,]+),\s*([A-Za-z]{2,4})\s*$/;

function countryFromRegionCode(code: string): OfferGeocodeCountry | null {
	const upper = code.toUpperCase();
	if (CA_PROVINCE_CODES.has(upper)) return "ca";
	if (MX_STATE_CODES.has(upper)) return "mx";
	if (US_STATE_CODES.has(upper)) return "us";
	return null;
}

function extractTrailingRegionCode(value: string): string | null {
	const commaMatch = /^[^,]+,\s*([A-Za-z]{2,4})\s*$/.exec(value.trim());
	if (commaMatch) {
		return commaMatch[1].toUpperCase();
	}

	const parts = value.trim().split(/\s+/);
	if (parts.length < 2) return null;
	const last = parts[parts.length - 1];
	if (/^[A-Za-z]{2,4}$/.test(last)) {
		return last.toUpperCase();
	}
	return null;
}

function countryFromRegionName(value: string): OfferGeocodeCountry | null {
	const lower = value.toLowerCase();
	for (const name of Object.values(CA_PROVINCE_ABBR_TO_NAME)) {
		if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
			return "ca";
		}
	}
	for (const name of Object.values(MX_STATE_ABBR_TO_NAME)) {
		if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
			return "mx";
		}
	}
	for (const name of Object.values(US_STATE_ABBR_TO_NAME)) {
		if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
			return "us";
		}
	}
	return null;
}

/** Normalize postal input: "N7M, 1A1" → "N7M 1A1", trim, uppercase Canadian codes. */
export function normalizePostalInput(value: string): string {
	const trimmed = value.trim();
	const caComma = /^([A-Za-z]\d[A-Za-z])\s*,\s*(\d[A-Za-z]\d)$/i.exec(trimmed);
	if (caComma) {
		return `${caComma[1].toUpperCase()} ${caComma[2].toUpperCase()}`;
	}
	if (/^[A-Za-z]\d[A-Za-z]$/i.test(trimmed)) {
		return trimmed.toUpperCase();
	}
	return trimmed;
}

export function isCanadianPostalCode(value: string): boolean {
	const normalized = normalizePostalInput(value);
	return (
		CA_POSTAL_PATTERN.test(normalized.replace(/\s+/g, " ").trim()) ||
		/^[A-Z]\d[A-Z]$/i.test(normalized)
	);
}

/** True when the value is only a postal/ZIP code (no city name). */
export function isBarePostalInput(value: string): boolean {
	const normalized = normalizePostalInput(value.trim());
	const compact = normalized.replace(/\s/g, "");
	if (isCanadianPostalCode(normalized)) return true;
	if (US_ZIP_PATTERN.test(compact)) return true;
	return MX_CP_PATTERN.test(compact);
}

export function isUsZipCode(value: string): boolean {
	return US_ZIP_PATTERN.test(value.replace(/\s/g, ""));
}

export function isMexicanCpCode(value: string): boolean {
	return MX_CP_PATTERN.test(value.replace(/\s/g, ""));
}

/**
 * Infer Nominatim / Zippopotam country from free-text offer location.
 * Defaults to US when ambiguous (e.g. bare 5-digit postal code).
 */
export function resolveOfferGeocodeCountry(address: string): OfferGeocodeCountry {
	const trimmed = address.trim();
	if (!trimmed) return "us";

	if (/\bcanada\b/i.test(trimmed)) return "ca";
	if (/\b(mexico|méxico)\b/i.test(trimmed)) return "mx";
	if (/\b(usa|united states|u\.s\.a\.)\b/i.test(trimmed)) return "us";

	const compact = trimmed.replace(/\s/g, "");
	if (isCanadianPostalCode(trimmed)) return "ca";

	const fromName = countryFromRegionName(trimmed);
	if (fromName) return fromName;

	const cityRegionPostal = /,\s*([A-Za-z]{2,4})\s+[A-Z0-9]/i.exec(trimmed);
	if (cityRegionPostal) {
		const fromCode = countryFromRegionCode(cityRegionPostal[1].toUpperCase());
		if (fromCode) return fromCode;
	}

	const regionCode = extractTrailingRegionCode(trimmed);
	if (regionCode) {
		const fromCode = countryFromRegionCode(regionCode);
		if (fromCode) return fromCode;
	}

	if (MX_CP_PATTERN.test(compact) && regionCode && MX_STATE_CODES.has(regionCode)) {
		return "mx";
	}

	return "us";
}

export function nominatimCountryLabel(country: OfferGeocodeCountry): string {
	return { us: "USA", ca: "Canada", mx: "Mexico" }[country];
}

export function buildNominatimQuery(address: string, country: OfferGeocodeCountry): string {
	const label = nominatimCountryLabel(country);
	if (new RegExp(`\\b${label}\\b`, "i").test(address)) {
		return address.trim();
	}
	return `${address.trim()}, ${label}`;
}

export function regionCodeToFullName(code: string, country: OfferGeocodeCountry): string {
	const upper = code.toUpperCase();
	switch (country) {
		case "ca":
			return CA_PROVINCE_ABBR_TO_NAME[upper] ?? upper;
		case "mx":
			return MX_STATE_ABBR_TO_NAME[upper] ?? upper;
		default:
			return US_STATE_ABBR_TO_NAME[upper] ?? upper;
	}
}

export function zippopotamUrl(
	country: OfferGeocodeCountry,
	regionCode: string,
	city: string,
): string {
	const countryPath = country;
	const regionPath = regionCode.toLowerCase();
	return `https://api.zippopotam.us/${countryPath}/${encodeURIComponent(regionPath)}/${encodeURIComponent(city)}`;
}

export function zippopotamPostalUrl(
	country: OfferGeocodeCountry,
	postalCode: string,
): string | null {
	const compact = postalCode.replace(/\s/g, "").toUpperCase();
	if (country === "ca" && /^[A-Z]\d[A-Z](\d[A-Z]\d)?$/.test(compact)) {
		const fsa = compact.slice(0, 3);
		return `https://api.zippopotam.us/ca/${encodeURIComponent(fsa)}`;
	}
	if (country === "us" && US_ZIP_PATTERN.test(compact)) {
		return `https://api.zippopotam.us/us/${encodeURIComponent(compact.slice(0, 5))}`;
	}
	if (country === "mx" && MX_CP_PATTERN.test(compact)) {
		return `https://api.zippopotam.us/mx/${encodeURIComponent(compact)}`;
	}
	return null;
}

export function parseCityRegionCode(
	address: string,
): { city: string; regionCode: string; country: OfferGeocodeCountry } | null {
	const match = CITY_REGION_CODE_PATTERN.exec(address.trim());
	if (!match) return null;

	const city = match[1].trim();
	const regionCode = match[2].toUpperCase();
	const country = countryFromRegionCode(regionCode);
	if (!country) return null;

	return { city, regionCode, country };
}

/** "City, AB T5A" / "Phoenix, AZ 85001" / "Wauseon, Ohio 43567" — after geocode-to-formatted. */
export function parseCityRegionPostalLine(
	address: string,
): {
	city: string;
	regionCode: string;
	postal: string;
	country: OfferGeocodeCountry;
} | null {
	const trimmed = address.trim();
	const commaIdx = trimmed.indexOf(",");
	if (commaIdx <= 0) return null;

	const city = trimmed.slice(0, commaIdx).trim();
	const afterComma = trimmed.slice(commaIdx + 1).trim();
	if (!city || !afterComma) return null;

	let postal: string | null = null;
	let regionToken: string | null = null;

	const caMatch = afterComma.match(/^(.+?)\s+([A-Z]\d[A-Z](?:\s?\d[A-Z]\d)?)$/i);
	if (caMatch) {
		regionToken = caMatch[1].trim();
		postal = caMatch[2].replace(/\s+/g, " ").trim().toUpperCase();
	} else {
		const zipMatch = afterComma.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
		if (zipMatch) {
			regionToken = zipMatch[1].trim();
			postal = zipMatch[2];
		}
	}

	if (!regionToken || !postal) return null;

	const regionResolved = resolveRegionToken(regionToken);
	if (!regionResolved) return null;

	return {
		city,
		regionCode: regionResolved.regionCode,
		postal,
		country: regionResolved.country,
	};
}

function lettersOnlyKey(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[^a-z]/g, "");
}

const REGION_NAME_TO_CODE: Record<string, { regionCode: string; country: OfferGeocodeCountry }> =
	(() => {
		const out: Record<string, { regionCode: string; country: OfferGeocodeCountry }> = {};
		for (const [code, name] of Object.entries(US_STATE_ABBR_TO_NAME)) {
			out[lettersOnlyKey(name)] = { regionCode: code, country: "us" };
		}
		for (const [code, name] of Object.entries(CA_PROVINCE_ABBR_TO_NAME)) {
			out[lettersOnlyKey(name)] = { regionCode: code, country: "ca" };
		}
		for (const [code, name] of Object.entries(MX_STATE_ABBR_TO_NAME)) {
			out[lettersOnlyKey(name)] = { regionCode: code, country: "mx" };
		}
		return out;
	})();

function resolveRegionToken(
	token: string,
): { regionCode: string; country: OfferGeocodeCountry } | null {
	const upper = token.trim().toUpperCase();
	const fromCode = countryFromRegionCode(upper);
	if (fromCode) return { regionCode: upper, country: fromCode };

	const fromName = REGION_NAME_TO_CODE[lettersOnlyKey(token)];
	if (fromName) return fromName;

	return null;
}
