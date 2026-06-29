import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fonts, fp, rem } from '@/lib';
import { CREATE_OFFER_SPECIAL_REQUIREMENTS } from '@/constants/driversListConstants';
import {
  getSpecialRequirementIcon,
  normalizeSpecialRequirementValue,
} from '@/icons/specialRequirements';

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
  iconSize = rem(36),
}: SpecialRequirementsListProps) {
  if (values.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {values.map((value, index) => {
        const label = getSpecialRequirementLabel(value);
        const Icon = getSpecialRequirementIcon(value);

        return (
          <View key={`${value}-${index}`} style={styles.item}>
            <Text style={[styles.text, textStyle]}>{label}</Text>
            {Icon ? (
              <View style={styles.iconWrap}>
                <Icon
                  width={iconSize}
                  height={iconSize}
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={`${label} icon`}
                />
              </View>
            ) : null}
            {index < values.length - 1 ? (
              <Text style={[styles.text, textStyle]}>, </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    lineHeight: fp(20),
  },
  iconWrap: {
    marginLeft: rem(8),
    marginRight: rem(4),
  },
});
