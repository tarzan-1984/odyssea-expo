/**
 * Mirrors Next.js DriversListTable / drivers map — status colors, labels, filter options.
 */

export const DRIVER_STATUS_COLORS: Record<string, string> = {
  available: '#8fbf8f',
  available_on: '#dcecdc',
  loaded_enroute: '#dcecdc',
  available_off: '#d4a5a5',
  banned: '#ffb261',
  no_interview: '#d60000',
  expired_documents: '#d60000',
  blocked: '#d60000',
  on_vocation: '#e0b0c4',
  on_hold: '#b2b2b2',
  need_update: '#f1cfcf',
  no_updates: '#ff3939',
  unknown: '#808080',
};

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  available_on: 'Available on',
  available_off: 'Not available',
  loaded_enroute: 'Loaded & Enroute',
  banned: 'Out of service',
  on_vocation: 'On vacation',
  no_updates: 'No updates',
  blocked: 'Blocked',
  expired_documents: 'Expired documents',
  no_interview: 'No Interview',
  no_Interview: 'No Interview',
  on_hold: 'On hold',
  need_update: 'Need update',
  unknown: 'Unknown',
};

export function getDriverStatusColor(status: string | null | undefined): string {
  if (!status) return DRIVER_STATUS_COLORS.unknown;
  return DRIVER_STATUS_COLORS[status.toLowerCase()] ?? DRIVER_STATUS_COLORS.unknown;
}

/** Same as Next getStatusLabel — used for display and client-side status filter match */
export function getDriverStatusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS.unknown;
  const key = status.toString();
  return STATUS_LABELS[key] ?? STATUS_LABELS[key.toLowerCase()] ?? status;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim();
  if (!h.startsWith('#')) return null;
  h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Text / icon color for overlays on a status-colored header (readable on any DRIVER_STATUS_COLORS value).
 */
export function getContrastTextOnStatusBackground(bgHex: string): '#ffffff' | '#0f172a' {
  const rgb = parseHexRgb(bgHex);
  if (!rgb) return '#ffffff';
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 138 ? '#0f172a' : '#ffffff';
}

/**
 * Status picker for drivers list / TMS filters (modal).
 * Values match TMS status_filter keys. Blocked / Out of service only for
 * DRIVERS_MAP_RESTRICTED_STATUS_VIEWER_ROLES — use getDriverStatusFilterModalOptions().
 */
export const DRIVER_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'for_offers', label: 'Default' },
  { value: 'available', label: 'Available' },
  { value: 'available_on', label: 'Available on' },
  { value: 'available_off', label: 'Not available' },
  { value: 'loaded_enroute', label: 'Loaded & Enroute' },
  { value: 'on_vocation', label: 'On vacation' },
  { value: 'expired_documents', label: 'Expired documents' },
];

export const DRIVER_STATUS_FILTER_OPTION_BANNED = {
  value: 'banned',
  label: 'Out of service',
} as const;

export const DRIVER_STATUS_FILTER_OPTION_BLOCKED = {
  value: 'blocked',
  label: 'Blocked',
} as const;

/** Status values hidden from users without restricted-status viewer roles. */
export const RESTRICTED_DRIVER_STATUS_FILTER_VALUES = new Set(['blocked', 'banned']);

export function getDriverStatusFilterModalOptions(
  canViewRestrictedStatuses: boolean
): { value: string; label: string }[] {
  if (!canViewRestrictedStatuses) {
    return DRIVER_STATUS_FILTER_OPTIONS;
  }
  const options = [...DRIVER_STATUS_FILTER_OPTIONS];
  // Insert banned/blocked in TMS order: after loaded_enroute, before on_vocation
  const insertAt = options.findIndex((o) => o.value === 'on_vocation');
  const restricted = [
    DRIVER_STATUS_FILTER_OPTION_BANNED,
    DRIVER_STATUS_FILTER_OPTION_BLOCKED,
  ];
  if (insertAt >= 0) {
    options.splice(insertAt, 0, ...restricted);
  } else {
    options.push(...restricted);
  }
  return options;
}

export const RADIUS_MILES_OPTIONS = [
  '50',
  '100',
  '150',
  '200',
  '250',
  '300',
  '400',
  '500',
  '600',
  '800',
  '1000',
] as const;

export type LocationCountryFilter = 'USA' | 'Canada';

/** Capability values for TMS query (same as Next CAPABILITIES_OPTIONS.value) */
export const DRIVER_CAPABILITY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'cdl', label: 'CDL' },
  { value: 'hazmat', label: 'Hazmat' },
  { value: 'tsa', label: 'TSA' },
  { value: 'twic', label: 'TWIC' },
  { value: 'tanker-endorsement', label: 'Tanker endorsement' },
  { value: 'ppe', label: 'PPE' },
  { value: 'dock-high', label: 'Dock High' },
  { value: 'e-track', label: 'E-tracks' },
  { value: 'pallet-jack', label: 'Pallet jack' },
  { value: 'ramp', label: 'Ramp' },
  { value: 'load-bars', label: 'Load bars' },
  { value: 'liftgate', label: 'Liftgate' },
  { value: 'team', label: 'Team' },
  { value: 'canada', label: 'Canada' },
  { value: 'mexico', label: 'Mexico' },
  { value: 'alaska', label: 'Alaska' },
  { value: 'real_id', label: 'Real ID' },
  { value: 'macropoint', label: 'MacroPoint' },
  { value: 'tucker-tools', label: 'Trucker Tools' },
  { value: 'change-9', label: 'Change 9' },
  { value: 'sleeper', label: 'Sleeper' },
  { value: 'printer', label: 'Printer' },
  { value: 'side_door', label: 'Side door' },
];

/** Create offer — special requirements (Next.js CreateOfferModal MultiSelect) */
export const CREATE_OFFER_SPECIAL_REQUIREMENTS: { value: string; label: string }[] = [
  { value: 'hazmat', label: 'Hazmat' },
  { value: 'tanker-end', label: 'Tanker End' },
  { value: 'direct-delivery', label: 'Direct Delivery' },
  { value: 'driver-assist', label: 'Driver assist' },
  { value: 'liftgate', label: 'Liftgate' },
  { value: 'pallet-jack', label: 'Pallet Jack' },
  { value: 'dock-high', label: 'Dock High' },
  { value: 'true-team', label: 'True team' },
  { value: 'fake-team', label: 'Fake team' },
  { value: 'tsa', label: 'TSA' },
  { value: 'twic', label: 'TWIC' },
  { value: 'airport', label: 'Airport' },
  { value: 'round-trip', label: 'Round trip' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'temperature-control', label: 'Temperature control' },
  { value: 'ace', label: 'ACE' },
  { value: 'aci', label: 'ACI' },
  { value: 'mexico', label: 'Mexico' },
  { value: 'military-base', label: 'Military base' },
  { value: 'blind-shipment', label: 'Blind shipment' },
  { value: 'partial', label: 'Partial' },
  { value: 'white-glove-service', label: 'White glove service' },
  { value: 'high-value-freight', label: 'High value freight' },
  { value: 'fragile', label: 'Fragile' },
  { value: 'hemp-product', label: 'Hemp product' },
];

export function formatVehicleType(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function formatDateMmDdYy(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const y = date.getFullYear().toString().slice(-2);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${m}/${d}/${y} ${hours}:${minutes}${ampm}`;
}

/** Statuses that show `date_available` instead of location-update timestamps. */
const DATE_AVAILABLE_STATUSES = new Set([
  'available_on',
  'loaded_enroute',
  'on_vocation',
]);

export function usesDateAvailableForDisplay(status: string | null | undefined): boolean {
  if (!status) return false;
  return DATE_AVAILABLE_STATUSES.has(status.trim().toLowerCase());
}
