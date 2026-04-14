/**
 * Backend `users.state` and API `state` — full region names (e.g. "Pennsylvania", "New York").
 * `location` stays a TMS code; this helper only formats human-readable state/province.
 */

function lettersOnlyKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '');
}

/** US: USPS code → full name */
const US_STATE_CODE_TO_FULL_NAME: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

/** Canada: code → English name */
const CA_PROVINCE_CODE_TO_FULL_NAME: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NT: 'Northwest Territories',
  NS: 'Nova Scotia',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

const US_NAME_KEY_TO_CANONICAL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const name of Object.values(US_STATE_CODE_TO_FULL_NAME)) {
    m[lettersOnlyKey(name)] = name;
  }
  return m;
})();

const CA_NAME_KEY_TO_CANONICAL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const name of Object.values(CA_PROVINCE_CODE_TO_FULL_NAME)) {
    m[lettersOnlyKey(name)] = name;
  }
  return m;
})();

/**
 * Maps geocoder region (code or full name) to canonical full name for DB/API `state`.
 */
export function toBackendStateDisplayName(
  region: string | null | undefined,
  isoCountryCode?: string | null,
): string | undefined {
  const t = region?.trim();
  if (!t) return undefined;

  const upper = t.toUpperCase();
  const iso = (isoCountryCode || '').toUpperCase();

  // Two-letter US state
  if (/^[A-Z]{2}$/.test(upper) && US_STATE_CODE_TO_FULL_NAME[upper]) {
    return US_STATE_CODE_TO_FULL_NAME[upper];
  }

  // Two-letter Canadian province
  if (/^[A-Z]{2}$/.test(upper) && CA_PROVINCE_CODE_TO_FULL_NAME[upper]) {
    return CA_PROVINCE_CODE_TO_FULL_NAME[upper];
  }

  const key = lettersOnlyKey(t);
  if (!key) return t;

  if (iso === 'CA' || (!iso && CA_NAME_KEY_TO_CANONICAL[key])) {
    const ca = CA_NAME_KEY_TO_CANONICAL[key];
    if (ca) return ca;
  }

  const us = US_NAME_KEY_TO_CANONICAL[key];
  if (us) return us;

  if (!iso || iso === 'US' || iso === 'USA') {
    const ca = CA_NAME_KEY_TO_CANONICAL[key];
    if (ca) return ca;
  }

  // Geocoder may return title case already (e.g. "California")
  return t;
}
