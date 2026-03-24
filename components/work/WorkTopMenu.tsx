import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, rem, fp } from '@/lib';

type WorkMenuPage = 'loads' | 'offers';

interface WorkTopMenuProps {
  currentPage: WorkMenuPage;
  /** When true, removes bottom margin (e.g. when status filter buttons follow) */
  compactBottom?: boolean;
}

export default function WorkTopMenu({ currentPage, compactBottom }: WorkTopMenuProps) {
  const router = useRouter();

  return (
    <View style={[styles.header, !compactBottom && styles.headerWithMargin]}>
      <TouchableOpacity
        style={[styles.link, styles.linkHalf]}
        onPress={() => {
          if (currentPage !== 'loads') {
            router.push('/work/loads');
          }
        }}
      >
        <Text style={[styles.linkText, currentPage === 'loads' && styles.linkTextActive]}>
          LOADS
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.link, styles.linkHalf]}
        onPress={() => {
          if (currentPage !== 'offers') {
            router.push('/work');
          }
        }}
      >
        <Text style={[styles.linkText, currentPage === 'offers' && styles.linkTextActive]}>
          OFFERS
        </Text>
      </TouchableOpacity>

      <View
        style={[
          styles.underline,
          currentPage === 'loads' ? styles.underlineLeft : styles.underlineRight,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
  },
  headerWithMargin: {
    marginBottom: rem(8),
  },
  link: {
    flex: 1,
    paddingVertical: rem(14),
    paddingBottom: rem(16),
    paddingHorizontal: rem(12),
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkHalf: {
    flex: 1,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    backgroundColor: colors.primary.blue,
  },
  underlineLeft: {
    left: 0,
    right: '50%',
  },
  underlineRight: {
    left: '50%',
    right: 0,
  },
  linkText: {
    fontSize: fp(20),
    fontFamily: fonts['500'],
    color: 'rgba(255, 255, 255, 0.7)',
  },
  linkTextActive: {
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
});
