import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { fp, rem } from '@/lib';

type Props = {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  disabled?: boolean;
};

function StarButton({
  filled,
  onPress,
  disabled,
  label,
}: {
  filled: boolean;
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      activeOpacity={0.7}
    >
      <Text style={[styles.star, filled ? styles.starFilled : styles.starEmpty]}>★</Text>
    </TouchableOpacity>
  );
}

export default function StarRatingInput({
  value,
  onChange,
  max = 5,
  disabled = false,
}: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const filled = starValue <= value;
        return (
          <StarButton
            key={starValue}
            filled={filled}
            disabled={disabled}
            label={`${starValue} star${starValue === 1 ? '' : 's'}`}
            onPress={() => onChange(starValue)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(4),
  },
  star: {
    fontSize: fp(28),
    lineHeight: fp(32),
  },
  starFilled: {
    color: '#FBBF24',
  },
  starEmpty: {
    color: '#D1D5DB',
  },
});
