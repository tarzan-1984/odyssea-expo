import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fp, rem } from '@/lib';

type Props = {
  value: number;
  max?: number;
  size?: number;
};

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <Text style={[styles.star, { fontSize: size }, filled ? styles.starFilled : styles.starEmpty]}>
      ★
    </Text>
  );
}

export default function StarRatingDisplay({ value, max = 5, size = fp(16) }: Props) {
  const rounded = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <View style={styles.row} accessibilityLabel={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, index) => (
        <StarIcon key={index + 1} filled={index + 1 <= rounded} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(2),
  },
  star: {
    lineHeight: fp(18),
  },
  starFilled: {
    color: '#FBBF24',
  },
  starEmpty: {
    color: '#D1D5DB',
  },
});
