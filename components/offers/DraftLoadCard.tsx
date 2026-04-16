import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, rem, fp } from '@/lib';
import type { DriverDraftLoadItem } from '@/app-api/offers';

/**
 * Draft load row — same visual language as {@link OfferCard} (border, typography, meta row).
 */
export default function DraftLoadCard({ item }: { item: DriverDraftLoadItem }) {
  const idLabel = item.offer_numeric_id ?? item.offer_id;
  const title =
    item.offer_name?.trim() ||
    (item.offer_numeric_id != null
      ? `Offer #${item.offer_numeric_id}`
      : String(item.offer_id));

  const loadedPart =
    item.loaded_miles != null && Number.isFinite(item.loaded_miles)
      ? `Loaded: ${item.loaded_miles} mi`
      : '';
  const ratePart =
    item.driver_rate != null && Number.isFinite(item.driver_rate)
      ? `Driver rate: $${item.driver_rate}`
      : '';

  return (
    <View style={[styles.card, styles.cardActive]}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title} (id: {idLabel})
        </Text>
      </View>

      {loadedPart || ratePart ? (
        <View style={styles.loadedRow}>
          {loadedPart ? (
            <Text style={[styles.meta, styles.metaFlex]} numberOfLines={1}>
              {loadedPart}
            </Text>
          ) : (
            <View style={styles.metaFlex} />
          )}
          {ratePart ? (
            <Text style={styles.meta} numberOfLines={1}>
              {ratePart}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Mirrors `OfferCard` styles for a consistent Work tab look. */
const styles = StyleSheet.create({
  card: {
    /** Light blue tint so draft loads read distinct from offer cards */
    backgroundColor: '#EEF4FB',
    borderRadius: rem(12),
    padding: rem(16),
    marginBottom: rem(12),
    borderWidth: 2,
    borderColor: colors.neutral.lightGrey,
  },
  cardActive: {
    borderColor: colors.semantic.success,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(8),
    marginBottom: rem(6),
  },
  title: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  loadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rem(8),
    marginTop: rem(4),
  },
  meta: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  metaFlex: {
    flex: 1,
    minWidth: 0,
  },
});
