import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatApi } from '@/app-api/chatApi';
import { chatCacheService } from '@/services/ChatCacheService';
import { useChatStore } from '@/stores/chatStore';
import { normalizeChatParticipants } from '@/utils/normalizeChatParticipants';
import { countTotalUnreadMessages } from '@/utils/chatUnreadCount';
import type { ChatRoom } from '@/components/ChatListItem';

type SyncOptions = {
	userId?: string;
	userRole?: string;
	driverStatus?: string | null;
};

/**
 * Force-refresh chat rooms from API (trust backend unreadCount).
 * Used when returning from background — WebSocket may have missed messages while inactive.
 */
export async function forceSyncChatRoomsFromApi(options: SyncOptions = {}): Promise<void> {
	const apiRooms = await chatApi.getChatRooms();
	const normalizedApiRooms = apiRooms.map((room) => ({
		...room,
		participants: normalizeChatParticipants(room.participants || []),
	}));

	const { chatRooms: currentRooms, setChatRooms } = useChatStore.getState();

	const mergedRooms: ChatRoom[] = normalizedApiRooms.map((apiRoom) => {
		const storeRoom = currentRooms.find((r) => r.id === apiRoom.id);
		if (!storeRoom) {
			return apiRoom as ChatRoom;
		}

		return {
			...apiRoom,
			unreadCount: apiRoom.unreadCount ?? 0,
			lastMessage: apiRoom.lastMessage ?? storeRoom.lastMessage,
			updatedAt: apiRoom.updatedAt ?? storeRoom.updatedAt,
			isMuted: storeRoom.isMuted,
			isPinned: storeRoom.isPinned,
		} as ChatRoom;
	});

	setChatRooms(mergedRooms);
	await chatCacheService.saveChatRooms(mergedRooms);

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
