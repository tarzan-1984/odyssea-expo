"use client";

import React from 'react';
import { registerForPushNotificationsAsync, addNotificationListeners } from '@/services/NotificationsService';
import { secureStorage } from '@/utils/secureStorage';
import { Platform } from 'react-native';

export default function NotificationsInitializer() {
	React.useEffect(() => {
		let cleanup: (() => void) | undefined;
		(async () => {
			const token = await registerForPushNotificationsAsync();
			if (token) {
				// Persist locally; later can be sent to backend for push routing
				await secureStorage.setItemAsync('expoPushToken', token).catch(() => {});

				// Send token to backend so server can deliver background notifications
				try {
					const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || '';
					if (apiBase) {
						await fetch(`${apiBase}/v1/notifications/register-token`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							credentials: 'include',
							body: JSON.stringify({
								token,
								platform: Platform.OS,
							}),
						});
					}
				} catch {}
			}
			cleanup = addNotificationListeners();
		})();
		return () => {
			if (cleanup) cleanup();
		};
	}, []);
	return null;
}


