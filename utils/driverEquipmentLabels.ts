import type { TmsDriverMeta } from '@/app-api/tmsDriverSearch';

/** Human-readable equipment flags (aligned with Next.js DriversListTable tooltips). */
export function getDriverEquipmentLabels(meta: TmsDriverMeta | undefined): string[] {
  if (!meta) return [];
  const labels: string[] = [];
  const on = (v: unknown) => v === 'on' || v === 'yes' || v === '1';

  if (on(meta.twic)) labels.push('TWIC');
  if (on(meta.hazmat_certificate)) labels.push('Hazmat Certificate');
  if (on(meta.team_driver_enabled)) labels.push('Team Driver');
  if (meta.driver_licence_type === 'cdl') labels.push('CDL');
  if (meta.driver_licence_type === 'tsa_approved') labels.push('TSA');
  if (on(meta.hazmat_endorsement)) labels.push('Hazmat Endorsement');
  if (on(meta.change_9_training)) labels.push('Change 9');
  if (on(meta.tanker_endorsement)) labels.push('Tanker endorsement');
  if (on(meta.background_check)) labels.push('Background Check');
  if (on(meta.lift_gate)) labels.push('Liftgate');
  if (on(meta.pallet_jack)) labels.push('Pallet jack');
  if (on(meta.dock_high)) labels.push('Dock High');
  if (on(meta.e_tracks)) labels.push('E-tracks');
  if (on(meta.load_bars)) labels.push('Load bars');
  if (on(meta.ramp)) labels.push('Ramp');
  if (on(meta.sleeper)) labels.push('Sleeper');
  if (on(meta.printer)) labels.push('Printer');
  if (on(meta.side_door)) labels.push('Side door');
  if (on(meta.macro_point)) labels.push('MacroPoint');
  if (on(meta.trucker_tools)) labels.push('Trucker Tools');

  return labels;
}
