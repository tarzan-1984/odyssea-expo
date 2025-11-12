"use client";

import React from "react";
import { View, Text, StyleSheet, Switch, Button, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { colors, fonts, fp, rem } from "@/lib";
import { playIncomingMessageSound } from "@/utils/SoundManager";

export default function NotificationsSettings() {
  const {
    status,
    isGranted,
    isDenied,
    isUndetermined,
    request,
    openSettings,
    refresh,
    android,
  } = useNotificationPermission();

  const onTogglePermission = async (value: boolean) => {
    if (value) {
      if (isUndetermined) {
        await request();
      } else {
        await openSettings();
      }
      await refresh();
    } else {
      await openSettings();
      await refresh();
    }
  };

  const onToggleVibration = async () => {
    // Не можем менять системную вибрацию программно — открываем настройки приложения/канала
    await openSettings();
    await android?.refreshChannel();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Push permission</Text>
          <Text style={styles.caption}>Status: {status}</Text>
        </View>
        <Switch
          value={isGranted}
          onValueChange={onTogglePermission}
          thumbColor={isGranted ? colors.primary.violet : "#ccc"}
        />
      </View>

      {Platform.OS === "android" && (
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Vibration (system)</Text>
            <Text style={styles.caption}>
              {android?.vibrationEnabled === undefined
                ? "Unknown"
                : android?.vibrationEnabled
                ? "Enabled"
                : "Disabled"}
            </Text>
          </View>
          <Switch
            value={!!android?.vibrationEnabled}
            onValueChange={onToggleVibration}
            thumbColor={colors.primary.violet}
          />
        </View>
      )}

      <View style={{ height: rem(16) }} />
      <Button
        title="Open system settings"
        onPress={async () => {
          await openSettings();
          await refresh();
        }}
        color={colors.primary.violet}
      />

      <View style={{ height: rem(16) }} />
      <Button
        title="Test foreground sound"
        onPress={() => {
          void playIncomingMessageSound();
        }}
        color={colors.primary.blue}
      />

      <View style={{ height: rem(16) }} />
      <Button
        title="Test notification banner (foreground)"
        onPress={async () => {
          // Schedule a local notification immediately (trigger: null)
          // This simulates a push in foreground and passes through our handler.
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Test message",
              body: "This is a test notification banner with sound",
              data: { chatRoomId: `dev-test-${Date.now()}` },
              sound: Platform.OS === "ios" ? "livechat.wav" : undefined,
              // On Android use the app channel with sound configured
              // TS types may not include channelId in content; cast to any if needed
              channelId: "odysseia-messages" as any,
            },
            trigger: null,
          });
        }}
        color={colors.primary.violet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: rem(16),
    backgroundColor: "white",
    gap: rem(12),
  },
  title: {
    fontFamily: fonts["700"],
    fontSize: fp(18),
    color: colors.primary.blue,
    marginBottom: rem(8),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rem(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(41,41,102,0.12)",
  },
  rowText: {
    flexDirection: "column",
    gap: rem(4),
  },
  label: {
    fontFamily: fonts["600"],
    fontSize: fp(15),
    color: colors.primary.blue,
  },
  caption: {
    fontFamily: fonts["400"],
    fontSize: fp(12),
    color: colors.neutral.darkGrey,
  },
});


