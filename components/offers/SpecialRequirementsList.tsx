import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import { CREATE_OFFER_SPECIAL_REQUIREMENTS } from '@/constants/driversListConstants';
import {
  getSpecialRequirementIcon,
  normalizeSpecialRequirementValue,
} from '@/icons/specialRequirements';

const COLUMNS = 3;
const ICON_SIZE = rem(32);
const ICON_WRAPPER_SIZE = rem(44);

function formatSpecialRequirementLabel(value: string): string {
  return String(value)
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSpecialRequirementLabel(value: string): string {
  const normalized = normalizeSpecialRequirementValue(value);
  const match = CREATE_OFFER_SPECIAL_REQUIREMENTS.find((option) => option.value === normalized);
  if (match) return match.label;

  const byLabel = CREATE_OFFER_SPECIAL_REQUIREMENTS.find(
    (option) => option.label.toLowerCase() === value.trim().toLowerCase(),
  );
  if (byLabel) return byLabel.label;

  return formatSpecialRequirementLabel(value);
}

interface SpecialRequirementsListProps {
  values: string[];
  textStyle?: object;
  iconSize?: number;
}

export default function SpecialRequirementsList({
  values,
  textStyle,
  iconSize = ICON_SIZE,
}: SpecialRequirementsListProps) {
  if (values.length === 0) return null;

  return (
    <View style={styles.grid}>
      {values.map((value, index) => {
        const label = getSpecialRequirementLabel(value);
        const Icon = getSpecialRequirementIcon(value);

        return (
          <View key={`${value}-${index}`} style={styles.cell}>
            <View style={styles.iconWrap}>
              {Icon ? (
                <Icon
                  width={iconSize}
                  height={iconSize}
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={`${label} icon`}
                />
              ) : (
                <Text style={styles.fallbackIcon}>?</Text>
              )}
            </View>
            <Text style={[styles.label, textStyle]} numberOfLines={2}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: rem(4),
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    paddingHorizontal: rem(4),
    paddingVertical: rem(10),
    alignItems: 'center',
  },
  iconWrap: {
    width: ICON_WRAPPER_SIZE,
    height: ICON_WRAPPER_SIZE,
    borderRadius: rem(8),
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rem(6),
  },
  label: {
    width: '100%',
    fontSize: fp(11),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(14),
    textAlign: 'center',
  },
  fallbackIcon: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
});
