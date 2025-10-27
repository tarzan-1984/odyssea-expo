import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { colors, fonts, rem, fp } from '@/lib';

/**
 * MessagesScreen - Messages screen of the application
 * Placeholder for messages functionality
 */
export default function MessagesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Messages Screen</Text>
        <Text style={styles.subtitle}>Your messages will appear here</Text>
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
    color: colors.neutral.gray,
    textAlign: 'center',
  },
});
