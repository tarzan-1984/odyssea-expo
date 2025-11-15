"use client";

import React from "react";
import { registerForPushNotificationsAsync, addNotificationListeners, registerPushTokenToBackend } from "@/services/NotificationsService";
import { secureStorage } from "@/utils/secureStorage";
import { useAuth } from "@/context/AuthContext";

/**
 * PushTokenRegistrar
 * - Runs globally on app start
 * - Checks if user is authenticated (from secureStorage)
 * - Checks if push token exists in secureStorage
 * - If user is authenticated AND token doesn't exist:
 *   - Gets push token
 *   - Saves token to secureStorage
 *   - Registers token on backend
 */
export default function PushTokenRegistrar() {
  const { authState } = useAuth();
  const [listenersAttached, setListenersAttached] = React.useState(false);

  // Check on app start and when auth state changes
  React.useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        // Check if user is authenticated
        const isAuthenticated = authState.isAuthenticated;
        if (!isAuthenticated) {
          console.log('[PushTokenRegistrar] User not authenticated, skipping token registration');
          return;
        }

        // Check if access token exists
        const accessToken = authState.accessToken;
        if (!accessToken) {
          console.warn('[PushTokenRegistrar] User is authenticated but no access token found');
          return;
        }

        // Check if token already exists in secureStorage
        const existingToken = await secureStorage.getItemAsync("expoPushToken").catch(() => null);
        if (existingToken) {
          console.log('[PushTokenRegistrar] Push token already exists in secureStorage');
          return;
        }

        // Get push token
        console.log('[PushTokenRegistrar] No push token found, requesting...');
        const token = await registerForPushNotificationsAsync();
        if (!token || canceled) {
          console.error('[PushTokenRegistrar] ❌ Failed to get push token');
          return;
        }

        // Save token to secureStorage
        await secureStorage.setItemAsync("expoPushToken", token).catch(() => {});
        console.log('[PushTokenRegistrar] ✅ Push token saved to secureStorage');

        // Register token on backend
        await registerPushTokenToBackend(token, accessToken);
      } catch (error) {
        console.error('[PushTokenRegistrar] ❌ ERROR: Exception while getting/registering push token');
        console.error('[PushTokenRegistrar] Error:', error);
        if (error instanceof Error) {
          console.error('[PushTokenRegistrar] Error message:', error.message);
          console.error('[PushTokenRegistrar] Error stack:', error.stack);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [authState.isAuthenticated, authState.accessToken]);

  // Attach notification listeners once
  React.useEffect(() => {
    if (!listenersAttached) {
      const cleanup = addNotificationListeners();
      setListenersAttached(true);
      return cleanup;
    }
  }, [listenersAttached]);

  return null;
}


