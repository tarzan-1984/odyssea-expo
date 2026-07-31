import {
	chatApi,
	SyncMessagesBatchRoomRequest,
	SyncMessagesBatchRoomResult,
} from '@/app-api/chatApi';
import type { ChatRoom, Message } from '@/components/ChatListItem';
import { applyChatRoomsFromApi } from '@/services/applyChatRoomsFromApi';
import { messagesCacheService } from '@/services/MessagesCacheService';
import { useChatStore } from '@/stores/chatStore';
import { normalizeChatParticipants } from '@/utils/normalizeChatParticipants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { countTotalUnreadMessages } from '@/utils/chatUnreadCount';

const SYNC_BATCH_CHUNK_SIZE = 50;

function sortMessagesByCreatedAt(messages: Message[]): Message[] {
	return [...messages].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
}

function mergeMessageLists(...sources: Message[][]): Message[] {
	const byId = new Map<string, Message>();
	for (const source of sources) {
		for (const msg of source) {
			if (!msg?.id) continue;
			const prev = byId.get(msg.id);
			if (!prev) {
				byId.set(msg.id, msg);
				continue;
			}
			const readBy = new Set([...(prev.readBy ?? []), ...(msg.readBy ?? [])]);
			byId.set(msg.id, {
				...prev,
				...msg,
				readBy: [...readBy],
			});
		}
	}
	return sortMessagesByCreatedAt([...byId.values()]);
}

function roomNeedsMessageSync(
	apiRoom: ChatRoom,
	localLastMessageId: string | null | undefined,
	localMessages: Message[],
): boolean {
	const serverLast = apiRoom.lastMessage;
	if (!serverLast?.id) return false;
	if (!localLastMessageId) return true;

	const lastLocal = localMessages[localMessages.length - 1];
	if (!lastLocal) return true;
	if (lastLocal.id !== serverLast.id) return true;

	return (
		new Date(lastLocal.createdAt).getTime() !==
		new Date(serverLast.createdAt).getTime()
	);
}

async function resolveLocalLastMessageId(
	chatRoomId: string,
	storeMessages: Message[],
	storeRoomLastId?: string | null,
): Promise<string | null> {
	const cached = await messagesCacheService.getMessages(chatRoomId);
	const cachedLast = cached.length > 0 ? cached[cached.length - 1].id : null;
	const storeLast =
		storeMessages.length > 0 ? storeMessages[storeMessages.length - 1].id : null;
	return storeLast ?? cachedLast ?? storeRoomLastId ?? null;
}

async function applySyncBatchResults(
	results: SyncMessagesBatchRoomResult[],
): Promise<void> {
	const state = useChatStore.getState();

	for (const roomResult of results) {
		const { chatRoomId, messages, unreadCount, lastMessage } = roomResult;

		state.updateChatRoom(chatRoomId, {
			unreadCount,
			...(lastMessage
				? { lastMessage, updatedAt: lastMessage.createdAt }
				: {}),
		});

		if (messages.length === 0) {
			continue;
		}

		const cached = await messagesCacheService.getMessages(chatRoomId);
		const storeMsgs = state.messagesByRoom[chatRoomId] ?? [];
		const merged = mergeMessageLists(cached, storeMsgs, messages);

		await messagesCacheService.saveMessages(chatRoomId, merged);
		state.setMessages(chatRoomId, merged);
	}
}

type CatchUpOptions = {
	userId?: string;
	userRole?: string;
	driverStatus?: string | null;
};

/**
 * After WebSocket reconnect or returning from background:
 * refresh chat rooms, then batch-sync only rooms whose local tail lags behind the server.
 */
export async function catchUpChatsOnReconnect(
	options: CatchUpOptions = {},
): Promise<void> {
	let apiRooms: Awaited<ReturnType<typeof chatApi.getChatRooms>>;
	try {
		apiRooms = await chatApi.getChatRooms();
	} catch (error) {
		const message = error instanceof Error ? error.message : 'getChatRooms failed';
		console.warn('[ChatSync] Could not refresh chat rooms after reconnect:', message);
		return;
	}
	const previousRooms = useChatStore.getState().chatRooms;

	const normalizedRooms: ChatRoom[] = apiRooms.map((room) => ({
		...room,
		participants: normalizeChatParticipants(room.participants || []),
	}));

	// Write reconciled list to store AND cache together (prevents UI/cache drift).
	const mergedRooms = await applyChatRoomsFromApi(normalizedRooms, {
		trustApiRealtime: true,
	});

	const state = useChatStore.getState();
	const roomsToSync: SyncMessagesBatchRoomRequest[] = [];

	for (const apiRoom of mergedRooms) {
		const storeRoom = previousRooms.find((r) => r.id === apiRoom.id);
		const storeMessages = state.messagesByRoom[apiRoom.id] ?? [];
		const cachedMessages = await messagesCacheService.getMessages(apiRoom.id);
		const localMessages =
			storeMessages.length > 0 ? storeMessages : cachedMessages;

		const localLastId = await resolveLocalLastMessageId(
			apiRoom.id,
			storeMessages,
			storeRoom?.lastMessage?.id,
		);

		if (roomNeedsMessageSync(apiRoom, localLastId, localMessages)) {
			roomsToSync.push({
				chatRoomId: apiRoom.id,
				lastMessageId: localLastId,
			});
		}
	}

	if (roomsToSync.length > 0) {
		for (let i = 0; i < roomsToSync.length; i += SYNC_BATCH_CHUNK_SIZE) {
			const chunk = roomsToSync.slice(i, i + SYNC_BATCH_CHUNK_SIZE);
			try {
				const response = await chatApi.syncMessagesBatch(chunk);
				await applySyncBatchResults(response.rooms);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'syncMessagesBatch failed';
				console.warn('[ChatSync] Message batch sync after reconnect failed:', message);
				return;
			}
		}
	}

	const driverStatus =
		options.driverStatus !== undefined
			? options.driverStatus
			: options.userRole === 'DRIVER'
				? await AsyncStorage.getItem('@user_status').catch(() => null)
				: null;

	const totalUnread = countTotalUnreadMessages(
		useChatStore.getState().chatRooms,
		{
			userId: options.userId,
			userRole: options.userRole,
			driverStatus,
		},
	);

	try {
		await Notifications.setBadgeCountAsync(totalUnread);
	} catch {
		// Badge may be unsupported on some Android launchers
	}
}
