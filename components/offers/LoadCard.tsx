import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts, rem, fp } from '@/lib';
import type { YourLoadItem } from '@/app-api/loads';
import { labelForDriverLoadStatus } from '@/constants/driverLoadStatuses';
import { abbreviateStateInLocationString } from '@/utils/formatDriverLocation';
import { formatRatePerMile, sumLoadedAndEmptyMiles } from '@/utils/ratePerMile';

function backgroundForStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === 'waiting-on-pu-date') return '#F3F4F6'; // neutral
  if (s === 'at-pu') return '#E6F2FF'; // blue
  if (s === 'loaded-enroute') return '#FFF4E5'; // amber
  if (s === 'at-del') return '#F3E8FF'; // purple
  if (s === 'delivered') return '#EAF7EF'; // green
  if (s === 'waiting-on-rc') return '#FFF7D6'; // yellow
  if (s === 'tonu') return '#FFE7D6'; // orange
  if (s === 'cancelled') return '#FDECEC'; // red
  return '#EEF4FB';
}

function badgeForStatus(status: string): { bg: string; fg: string } {
  const s = status.trim().toLowerCase();
  if (s === 'waiting-on-pu-date') return { bg: '#E5E7EB', fg: '#111827' };
  if (s === 'at-pu') return { bg: '#CFE6FF', fg: '#0B3A75' };
  if (s === 'loaded-enroute') return { bg: '#FFE2B8', fg: '#7A3E00' };
  if (s === 'at-del') return { bg: '#E9D5FF', fg: '#4C1D95' };
  if (s === 'delivered') return { bg: '#CFEFD8', fg: '#0F5132' };
  if (s === 'waiting-on-rc') return { bg: '#FFE8A3', fg: '#5A4100' };
  if (s === 'tonu') return { bg: '#FFD0B3', fg: '#7A2E00' };
  if (s === 'cancelled') return { bg: '#F9C8C8', fg: '#7A0B0B' };
  return { bg: '#D9E6F7', fg: colors.primary.blue };
}

export default function LoadCard({
  item,
  onPress,
}: {
  item: YourLoadItem;
  onPress?: (row: YourLoadItem) => void;
}) {
  const title = [item.from_short_address, item.to_short_address]
    .filter(Boolean)
    .map((address) => abbreviateStateInLocationString(address))
    .join(' -> ');
  const statusLabel = item.load_status ? labelForDriverLoadStatus(item.load_status) : '';
  const badge = badgeForStatus(item.load_status);
  const loadedPart =
    item.loaded_miles != null && Number.isFinite(item.loaded_miles)
      ? `Loaded: ${item.loaded_miles.toLocaleString('en-US', { maximumFractionDigits: 0 })} mi`
      : '';
  const ratePart =
    item.driver_rate != null && Number.isFinite(item.driver_rate)
      ? `Driver rate: $${item.driver_rate}`
      : '';
  const totalMiles = sumLoadedAndEmptyMiles(item.loaded_miles, item.empty_miles);
  const ratePerMilePart = formatRatePerMile(item.driver_rate, totalMiles);

  const CardWrap = onPress ? TouchableOpacity : View;

  return (
    <CardWrap
      {...(onPress
        ? {
            onPress: () => onPress(item),
            activeOpacity: 0.85,
          }
        : null)}
      style={[styles.card, { backgroundColor: backgroundForStatus(item.load_status) }]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title || `Load #${item.tms_load_id}`}
        </Text>
        {statusLabel ? (
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.fg }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {(item.reference_number || ratePart) ? (
        <View style={styles.metaRow}>
          {item.reference_number ? (
            <Text style={[styles.loadId, styles.metaLeft]} numberOfLines={1}>
              Reference number: {item.reference_number}
            </Text>
          ) : (
            <View style={styles.metaLeft} />
          )}
          {ratePart ? (
            <Text style={[styles.meta, styles.metaRightText]} numberOfLines={1}>
              {ratePart}
            </Text>
          ) : (
            <View style={styles.metaRight} />
          )}
        </View>
      ) : null}

      {(loadedPart || ratePerMilePart) ? (
        <View style={styles.metaRow}>
          {loadedPart ? (
            <Text style={[styles.meta, styles.metaLeft]} numberOfLines={1}>
              {loadedPart}
            </Text>
          ) : (
            <View style={styles.metaLeft} />
          )}
          {ratePerMilePart ? (
            <Text style={[styles.meta, styles.metaRightText]} numberOfLines={1}>
              Rate per mile: {ratePerMilePart}
            </Text>
          ) : (
            <View style={styles.metaRight} />
          )}
        </View>
      ) : null}
    </CardWrap>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: rem(12),
    padding: rem(16),
    marginBottom: rem(12),
    borderWidth: 2,
    borderColor: colors.neutral.lightGrey,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(8),
  },
  statusBadge: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(4),
    borderRadius: rem(999),
    maxWidth: '45%',
  },
  statusBadgeText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
  },
  title: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  loadId: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(8),
    marginTop: rem(6),
  },
  metaLeft: {
    flex: 1,
    minWidth: 0,
  },
  metaRight: {
    flex: 1,
    minWidth: 0,
    maxWidth: '48%',
  },
  metaRightText: {
    flex: 1,
    minWidth: 0,
    maxWidth: '48%',
    textAlign: 'right',
  },
  meta: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
});
