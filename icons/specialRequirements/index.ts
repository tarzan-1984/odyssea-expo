/**
 * Maps special requirement values from offer.special_requirements to icon assets.
 * Keys: normalized strings (lowercase, spaces/underscores -> hyphens) matching API values.
 * API sends values like "hazmat", "tanker-end", "liftgate", "driver-assist", etc.
 * All 24 values from backend CreateOfferModal are mapped to PNG files in this folder.
 */

export const SPECIAL_REQ_ICONS: Record<string, number> = {
  // Backend CreateOfferModal values (exact match)
  ace: require('./ACE.png'),
  aci: require('./ACI.png'),
  airport: require('./Airport.png'),
  alcohol: require('./Alcohol.png'),
  'blind-shipment': require('./Blind-shipmen.png'),
  'blind-shipmen': require('./Blind-shipmen.png'), // fallback for filename variant
  'dock-high': require('./DockHigh.png'),
  'driver-assist': require('./DriverAssist.png'),
  'fake-team': require('./FakeTeam.png'),
  fragile: require('./Fragile.png'),
  'hemp-product': require('./HempProduct.png'),
  'high-value-freight': require('./HighValueFreight.png'),
  hazmat: require('./hazmat.png'),
  liftgate: require('./Liftgate.png'),
  mexico: require('./Mexico.png'),
  'military-base': require('./MilitaryBase.png'),
  'pallet-jack': require('./PalletJack.png'),
  partial: require('./Partial.png'),
  'round-trip': require('./RoundTrip.png'),
  tsa: require('./TSA.png'),
  twic: require('./TWIC.png'),
  'temperature-control': require('./TemperatureControl.png'),
  'true-team': require('./TrueTeam.png'),
  'tanker-end': require('./TankerEnd.png'),
  'white-glove-service': require('./WhiteGloveService.png'),
};
