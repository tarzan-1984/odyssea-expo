import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatApi } from '@/app-api/chatApi';
import { applyChatRoomsFromApi } from '@/services/applyChatRoomsFromApi';
import { countTotalUnreadMessages } from '@/utils/chatUnreadCount';
import { normalizeChatParticipants } from '@/utils/normalizeChatParticipants';

type SyncOptions = {
	userId?: string;
	userRole?: string;
	driverStatus?: string | null;
};

/**
 * Force-refresh chat rooms from API (trust backend unreadCount).
 * Always updates both Zustand store and AsyncStorage cache.
 * Used on initial auth and when returning from background — WebSocket may have missed rooms/messages.
 */
export async function forceSyncChatRoomsFromApi(options: SyncOptions = {}): Promise<void> {
	const apiRooms = await chatApi.getChatRooms();
	const normalizedApiRooms = apiRooms.map((room) => ({
		...room,
		participants: normalizeChatParticipants(room.participants || []),
	}));

	const mergedRooms = await applyChatRoomsFromApi(normalizedApiRooms, {
		trustApiRealtime: true,
	});

	const driverStatus =
		options.driverStatus !== undefined
			? options.driverStatus
			: options.userRole === 'DRIVER'
				? await AsyncStorage.getItem('@user_status').catch(() => null)
				: null;

	const totalUnread = countTotalUnreadMessages(mergedRooms, {
		userId: options.userId,
		userRole: options.userRole,
		driverStatus,
	});

	try {
		await Notifications.setBadgeCountAsync(totalUnread);
	} catch {
		// Badge may be unsupported on some Android launchers
	}
}
