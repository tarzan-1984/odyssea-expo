"use client";

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getActiveChatRoomId } from '@/services/ActiveChatService';
import { useChatStore } from '@/stores/chatStore';
import { getChatAvatarSource, getChatDisplayName } from '@/utils/chatAvatarUtils';
import { ChatRoom } from '@/components/ChatListItem';

/**
 * Get chat room avatar URL for notification
 * Uses the same logic as ChatListItem component
 */
function getNotificationAvatar(chatRoomId: string | undefined, currentUserId?: string): string | null {
  if (!chatRoomId) {
    return null;
  }

  try {
    const { chatRooms } = useChatStore.getState();
    const chatRoom = chatRooms.find((r) => r.id === chatRoomId);
    if (!chatRoom) {
      return null;
    }

    return getChatAvatarSource(chatRoom, currentUserId);
  } catch {
    return null;
  }
}

// Foreground behavior: show alert + play sound (newer SDKs also require banner/list on iOS)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    try {
      const data = notification?.request?.content?.data as any;
      const incomingChatId = data?.chatRoomId as string | undefined;
      const activeId = getActiveChatRoomId();

      // Check mute status from store
      let isMuted = false;
      let chatRoom: ChatRoom | null = null;
      if (incomingChatId) {
        try {
          const { chatRooms } = useChatStore.getState();
          chatRoom = chatRooms.find((r) => r.id === incomingChatId) || null;
          isMuted = !!chatRoom?.isMuted;
        } catch {}
      }

      const suppress = (activeId && incomingChatId && activeId === incomingChatId) || isMuted;

      // Get avatar URL for notification (if not already in data)
      // For Android, we can use largeIcon with URL
      // For iOS, we would need to download and use attachments (more complex)
      let avatarUrl: string | null = null;
      if (Platform.OS === 'android' && chatRoom && !data?.avatarUrl) {
        try {
          const { chatRooms } = useChatStore.getState();
          const room = chatRooms.find((r) => r.id === incomingChatId);
          if (room) {
            // Get current user ID from secure storage if available
            const secureStorage = (await import('@/utils/secureStorage')).secureStorage;
            const userStr = await secureStorage.getItemAsync('user').catch(() => null);
            const currentUserId = userStr ? JSON.parse(userStr).id : undefined;
            avatarUrl = getChatAvatarSource(room, currentUserId);
          }
        } catch (e) {
          console.warn('[NotificationsService] Failed to get avatar:', e);
        }
      }

      // Note: We cannot modify the notification content here,
      // but we can log the avatar URL for debugging
      // The avatar should be included in the notification data from backend
      if (avatarUrl) {
        console.log('[NotificationsService] Avatar URL for notification:', avatarUrl);
      }

      const behavior: Notifications.NotificationBehavior = {
        shouldPlaySound: !suppress,
        shouldSetBadge: false,
        // iOS-specific (safe on Android)
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
        // Android/iOS fallback
        shouldShowAlert: !suppress,
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
			console.log('===========expoToken=========', expoToken);
			token = expoToken.data;
			console.log('[NotificationsService] ✅ Push token obtained:', token.substring(0, 20) + '...');
			return token;
		} else {
			console.warn('Must use physical device for Push Notifications');
			return null;
		}
	} catch (e: any) {
		const errorMessage = e?.message || String(e);
		const fullError = e?.toString() || String(e);
		
		// Log full error details
		console.error('[NotificationsService] ❌ ERROR: Failed to get Expo push token');
		console.error('[NotificationsService] Error message:', errorMessage);
		console.error('[NotificationsService] Full error:', fullError);
		
		if (errorMessage.includes('FirebaseApp') || errorMessage.includes('FCM') || errorMessage.includes('Firebase')) {
			console.error('[NotificationsService] ❌ FIREBASE ERROR: Firebase/FCM not configured!');
			console.error('[NotificationsService] Error details:', errorMessage);
			console.error('[NotificationsService] For cloud builds: Configure FCM credentials via EAS:');
			console.error('[NotificationsService]   1. Run: eas credentials');
			console.error('[NotificationsService]   2. Select Android platform');
			console.error('[NotificationsService]   3. Select Development/Preview/Production profile');
			console.error('[NotificationsService]   4. Configure FCM credentials (Service Account JSON or FCM Server Key)');
			console.error('[NotificationsService]   5. Rebuild: eas build -p android --profile development');
			console.error('[NotificationsService] For local builds: Ensure google-services.json is in project root and expo-build-properties is configured in app.json');
		} else {
			console.error('[NotificationsService] ❌ ERROR: Failed to get Expo push token:', errorMessage);
		}
		return null;
	}
}

/**
 * Register push token to backend
 * @param token - Expo push token
 * @param accessToken - User access token for authentication
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function registerPushTokenToBackend(
	token: string,
	accessToken: string
): Promise<boolean> {
	try {
		const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || "";
		if (!apiBase) {
			console.warn('[NotificationsService] API base URL not configured');
			return false;
		}

		console.log('[NotificationsService] Registering push token on backend...');
		const response = await fetch(`${apiBase}/v1/notifications/register-token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${accessToken}`,
			},
			credentials: "include",
			body: JSON.stringify({ token, platform: Platform.OS }),
		});

		if (response.ok) {
			console.log('[NotificationsService] ✅ Push token registered on backend');
			return true;
		} else {
			const errorText = await response.text().catch(() => '');
			console.warn('[NotificationsService] Failed to register token on backend:', response.status, errorText);
			return false;
		}
	} catch (error) {
		console.error('[NotificationsService] Error registering token on backend:', error);
		return false;
	}
}

export function addNotificationListeners() {
	const receivedSub = Notifications.addNotificationReceivedListener(async (notification) => {
		// Foreground notifications are handled by system
		// But we can enhance them with avatar if needed
		try {
			const data = notification.request.content.data as any;
			const chatRoomId = data?.chatRoomId as string | undefined;
			
			if (chatRoomId && Platform.OS === 'android') {
				// For Android, try to get avatar and enhance notification
				// Note: This is a workaround - we cannot modify the original notification
				// But we can log the avatar URL for debugging
				try {
					const { chatRooms } = useChatStore.getState();
					const chatRoom = chatRooms.find((r) => r.id === chatRoomId);
					if (chatRoom) {
						const secureStorage = (await import('@/utils/secureStorage')).secureStorage;
						const userStr = await secureStorage.getItemAsync('user').catch(() => null);
						const currentUserId = userStr ? JSON.parse(userStr).id : undefined;
						const avatarUrl = getChatAvatarSource(chatRoom, currentUserId);
						
						if (avatarUrl) {
							console.log('[NotificationsService] Avatar URL for notification:', avatarUrl);
							// Note: The avatar should be included in notification data from backend
							// For Android, backend should use this URL in largeIcon field
						}
					}
				} catch (e) {
					console.warn('[NotificationsService] Failed to get avatar for notification:', e);
				}
			}
		} catch (e) {
			// Ignore errors
		}
	});
	const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
		// Handle tap on notification if needed (navigate to chat)
	});
	return () => {
		receivedSub.remove();
		responseSub.remove();
	};
}


