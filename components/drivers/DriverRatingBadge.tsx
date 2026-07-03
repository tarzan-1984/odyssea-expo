import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { fonts, fp, rem } from '@/lib';
import {
  formatRatingButtonValue,
  getDriverRatingStyle,
} from '@/utils/driverRatingStyles';

type Props = {
  avgRating: number | null | undefined;
  onPress: () => void;
};

export default function DriverRatingBadge({ avgRating, onPress }: Props) {
  const numericRating =
    avgRating != null && !Number.isNaN(Number(avgRating)) ? Number(avgRating) : null;
  const hasRating = numericRating != null && numericRating > 0;
  const displayValue = formatRatingButtonValue(avgRating);
  const style = getDriverRatingStyle(hasRating ? numericRating : null);

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: style.backgroundColor }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Driver rating ${displayValue}`}
    >
      <Text style={[styles.text, { color: style.color }]}>{displayValue}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: rem(52),
    paddingVertical: rem(6),
    paddingHorizontal: rem(12),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
  },
});
