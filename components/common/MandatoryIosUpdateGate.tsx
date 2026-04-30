import React from 'react';
import { View, Text, StyleSheet, Modal, Linking, Pressable, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '@/lib/colors';
import { fonts, fp, rem } from '@/lib';
import { useMandatoryIosAppUpdate } from '@/hooks/useMandatoryIosAppUpdate';

type Props = {
  children: React.ReactNode;
};

export default function MandatoryIosUpdateGate({ children }: Props) {
  const updateState = useMandatoryIosAppUpdate();

  const openStore = (url: string, fallbackUrl?: string) => {
    Linking.openURL(url).catch((err) => {
      if (fallbackUrl) {
        Linking.openURL(fallbackUrl).catch((fallbackErr) => {
          console.error('Failed to open store URL:', fallbackErr);
        });
        return;
      }
      console.error('Failed to open store URL:', err);
    });
  };

  const blocking = updateState.phase === 'loading';

  return (
    <View style={styles.root}>
      {children}

      {blocking && (
        <View style={styles.blockLayer} pointerEvents="auto">
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          {updateState.phase === 'loading' && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.neutral.white} />
            </View>
          )}
        </View>
      )}

      <Modal
        visible={updateState.phase === 'force'}
        transparent
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modalCard}>
            <Text style={styles.title}>Update required</Text>
            <Text style={styles.body}>
              A newer version is available on the {updateState.phase === 'force' ? updateState.storeName : 'store'}. Please update the app to continue
              using Odysseia.
            </Text>
            {updateState.phase === 'force' && (
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                onPress={() => openStore(updateState.storeUrl, updateState.fallbackStoreUrl)}
              >
                <Text style={styles.buttonLabel}>Update in {updateState.storeName}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  blockLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    padding: rem(24),
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  modalCard: {
    backgroundColor: colors.neutral.white,
    borderRadius: rem(16),
    padding: rem(24),
    width: '100%',
    maxWidth: rem(400),
    alignItems: 'stretch',
  },
  title: {
    fontFamily: fonts['700'],
    fontSize: fp(22),
    color: colors.neutral.black,
    textAlign: 'center',
    marginBottom: rem(12),
  },
  body: {
    fontFamily: fonts['400'],
    fontSize: fp(16),
    lineHeight: fp(24),
    color: colors.neutral.darkGrey,
    textAlign: 'center',
    marginBottom: rem(24),
  },
  button: {
    backgroundColor: colors.primary.blue,
    borderRadius: rem(12),
    paddingVertical: rem(14),
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonLabel: {
    fontFamily: fonts['600'],
    fontSize: fp(17),
    color: colors.neutral.white,
  },
});
