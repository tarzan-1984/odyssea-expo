import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import type { TmsDriver } from '@/app-api/tmsDriverSearch';
import {
  formatDateMmDdYy,
  formatVehicleType,
  getContrastTextOnStatusBackground,
  getDriverStatusColor,
  getDriverStatusLabel,
} from '@/constants/driversListConstants';
import { getDriverEquipmentLabels } from '@/utils/driverEquipmentLabels';
import { colors, fonts, rem, fp } from '@/lib';
import DriverNotesModal from '@/components/drivers/DriverNotesModal';
import DriverLanguageFlag from '@/components/drivers/DriverLanguageFlag';

interface DriverCardProps {
  driver: TmsDriver;
  selected: boolean;
  canSelect: boolean;
  onToggleSelect: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  distanceMiles: number | null;
}

export default function DriverCard({
  driver,
  selected,
  canSelect,
  onToggleSelect,
  expanded,
  onToggleExpand,
  distanceMiles,
}: DriverCardProps) {
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const meta = driver.meta_data;
  const rawStatus = meta?.driver_status;
  const statusLabel = getDriverStatusLabel(rawStatus);
  const statusBg = getDriverStatusColor(rawStatus);
  const headerFg = getContrastTextOnStatusBackground(statusBg);
  /** Large line on colored header (driver name) */
  const headerPrimaryText =
    headerFg === '#ffffff'
      ? [styles.cardHeaderPrimary, styles.cardHeaderPrimaryOnDark]
      : [styles.cardHeaderPrimary, styles.cardHeaderPrimaryOnLight];
  /** Smaller line below (status label) */
  const headerSecondaryText =
    headerFg === '#ffffff'
      ? [styles.cardHeaderSecondary, styles.cardHeaderSecondaryOnDark]
      : [styles.cardHeaderSecondary, styles.cardHeaderSecondaryOnLight];

  const dateStr =
    driver.updated_zipcode || driver.date_updated || meta?.status_date || '';
  let locationDate: Date | null = null;
  if (dateStr) {
    const parsed = new Date(dateStr.replace(/\s+/, 'T'));
    if (!Number.isNaN(parsed.getTime())) locationDate = parsed;
  }
  const dateDisplay = locationDate ? formatDateMmDdYy(locationDate) : dateStr || '—';
  const olderThan12h =
    locationDate &&
    Date.now() - locationDate.getTime() > 12 * 60 * 60 * 1000;

  const cityLine = [meta?.current_city, meta?.current_location].filter(Boolean).join(' ');
  const driverId = meta?.driver_id ?? driver.id;
  const name = meta?.driver_name ?? '—';
  const phone = meta?.driver_phone ?? '';
  const phoneDial = phone.replace(/[^\d+]/g, '');
  const canDialPhone = phoneDial.length > 0;

  const vehicleLine1 = formatVehicleType(meta?.vehicle_type);
  const vehicleLine2 = [meta?.vehicle_make, meta?.vehicle_model, meta?.vehicle_year]
    .filter(Boolean)
    .join(' ');

  const equipment = getDriverEquipmentLabels(meta);
  const ratingAvg = driver.rating?.avg_rating;
  const notesCount = driver.notes?.count ?? 0;

  const toggleExpand = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    onToggleExpand();
  };

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <View style={[styles.cardHeader, { backgroundColor: statusBg }]}>
        <TouchableOpacity
          style={[
            styles.headerCheck,
            {
              borderColor: headerFg,
              backgroundColor:
                headerFg === '#ffffff'
                  ? 'rgba(255, 255, 255, 0.22)'
                  : 'rgba(15, 23, 42, 0.07)',
            },
            !canSelect && styles.checkDisabled,
          ]}
          onPress={onToggleSelect}
          disabled={!canSelect}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled: !canSelect }}
        >
          <Text style={[styles.headerCheckMark, { color: headerFg }]}>
            {selected ? '✓' : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerMainTap}
          onPress={onToggleSelect}
          disabled={!canSelect}
          activeOpacity={canSelect ? 0.75 : 1}
        >
          <Text style={headerPrimaryText} numberOfLines={2}>
            ({driverId}) {name}
          </Text>
          <View style={styles.headerStatusRow}>
            <Text style={headerSecondaryText} numberOfLines={1}>
              {statusLabel}
            </Text>
            <DriverLanguageFlag language={meta?.languages} size={rem(18)} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.cardBody, selected && styles.cardBodySelected]}>
        <View style={[styles.locationBlock, olderThan12h && styles.locationStale]}>
          <Text style={styles.locationTitle}>Location & date</Text>
          <View style={styles.locationCityRow}>
            <Text
              style={[styles.locationCity, styles.locationCityFlex]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {cityLine || '—'}
            </Text>
            <Text style={[styles.locationCity, styles.locationCitySep]}> · </Text>
            <Text style={[styles.locationCity, styles.locationDatePart]} numberOfLines={1}>
              {dateDisplay}
            </Text>
          </View>
        </View>

        <View style={styles.phoneDistanceRow}>
          <View style={styles.phoneBlock}>
            <Text style={styles.phoneHeading}>Phone</Text>
            {phone ? (
              canDialPhone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${phoneDial}`)}
                  activeOpacity={0.7}
                  accessibilityRole="link"
                  accessibilityLabel={`Call ${phone}`}
                >
                  <Text style={styles.driverPhoneLink} numberOfLines={1} ellipsizeMode="tail">
                    {phone}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.driverPhone} numberOfLines={1} ellipsizeMode="tail">
                  {phone}
                </Text>
              )
            ) : (
              <Text style={styles.driverPhone} numberOfLines={1}>
                —
              </Text>
            )}
          </View>
          <View style={styles.distanceBlock}>
            <Text style={styles.phoneHeading}>Distance</Text>
            <Text style={styles.distanceBlockValue} numberOfLines={1}>
              {distanceMiles != null
                ? `${Math.round(distanceMiles)} ${
                    Math.round(distanceMiles) === 1 ? 'mile' : 'miles'
                  }`
                : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.expandRow}>
          <TouchableOpacity
            onPress={toggleExpand}
            style={styles.expandBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.expandText} numberOfLines={1}>
              {expanded ? 'Hide details ▲' : 'All details ▼'}
            </Text>
          </TouchableOpacity>
          <View style={styles.ratingOpposite}>
            <Text style={styles.ratingOppositeLabel}>Rating</Text>
            <Text style={styles.ratingOppositeValue}>
              {ratingAvg != null && !Number.isNaN(Number(ratingAvg))
                ? String(ratingAvg)
                : '—'}
            </Text>
          </View>
        </View>

        {expanded ? (
        <View style={styles.details}>
          <View style={styles.detailTwoColRow}>
            <View style={styles.detailCol}>
              <Text style={styles.detailColHeading}>Vehicle</Text>
              <Text style={styles.detailBody}>{vehicleLine1 || '—'}</Text>
              <Text style={styles.detailBody}>{vehicleLine2 || '—'}</Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.detailColHeading}>Dimensions & payload</Text>
              <Text style={styles.detailBody}>{meta?.dimensions ?? '—'}</Text>
              <Text style={styles.detailBody}>
                {meta?.payload ? `${meta.payload} lbs` : '—'}
              </Text>
            </View>
          </View>

          <Text style={styles.detailHeading}>Equipment</Text>
          <Text style={styles.detailBody}>
            {equipment.length ? equipment.join(', ') : '—'}
          </Text>

          <Text style={styles.detailHeading}>Comments</Text>
          <Text style={styles.detailBody}>{meta?.notes?.trim() ? meta.notes : '—'}</Text>

          <Text style={styles.detailHeading}>Notes</Text>
          <TouchableOpacity
            style={styles.notesCountButton}
            onPress={() => setNotesModalOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Open driver notes, ${notesCount}`}
          >
            <View style={styles.notesCountButtonInner}>
              <Text style={styles.notesCountButtonText}>{notesCount}</Text>
              <Image
                source={require('@/icons/driverNotesButton.png')}
                style={styles.notesCountIcon}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
          </TouchableOpacity>
        </View>
        ) : null}
      </View>

      <DriverNotesModal
        visible={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        driverId={String(meta?.driver_id ?? driver.id)}
        driverName={meta?.driver_name?.trim() ? String(meta.driver_name) : 'Driver'}
        notesCount={notesCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: rem(12),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    marginBottom: rem(12),
    backgroundColor: colors.neutral.white,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.primary.blue,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rem(12),
    paddingHorizontal: rem(12),
    gap: rem(10),
  },
  headerCheck: {
    width: rem(21),
    height: rem(21),
    borderRadius: rem(5),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDisabled: {
    opacity: 0.4,
  },
  headerCheckMark: {
    fontSize: fp(11),
    fontFamily: fonts['700'],
    lineHeight: fp(13),
  },
  headerMainTap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: rem(2),
    gap: rem(4),
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: rem(6),
  },
  /** Driver name — large */
  cardHeaderPrimary: {
    fontSize: fp(18),
    fontFamily: fonts['700'],
    letterSpacing: 0.2,
  },
  cardHeaderPrimaryOnLight: {
    color: '#0f172a',
  },
  cardHeaderPrimaryOnDark: {
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /** Status — smaller, under the name */
  cardHeaderSecondary: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    letterSpacing: 0.15,
  },
  cardHeaderSecondaryOnLight: {
    color: '#0f172a',
  },
  cardHeaderSecondaryOnDark: {
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardBody: {
    padding: rem(12),
    backgroundColor: colors.neutral.white,
  },
  cardBodySelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  locationBlock: {
    borderRadius: rem(8),
    padding: rem(10),
    marginBottom: rem(10),
    backgroundColor: 'rgba(255, 240, 240, 0.5)',
  },
  locationStale: {
    backgroundColor: 'rgba(254, 226, 226, 0.7)',
  },
  locationTitle: {
    fontSize: fp(11),
    fontFamily: fonts['600'],
    color: colors.neutral.grey,
    marginBottom: rem(4),
  },
  locationCity: {
    fontSize: fp(15),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
  locationCityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'nowrap',
  },
  locationCityFlex: {
    flex: 1,
    minWidth: 0,
  },
  locationCitySep: {
    flexShrink: 0,
    color: colors.neutral.grey,
  },
  locationDatePart: {
    flexShrink: 0,
  },
  phoneDistanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rem(16),
    marginBottom: rem(8),
  },
  phoneBlock: {
    flex: 1,
    minWidth: 0,
  },
  distanceBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  distanceBlockValue: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    textAlign: 'right',
  },
  phoneHeading: {
    fontSize: fp(11),
    fontFamily: fonts['600'],
    color: colors.neutral.grey,
    marginBottom: rem(4),
  },
  driverPhone: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  driverPhoneLink: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    textDecorationLine: 'underline',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rem(12),
    paddingVertical: rem(8),
  },
  expandBtn: {
    flex: 1,
    minWidth: 0,
  },
  expandText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  ratingOpposite: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  ratingOppositeLabel: {
    fontSize: fp(11),
    fontFamily: fonts['600'],
    color: colors.neutral.grey,
    marginBottom: rem(2),
  },
  ratingOppositeValue: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.darkGrey,
  },
  details: {
    paddingTop: rem(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.neutral.lightGrey,
  },
  detailTwoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rem(14),
    marginTop: rem(10),
  },
  detailCol: {
    flex: 1,
    minWidth: 0,
  },
  detailColHeading: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.neutral.grey,
    marginBottom: rem(4),
  },
  detailHeading: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    color: colors.neutral.grey,
    marginTop: rem(10),
    marginBottom: rem(4),
  },
  detailBody: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(20),
  },
  notesCountButton: {
    alignSelf: 'flex-start',
    minWidth: rem(52),
    paddingVertical: rem(6),
    paddingHorizontal: rem(12),
    borderRadius: rem(8),
    backgroundColor: colors.primary.blue,
    marginTop: rem(4),
  },
  notesCountButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(6),
  },
  notesCountButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  notesCountIcon: {
    width: rem(30),
    height: rem(30),
  },
});
