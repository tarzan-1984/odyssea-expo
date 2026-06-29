import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import AceIcon from './ACE.svg';
import AciIcon from './ACI.svg';
import AirportIcon from './airport.svg';
import AlcoholIcon from './alcohol.svg';
import BlindShipmentIcon from './blind_shipment.svg';
import DockHighIcon from './dock-high.svg';
import DirectDeliveryIcon from './direct-delivery.svg';
import DriverAssistIcon from './driver_assist.svg';
import FakeTeamIcon from './fake _team.svg';
import FragileIcon from './fragile.svg';
import GloveIcon from './glove.svg';
import HazmatIcon from './hazmat.svg';
import HempProductIcon from './hemp_product.svg';
import HighValueFreightIcon from './high_value _reight.svg';
import LiftgateIcon from './liftgate.svg';
import MexicoIcon from './mexico.svg';
import MilitaryIcon from './military.svg';
import PartialIcon from './partial.svg';
import PalletJackIcon from './pallet-jack.svg';
import RoundTripIcon from './round_trip.svg';
import TankerEndorsementIcon from './tanker-endorsement.svg';
import TeamIcon from './team.svg';
import TemperatureControlIcon from './temperature_control.svg';
import TsaIcon from './tsa.svg';
import TwicIcon from './twic.svg';

export type SpecialRequirementIconComponent = FC<SvgProps>;

/** API values from CREATE_OFFER_SPECIAL_REQUIREMENTS → SVG icon. */
export const SPECIAL_REQ_ICON_MAP: Record<string, SpecialRequirementIconComponent> = {
  ace: AceIcon,
  aci: AciIcon,
  airport: AirportIcon,
  alcohol: AlcoholIcon,
  'blind-shipment': BlindShipmentIcon,
  'direct-delivery': DirectDeliveryIcon,
  'dock-high': DockHighIcon,
  'driver-assist': DriverAssistIcon,
  'fake-team': FakeTeamIcon,
  fragile: FragileIcon,
  'hemp-product': HempProductIcon,
  'high-value-freight': HighValueFreightIcon,
  hazmat: HazmatIcon,
  liftgate: LiftgateIcon,
  mexico: MexicoIcon,
  'military-base': MilitaryIcon,
  'pallet-jack': PalletJackIcon,
  partial: PartialIcon,
  'round-trip': RoundTripIcon,
  tsa: TsaIcon,
  twic: TwicIcon,
  'temperature-control': TemperatureControlIcon,
  'true-team': TeamIcon,
  'tanker-end': TankerEndorsementIcon,
  'white-glove-service': GloveIcon,
};

export function normalizeSpecialRequirementValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}

export function getSpecialRequirementIcon(
  value: string,
): SpecialRequirementIconComponent | null {
  const key = normalizeSpecialRequirementValue(value);
  return SPECIAL_REQ_ICON_MAP[key] ?? null;
}

export function parseSpecialRequirements(sr: unknown): string[] {
  if (!sr) return [];
  if (Array.isArray(sr)) return sr.map((v) => String(v).trim()).filter(Boolean);
  const s = String(sr).trim();
  return s ? [s] : [];
}
