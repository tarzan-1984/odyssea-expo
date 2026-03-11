import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { colors, fonts, rem, fp } from '@/lib';
import { OfferRow, routeSummary } from '@/app-api/offers';
import OfferInactiveIcon from '@/icons/OfferInactiveIcon';

function hasHazmat(specialRequirements: unknown): boolean {
  if (!specialRequirements) return false;
  if (Array.isArray(specialRequirements)) {
    return specialRequirements.some(
      (v) => String(v).toLowerCase() === 'hazmat'
    );
  }
  return String(specialRequirements).toLowerCase().includes('hazmat');
}

interface OfferCardProps {
  offer: OfferRow;
  onPress: () => void;
  /** For driver: active offer = green border + clickable; inactive = red border + no navigation */
  isDriver?: boolean;
}

/**
 * Unified offer card for all roles.
 * For drivers: green border when active, red when inactive; inactive blocks navigation.
 */
export default function OfferCard({ offer, onPress, isDriver }: OfferCardProps) {
  const title = routeSummary(offer.route) || '—';
  const isInactiveForDriver = isDriver && offer.active === false;
  const showHazmat = hasHazmat(offer.special_requirements);
  const canNavigate = !isInactiveForDriver;

  const cardStyle = isDriver
    ? offer.active
      ? styles.cardActive
      : styles.cardInactive
    : styles.card;

  return (
    <TouchableOpacity
      style={[styles.card, cardStyle]}
      onPress={canNavigate ? onPress : undefined}
      activeOpacity={canNavigate ? 0.7 : 1}
      disabled={!canNavigate}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title} (id: {offer.id})
        </Text>
        {showHazmat && (
          <Image
            source={require('@/icons/hazmat.png')}
            style={styles.hazmatIcon}
            resizeMode="contain"
          />
        )}
      </View>
      {offer.loaded_miles != null && (
        <View style={styles.loadedRow}>
          <Text style={styles.meta}>Loaded: {offer.loaded_miles} mi</Text>
          {isInactiveForDriver && (
            <OfferInactiveIcon width={30} height={30} color="#FF0000" />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    padding: rem(16),
    marginBottom: rem(12),
    borderWidth: 2,
    borderColor: colors.neutral.lightGrey,
  },
  cardActive: {
    borderColor: colors.semantic.success,
  },
  cardInactive: {
    borderColor: colors.semantic.error,
    backgroundColor: '#FEF2F2',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rem(8),
    marginBottom: rem(8),
  },
  title: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  hazmatIcon: {
    width: rem(56),
    height: rem(56),
  },
  loadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rem(8),
  },
  meta: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
});
