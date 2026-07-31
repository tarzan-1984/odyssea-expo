import type { ChatRoom } from '@/components/ChatListItem';

/**
 * Union-merge cache with current store rooms.
 * Never drops rooms that exist only in the store (e.g. just added by catch-up / WS).
 * Store wins for realtime fields when both sides have the same room.
 */
export function mergeCacheRoomsWithStore(
	cachedRooms: ChatRoom[],
	storeRooms: ChatRoom[],
): ChatRoom[] {
	const byId = new Map<string, ChatRoom>();

	for (const cached of cachedRooms) {
		if (!cached?.id) continue;
		byId.set(cached.id, cached);
	}

	for (const storeRoom of storeRooms) {
		if (!storeRoom?.id) continue;
		const cached = byId.get(storeRoom.id);
		if (!cached) {
			byId.set(storeRoom.id, storeRoom);
			continue;
		}

		const storeUnread = storeRoom.unreadCount;
		const cachedUnread = cached.unreadCount;
		const finalUnreadCount =
			storeUnread !== undefined && storeUnread !== null
				? storeUnread
				: cachedUnread !== undefined && cachedUnread !== null
					? cachedUnread
					: 0;

		byId.set(storeRoom.id, {
			...cached,
			...storeRoom,
			unreadCount: finalUnreadCount,
			lastMessage: storeRoom.lastMessage || cached.lastMessage,
			updatedAt: storeRoom.updatedAt || cached.updatedAt,
			isMuted: storeRoom.isMuted ?? cached.isMuted,
			isPinned: storeRoom.isPinned ?? cached.isPinned,
		});
	}

	return [...byId.values()];
}

/**
 * Apply API room list as source of truth for which rooms exist.
 * Preserve local mute/pin; prefer API unread/lastMessage when trustApiRealtime is true.
 */
export function mergeApiRoomsWithStore(
	apiRooms: ChatRoom[],
	storeRooms: ChatRoom[],
	options: { trustApiRealtime?: boolean } = {},
): ChatRoom[] {
	const trustApiRealtime = options.trustApiRealtime !== false;

	return apiRooms.map((apiRoom) => {
		const storeRoom = storeRooms.find((r) => r.id === apiRoom.id);
		if (!storeRoom) {
			return apiRoom;
		}

		if (trustApiRealtime) {
			return {
				...apiRoom,
				unreadCount: apiRoom.unreadCount ?? 0,
				lastMessage: apiRoom.lastMessage ?? storeRoom.lastMessage,
				updatedAt: apiRoom.updatedAt ?? storeRoom.updatedAt,
				isMuted: storeRoom.isMuted,
				isPinned: storeRoom.isPinned,
			};
		}

		return {
			...apiRoom,
			unreadCount:
				storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null
					? storeRoom.unreadCount
					: (apiRoom.unreadCount ?? 0),
			lastMessage: storeRoom.lastMessage || apiRoom.lastMessage,
			updatedAt: storeRoom.updatedAt || apiRoom.updatedAt,
			isMuted: storeRoom.isMuted,
			isPinned: storeRoom.isPinned,
		};
	});
}
