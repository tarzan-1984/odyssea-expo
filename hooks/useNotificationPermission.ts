"use client";

import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { useCallback, useEffect, useState } from "react";

export type PermissionStatus = "granted" | "denied" | "undetermined";

type UseNotificationPermission = {
  status: PermissionStatus;
  isGranted: boolean;
  isDenied: boolean;
  isUndetermined: boolean;
  refresh: () => Promise<void>;
  request: () => Promise<void>;
  openSettings: () => Promise<void>;
  // Android helpers (best-effort read)
  android: {
    channelId: string;
    vibrationEnabled?: boolean;
    sound?: string | null;
    refreshChannel: () => Promise<void>;
  } | null;
};

const ANDROID_CHANNEL_ID = "odysseia-messages";

export function useNotificationPermission(): UseNotificationPermission {
  const [status, setStatus] = useState<PermissionStatus>("undetermined");
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean | undefined>(
    undefined
  );
  const [sound, setSound] = useState<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const { status: current } = await Notifications.getPermissionsAsync();
    setStatus(current as PermissionStatus);

    if (Platform.OS === "android") {
      try {
        // Best-effort: read channel settings if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel: any = await Notifications.getNotificationChannelAsync(
          ANDROID_CHANNEL_ID
        );
        if (channel) {
          // Some OEMs expose enableVibration, others only vibrationPattern (array)
          const vib =
            typeof channel.enableVibration === "boolean"
              ? channel.enableVibration
              : Array.isArray(channel.vibrationPattern) &&
                channel.vibrationPattern.length > 0;
          setVibrationEnabled(vib);
          setSound(channel.sound ?? null);
        }
      } catch {
        setVibrationEnabled(undefined);
        setSound(undefined);
      }
    }
  }, []);

  const request = useCallback(async () => {
    const { status: requested } =
      await Notifications.requestPermissionsAsync();
    setStatus(requested as PermissionStatus);
  }, []);

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    status,
    isGranted: status === "granted",
    isDenied: status === "denied",
    isUndetermined: status === "undetermined",
    refresh,
    request,
    openSettings,
    android:
      Platform.OS === "android"
        ? {
            channelId: ANDROID_CHANNEL_ID,
            vibrationEnabled,
            sound: sound ?? null,
            refreshChannel: async () => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const channel: any =
                  await Notifications.getNotificationChannelAsync(
                    ANDROID_CHANNEL_ID
                  );
                if (channel) {
                  const vib =
                    typeof channel.enableVibration === "boolean"
                      ? channel.enableVibration
                      : Array.isArray(channel.vibrationPattern) &&
                        channel.vibrationPattern.length > 0;
                  setVibrationEnabled(vib);
                  setSound(channel.sound ?? null);
                }
              } catch {
                setVibrationEnabled(undefined);
                setSound(undefined);
              }
            },
          }
        : null,
  };
}


