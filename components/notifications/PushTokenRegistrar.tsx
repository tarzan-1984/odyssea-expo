"use client";

import React from "react";
import { Platform } from "react-native";
import { registerForPushNotificationsAsync, addNotificationListeners } from "@/services/NotificationsService";
import { secureStorage } from "@/utils/secureStorage";

/**
 * PushTokenRegistrar
 * - Runs globally on app start
 * - If no token saved locally, requests permission, obtains Expo push token
 *   and registers it on backend.
 * - Safe to mount alongside auth flow; if cookies/credentials отсутствуют,
 *   запрос просто не пройдет и повторится при следующем запуске.
 */
export default function PushTokenRegistrar() {
  React.useEffect(() => {
    let canceled = false;
    let cleanup: undefined | (() => void);
    (async () => {
      try {
        const existing = await secureStorage.getItemAsync("expoPushToken").catch(
          () => null
        );
        if (existing) return;

        const token = await registerForPushNotificationsAsync();
        if (!token || canceled) return;

        await secureStorage.setItemAsync("expoPushToken", token).catch(() => {});

        const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || "";
        if (apiBase) {
          await fetch(`${apiBase}/v1/notifications/register-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token, platform: Platform.OS }),
          }).catch(() => {});
        }
        // attach listeners after registration attempt
        cleanup = addNotificationListeners();
      } catch {
        // ignore
      }
    })();
    return () => {
      canceled = true;
      if (cleanup) cleanup();
    };
  }, []);

  return null;
}


