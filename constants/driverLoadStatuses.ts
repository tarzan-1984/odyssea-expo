/** TMS driver loads list — same values as web `<select name="status">`. */
export const DRIVER_LOAD_STATUS_OPTIONS = [
  { value: 'all', label: 'All loads' },
  { value: 'waiting-on-pu-date', label: 'Waiting on PU Date' },
  { value: 'at-pu', label: '@PU' },
  { value: 'loaded-enroute', label: 'Loaded & Enroute' },
  { value: 'at-del', label: '@DEL' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'tonu', label: 'TONU' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'waiting-on-rc', label: 'Waiting on RC' },
] as const;

export type DriverLoadStatusValue = (typeof DRIVER_LOAD_STATUS_OPTIONS)[number]['value'];

export const DEFAULT_DRIVER_LOAD_STATUS: DriverLoadStatusValue = 'all';

export function labelForDriverLoadStatus(value: string): string {
  const row = DRIVER_LOAD_STATUS_OPTIONS.find((o) => o.value === value);
  return row?.label ?? value;
}
