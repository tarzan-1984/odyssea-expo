import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, rem, fp } from '@/lib';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * HomeScreen - Main home screen of the application
 * Placeholder for home functionality
 */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Home Screen</Text>
        <Text style={styles.subtitle}>Welcome to the main application!</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rem(20),
  },
  title: {
    fontSize: fp(24),
    fontFamily: fonts["700"],
    color: colors.primary.blue,
    marginBottom: rem(10),
  },
  subtitle: {
    fontSize: fp(16),
    fontFamily: fonts["400"],
    textAlign: 'center',
  },
});
