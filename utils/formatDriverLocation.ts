/** US state abbreviation → full name */
const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
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
  DC: 'District of Columbia',
};

const US_STATE_NAME_KEY_TO_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_ABBR_TO_NAME).map(([abbr, name]) => [
    name.toLowerCase().replace(/[^a-z]/g, ''),
    abbr,
  ]),
);

/** Normalize full state name to two-letter abbreviation when possible. */
export function toStateAbbreviation(state: string | null | undefined): string | null {
  const trimmed = state?.trim();
  if (!trimmed) return null;

  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const key = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  return US_STATE_NAME_KEY_TO_ABBR[key] ?? trimmed;
}

/** "City, State ZIP" → "City, ST ZIP" for offer/route display. */
export function abbreviateStateInLocationString(
  location: string | null | undefined,
): string {
  const trimmed = location?.trim();
  if (!trimmed) return trimmed ?? '';

  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1) return trimmed;

  const city = trimmed.slice(0, commaIdx).trim();
  const rest = trimmed.slice(commaIdx + 1).trim();
  if (!rest) return trimmed;

  const zipMatch = rest.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
  const statePart = (zipMatch ? zipMatch[1] : rest).trim();
  const zip = zipMatch?.[2] ?? '';
  const abbr = toStateAbbreviation(statePart) ?? statePart;

  const stateZip = zip ? `${abbr} ${zip}` : abbr;
  return `${city}, ${stateZip}`;
}

/** Format: City, ST, ZIP — single line for easy copy. */
export function formatDriverLocationLine(
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string {
  const parts: string[] = [];

  const cityTrimmed = city?.trim();
  if (cityTrimmed) parts.push(cityTrimmed);

  const stateAbbr = toStateAbbreviation(state);
  if (stateAbbr) parts.push(stateAbbr);

  const zipTrimmed = zip?.trim();
  if (zipTrimmed) parts.push(zipTrimmed);

  return parts.length > 0 ? parts.join(', ') : 'N/A';
}
