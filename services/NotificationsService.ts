"use client";

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getActiveChatRoomId } from '@/services/ActiveChatService';
import { useChatStore } from '@/stores/chatStore';

// Foreground behavior: show alert + play sound (newer SDKs also require banner/list on iOS)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    try {
      const data = notification?.request?.content?.data as any;
      const incomingChatId = data?.chatRoomId as string | undefined;
      const activeId = getActiveChatRoomId();

      // Check mute status from store
      let isMuted = false;
      if (incomingChatId) {
        try {
          const { chatRooms } = useChatStore.getState();
          const room = chatRooms.find((r) => r.id === incomingChatId);
          isMuted = !!room?.isMuted;
        } catch {}
      }

      const suppress = (activeId && incomingChatId && activeId === incomingChatId) || isMuted;

      const behavior: Notifications.NotificationBehavior = {
        shouldPlaySound: suppress ? false : true,
        shouldSetBadge: false,
        // iOS-specific (safe on Android)
        shouldShowBanner: suppress ? false : true,
        shouldShowList: suppress ? false : true,
        // Android/iOS fallback
        shouldShowAlert: suppress ? false : true,
      } as any;
      return behavior;
    } catch {
      // Fallback: allow notification
      return {
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldShowAlert: true,
      } as any;
    }
  },
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
	try {
		let token: string | null = null;

		// Android channel with sound
		if (Platform.OS === 'android') {
			await Notifications.setNotificationChannelAsync('odysseia-messages', {
				name: 'Odysseia Messages',
				importance: Notifications.AndroidImportance.MAX,
				// Use custom bundled sound; file must be declared in app.json plugin "sounds".
				// Name without extension as required by Android channels.
				sound: 'livechat',
				vibrationPattern: [0, 250, 250, 250],
				lightColor: '#FF231F7C',
				description: 'Incoming Odysseia chat message alerts',
				lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
			});
		}

		if (Device.isDevice) {
			const { status: existingStatus } = await Notifications.getPermissionsAsync();
			
			let finalStatus = existingStatus;
			
			if (existingStatus !== 'granted') {
				const { status } = await Notifications.requestPermissionsAsync();
				finalStatus = status;
			}
			
			if (finalStatus !== 'granted') {
				console.warn('Push notification permission not granted');
				return null;
			}

			const expoToken = await Notifications.getExpoPushTokenAsync();
			token = expoToken.data;
			return token;
		} else {
			console.warn('Must use physical device for Push Notifications');
			return null;
		}
	} catch (e) {
		console.warn('Failed to register for push notifications:', e);
		return null;
	}
}

export function addNotificationListeners() {
	const receivedSub = Notifications.addNotificationReceivedListener(() => {
		// Foreground notifications are handled by system; no-op
	});
	const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
		// Handle tap on notification if needed (navigate to chat)
	});
	return () => {
		receivedSub.remove();
		responseSub.remove();
	};
}


