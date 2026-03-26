import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, rem, fp } from '@/lib';

export type WorkMenuPage = 'loads' | 'offers' | 'drivers';

interface WorkTopMenuProps {
  currentPage: WorkMenuPage;
  /** When true, removes bottom margin (e.g. when status filter buttons follow) */
  compactBottom?: boolean;
  /** Show Drivers tab (DISPATCHER*, EXPEDITE_MANAGER, tracking roles, ADMINISTRATOR — not DRIVER) */
  showDriversTab?: boolean;
}

export default function WorkTopMenu({
  currentPage,
  compactBottom,
  showDriversTab = false,
}: WorkTopMenuProps) {
  const router = useRouter();
  const three = showDriversTab;

  const underlineStyle =
    currentPage === 'loads'
      ? three
        ? styles.underlineThird0
        : styles.underlineLeft
      : currentPage === 'offers'
        ? three
          ? styles.underlineThird1
          : styles.underlineRight
        : styles.underlineThird2;

  return (
    <View style={[styles.header, !compactBottom && styles.headerWithMargin]}>
      <TouchableOpacity
        style={[styles.link, three ? styles.linkThird : styles.linkHalf]}
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
        style={[styles.link, three ? styles.linkThird : styles.linkHalf]}
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

      {three ? (
        <TouchableOpacity
          style={[styles.link, styles.linkThird]}
          onPress={() => {
            if (currentPage !== 'drivers') {
              router.push('/work/drivers');
            }
          }}
        >
          <Text style={[styles.linkText, currentPage === 'drivers' && styles.linkTextActive]}>
            DRIVERS
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.underline, underlineStyle]} />
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
    paddingVertical: rem(14),
    paddingBottom: rem(16),
    paddingHorizontal: rem(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkHalf: {
    flex: 1,
  },
  linkThird: {
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
    width: '50%',
  },
  underlineRight: {
    left: '50%',
    width: '50%',
  },
  underlineThird0: {
    left: 0,
    width: '33.33%',
  },
  underlineThird1: {
    left: '33.33%',
    width: '33.33%',
  },
  underlineThird2: {
    left: '66.66%',
    width: '33.34%',
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
