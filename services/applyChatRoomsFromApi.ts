import type { ChatRoom } from '@/components/ChatListItem';
import { chatCacheService } from '@/services/ChatCacheService';
import { markChatRoomsSyncedFromApi } from '@/services/chatRoomsSyncEpoch';
import { useChatStore } from '@/stores/chatStore';
import { mergeApiRoomsWithStore } from '@/utils/mergeChatRoomLists';

/**
 * Reconcile chat list from API into both Zustand store and AsyncStorage cache.
 * Always updates both — callers must not leave store and cache out of sync.
 */
export async function applyChatRoomsFromApi(
	apiRooms: ChatRoom[],
	options: { trustApiRealtime?: boolean } = {},
): Promise<ChatRoom[]> {
	const storeRooms = useChatStore.getState().chatRooms;
	const mergedRooms = mergeApiRoomsWithStore(apiRooms, storeRooms, options);

	useChatStore.getState().setChatRooms(mergedRooms);
	await chatCacheService.saveChatRooms(mergedRooms);
	markChatRoomsSyncedFromApi();

	return mergedRooms;
}
