/**
 * Monotonic epoch for chat-room list writes sourced from the API.
 * Prevents an in-flight loadChatRooms() that started on a stale cache from
 * overwriting store/cache after catch-up / force-sync already applied newer data.
 */
let chatRoomsSyncEpoch = 0;

export function getChatRoomsSyncEpoch(): number {
	return chatRoomsSyncEpoch;
}

/** Call after successfully writing API-reconciled rooms to store + cache. */
export function markChatRoomsSyncedFromApi(): void {
	chatRoomsSyncEpoch += 1;
}

export function isChatRoomsSyncEpochStale(epochAtStart: number): boolean {
	return epochAtStart !== chatRoomsSyncEpoch;
}

/** Reset on logout so the next session starts clean. */
export function resetChatRoomsSyncEpoch(): void {
	chatRoomsSyncEpoch = 0;
}
