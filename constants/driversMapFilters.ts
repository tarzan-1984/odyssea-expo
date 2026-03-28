/**
 * Filter options for drivers map - same as Next.js drivers-map
 */

/** Labels for map status picker (no "All statuses" — empty string means all). */
const DRIVER_MAP_STATUS_LABELS_BASE = [
  'Available',
  'Available on',
  'Not available',
  'Loaded & Enroute',
] as const;

/**
 * Map filters status dropdown: same rules as drivers list (no out-of-service /
 * vacation / no-updates; Blocked only for administrators).
 */
export function getDriverMapStatusFilterLabels(isAdministrator: boolean): string[] {
  const labels = [...DRIVER_MAP_STATUS_LABELS_BASE];
  if (isAdministrator) labels.push('Blocked');
  return labels;
}

export const CAPABILITIES_OPTIONS = [
  { value: 'cdl', label: 'CDL' },
  { value: 'hazmat', label: 'Hazmat' },
  { value: 'tsa', label: 'TSA' },
  { value: 'twic', label: 'TWIC' },
  { value: 'tanker-endorsement', label: 'Tanker endorsement' },
  { value: 'dock-high', label: 'Dock High' },
  { value: 'liftgate', label: 'Liftgate' },
  { value: 'team', label: 'Team' },
  { value: 'canada', label: 'Canada' },
  { value: 'mexico', label: 'Mexico' },
] as const;

export const RADIUS_OPTIONS = [
  { value: '50', label: '50 miles' },
  { value: '100', label: '100 miles' },
  { value: '150', label: '150 miles' },
  { value: '200', label: '200 miles' },
  { value: '250', label: '250 miles' },
  { value: '300', label: '300 miles' },
  { value: '400', label: '400 miles' },
  { value: '500', label: '500 miles' },
  { value: '600', label: '600 miles' },
  { value: '800', label: '800 miles' },
  { value: '1000', label: '1000 miles' },
] as const;

export const LOCATION_OPTIONS = [
  { value: 'USA' as const, label: 'USA' },
  { value: 'Canada' as const, label: 'Canada' },
] as const;

/** Maps raw driver_status (e.g. available_off) to filter label - same logic as drivers-list. */
export function getStatusLabelForFilter(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  const key = status.toString().toLowerCase();
  const labels: Record<string, string> = {
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
    on_hold: 'On hold',
    need_update: 'Need update',
  };
  return labels[key] ?? status;
}
