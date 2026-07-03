import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, rem, fp } from '@/lib';
import OfferUpdatedIcon from '@/icons/OfferUpdatedIcon';

interface OfferUpdatedNoticeProps {
  style?: StyleProp<ViewStyle>;
  bordered?: boolean;
}

export default function OfferUpdatedNotice({
  style,
  bordered = true,
}: OfferUpdatedNoticeProps) {
  return (
    <View style={[styles.row, bordered && styles.bordered, style]}>
      <OfferUpdatedIcon width={rem(18)} height={rem(18)} color={colors.primary.blue} />
      <Text style={styles.text}>
        This offer has been updated. Please review the changes
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rem(8),
  },
  bordered: {
    marginTop: rem(10),
    paddingTop: rem(10),
    borderTopWidth: 1,
    borderTopColor: colors.neutral.lightGrey,
  },
  text: {
    flex: 1,
    fontSize: fp(13),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(18),
  },
});
