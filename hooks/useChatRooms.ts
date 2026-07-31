import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatApi } from '@/app-api/chatApi';
import { applyChatRoomsFromApi } from '@/services/applyChatRoomsFromApi';
import { chatCacheService } from '@/services/ChatCacheService';
import {
  getChatRoomsSyncEpoch,
  isChatRoomsSyncEpochStale,
} from '@/services/chatRoomsSyncEpoch';
import { ChatRoom } from '@/components/ChatListItem';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/context/WebSocketContext';
import { mergeCacheRoomsWithStore } from '@/utils/mergeChatRoomLists';
import { normalizeChatParticipants } from '@/utils/normalizeChatParticipants';
import { fileLogger } from '@/utils/fileLogger';

const OPENED_CHATS_KEY = '@chat_opened_rooms';

/** One initial fetch for the whole app — avoids duplicate API work per screen/nav mount. */
let globalHasLoadedOnce = false;
let globalMountLoadScheduled = false;

export function resetChatRoomsLoaderState() {
  globalHasLoadedOnce = false;
  globalMountLoadScheduled = false;
}

// Keep opened chat room IDs in AsyncStorage in sync with existing chat rooms list.
// This removes chats that were deleted / user left, so the "opened in this session"
// information stays consistent.
const syncOpenedChatsWithExistingRooms = async (rooms: ChatRoom[]) => {
  try {
    const stored = await AsyncStorage.getItem(OPENED_CHATS_KEY);
    if (!stored) {
      return;
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return;
    }

    const validIds = new Set(rooms.map((r) => r.id));
    const filtered = parsed.filter(
      (id: unknown) => typeof id === 'string' && validIds.has(id as string),
    );

    if (filtered.length !== parsed.length) {
      await AsyncStorage.setItem(OPENED_CHATS_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('⚠️ [useChatRooms] Failed to sync opened chats list with existing rooms:', e);
  }
};

/**
 * Sort: pinned → (non-pinned) unmuted before muted → newest last message first.
 * Read/unread status does not affect order.
 * Matches Odyssea-backend-ui chatStore sortChatRoomsByLastMessage.
 */
const sortChatRoomsByLastMessage = (chatRooms: ChatRoom[]): ChatRoom[] => {
  const compareByDate = (a: ChatRoom, b: ChatRoom) => {
    const aDate = a.lastMessage?.createdAt || a.createdAt;
    const bDate = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  };

  return [...chatRooms].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (!a.isPinned && !b.isPinned) {
      if (a.isMuted && !b.isMuted) return 1;
      if (!a.isMuted && b.isMuted) return -1;
    }

    return compareByDate(a, b);
  });
};

interface UseChatRoomsReturn {
  chatRooms: ChatRoom[];
  isLoading: boolean;
  error: string | null;
  loadChatRooms: (forceRefresh?: boolean) => Promise<void>;
  refreshChatRooms: () => Promise<void>;
  addChatRoom: (room: ChatRoom) => Promise<void>;
  updateChatRoom: (chatRoomId: string, updates: Partial<ChatRoom>) => Promise<void>;
}

/**
 * Hook for managing chat rooms with caching
 * Implements the same logic as useChatSync in Next.js application
 */
export const useChatRooms = (): UseChatRoomsReturn => {
  const { chatRooms, setChatRooms: storeSetChatRooms, mergeChatRooms } = useChatStore();
  const { isConnected } = useWebSocket();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isConnectedRef = useRef<boolean>(isConnected);

  // Sort chat rooms by pin status, mute status, and last message date
  const sortedChatRooms = useMemo(() => {
    return sortChatRoomsByLastMessage(chatRooms);
  }, [chatRooms]);

  /**
   * Union-merge AsyncStorage cache with current store, then write both.
   * Never drops store-only rooms (catch-up / WebSocket). Aborts if API sync epoch moved.
   */
  const applyCacheUnionToStoreAndCache = useCallback(async (): Promise<boolean> => {
    const epochAtStart = getChatRoomsSyncEpoch();
    const cachedRooms = await chatCacheService.getChatRooms();
    if (cachedRooms.length === 0) {
      return false;
    }

    // A newer API catch-up already wrote store+cache — do not clobber it with stale cache.
    if (isChatRoomsSyncEpochStale(epochAtStart)) {
      return true;
    }

    const latestStoreRooms = useChatStore.getState().chatRooms;
    const mergedCachedRooms = mergeCacheRoomsWithStore(cachedRooms, latestStoreRooms);

    if (isChatRoomsSyncEpochStale(epochAtStart)) {
      return true;
    }

    storeSetChatRooms(mergedCachedRooms);
    // Persist union so cache catches up with store-only rooms from catch-up/WS.
    await chatCacheService.saveChatRooms(mergedCachedRooms).catch((err) => {
      console.error('❌ [useChatRooms] Failed to save merged cache:', err);
    });
    syncOpenedChatsWithExistingRooms(mergedCachedRooms).catch(() => {});
    return true;
  }, [storeSetChatRooms]);

  /**
   * Load chat rooms from API and sync with cache
   * @param forceRefresh - If true, force refresh from API even if cache is fresh
   */
  const loadChatRooms = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);

      const epochAtStart = getChatRoomsSyncEpoch();

      const isFirstLoad = !globalHasLoadedOnce;
      if (isFirstLoad) {
        globalHasLoadedOnce = true;
        if (!isConnected) {
          forceRefresh = true;
        }
      }

      const latestStoreRooms = useChatStore.getState().chatRooms;
      const hasCachedRooms = await chatCacheService.hasChatRooms();

      // Connected + store populated + fresh cache: union cache∪store, skip API
      if (isConnected && latestStoreRooms.length > 0 && hasCachedRooms && !forceRefresh) {
        const isCacheFresh = await chatCacheService.isCacheFresh(5);
        if (isCacheFresh) {
          const applied = await applyCacheUnionToStoreAndCache();
          if (applied) {
            setIsLoading(false);
            return;
          }
        }
      }

      if (hasCachedRooms && !forceRefresh) {
        const isCacheFresh = await chatCacheService.isCacheFresh(5);

        if (isCacheFresh) {
          const applied = await applyCacheUnionToStoreAndCache();
          if (applied) {
            setIsLoading(false);
            return;
          }
        }

        // Stale cache → API, then write store + cache together
        try {
          const apiRooms = await chatApi.getChatRooms();
          if (isChatRoomsSyncEpochStale(epochAtStart)) {
            setIsLoading(false);
            return;
          }

          const normalizedApiRooms = apiRooms.map((room) => ({
            ...room,
            participants: normalizeChatParticipants(room.participants || []),
          }));

          const mergedRooms = await applyChatRoomsFromApi(normalizedApiRooms, {
            trustApiRealtime: true,
          });
          syncOpenedChatsWithExistingRooms(mergedRooms).catch(() => {});
          setIsLoading(false);
          return;
        } catch (apiError) {
          console.warn('⚠️ [useChatRooms] API update failed, falling back to cached data:', apiError);
          if (isChatRoomsSyncEpochStale(epochAtStart)) {
            setIsLoading(false);
            return;
          }
          await applyCacheUnionToStoreAndCache();
          setIsLoading(false);
          return;
        }
      }

      // No cache, or forceRefresh — load from API into store + cache
      try {
        const apiRooms = await chatApi.getChatRooms();
        if (isChatRoomsSyncEpochStale(epochAtStart)) {
          return;
        }

        const normalizedApiRooms = apiRooms.map((room) => ({
          ...room,
          participants: normalizeChatParticipants(room.participants || []),
        }));

        const mergedRooms = await applyChatRoomsFromApi(normalizedApiRooms, {
          trustApiRealtime: true,
        });
        syncOpenedChatsWithExistingRooms(mergedRooms).catch(() => {});
      } catch (apiError) {
        console.warn('❌ [useChatRooms] API unavailable, no cached data available:', apiError);
        fileLogger.error('ChatRooms', 'LOAD_API_UNAVAILABLE', {
          error: apiError instanceof Error ? apiError.message : String(apiError),
        });
        setError('Failed to load chat rooms');
      }
    } catch (error) {
      console.error('❌ [useChatRooms] Failed to load chat rooms:', error);
      fileLogger.error('ChatRooms', 'LOAD_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      setError('Failed to load chat rooms');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, applyCacheUnionToStoreAndCache]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Force refresh chat rooms from API (ignoring cache)
   */
  const refreshChatRooms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiRooms = await chatApi.getChatRooms();
      const normalizedApiRooms = apiRooms.map((room) => ({
        ...room,
        participants: normalizeChatParticipants(room.participants || []),
      }));

      const mergedRooms = await applyChatRoomsFromApi(normalizedApiRooms, {
        trustApiRealtime: true,
      });
      await syncOpenedChatsWithExistingRooms(mergedRooms);
    } catch (error) {
      console.error('❌ [useChatRooms] Failed to refresh chat rooms:', error);
      fileLogger.error('ChatRooms', 'REFRESH_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      setError('Failed to refresh chat rooms');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add a single chat room into state and cache (used by realtime and optimistic updates)
  const addChatRoom = useCallback(async (room: ChatRoom) => {
    mergeChatRooms([room]);
    // Important: read the latest rooms from the store (avoid stale closure).
    const latestRooms = useChatStore.getState().chatRooms;
    chatCacheService.saveChatRooms(latestRooms).catch(() => {});
  }, [mergeChatRooms]);

  // Update a single chat room in state and cache
  const updateChatRoom = useCallback(async (chatRoomId: string, updates: any) => {
    // Important: read the latest rooms from the store (avoid stale closure).
    const prev = useChatStore.getState().chatRooms;

    // Check if we need to handle unreadCount increment or decrement
    const hasUnreadIncrement = updates.unreadCountIncrement !== undefined;
    const hasUnreadDecrement = updates.unreadCountDecrement !== undefined;
    const unreadIncrement = updates.unreadCountIncrement || 0;
    const unreadDecrement = updates.unreadCountDecrement || 0;

    // Remove unreadCountIncrement and unreadCountDecrement from updates before applying
    const { unreadCountIncrement: _, unreadCountDecrement: __, ...cleanUpdates } = updates;

    const updated = prev.map((room) => {
      if (room.id === chatRoomId) {
        const currentUnreadCount = room.unreadCount || 0;

        // Apply updates
        const updatedRoom = { ...room, ...cleanUpdates } as ChatRoom;

        // Handle unreadCount increment or decrement if needed
        if (hasUnreadIncrement) {
          updatedRoom.unreadCount = currentUnreadCount + unreadIncrement;
        } else if (hasUnreadDecrement) {
          // Decrement unreadCount, but don't go below 0
          updatedRoom.unreadCount = Math.max(0, currentUnreadCount - unreadDecrement);
        }

        return updatedRoom;
      }
      return room;
    });

    // Prepare cache updates
    const cacheUpdates = { ...cleanUpdates };

    // Ensure unreadCount is always included in cache updates
    if (hasUnreadIncrement || hasUnreadDecrement) {
      // Find the updated room to get the new unreadCount
      const updatedRoom = updated.find((room) => room.id === chatRoomId);
      if (updatedRoom && updatedRoom.unreadCount !== undefined) {
        cacheUpdates.unreadCount = updatedRoom.unreadCount;
      }
    } else if (cleanUpdates.unreadCount !== undefined) {
      // If unreadCount is explicitly provided in updates, use it
      cacheUpdates.unreadCount = cleanUpdates.unreadCount;
    } else {
      // If no unreadCount in updates, preserve the current value
      const updatedRoom = updated.find((room) => room.id === chatRoomId);
      if (updatedRoom && updatedRoom.unreadCount !== undefined) {
        cacheUpdates.unreadCount = updatedRoom.unreadCount;
      }
    }

    // Update cache asynchronously
    chatCacheService.updateChatRoom(chatRoomId, cacheUpdates).catch(() => {});

    // Sort using the same logic as loadChatRooms (pinned top, normal by date, muted bottom)
    const sorted = sortChatRoomsByLastMessage(updated);

    // Save all rooms to cache to ensure consistency
    chatCacheService.saveChatRooms(sorted).catch(() => {});
    storeSetChatRooms(sorted);
  }, [storeSetChatRooms]);

  // Realtime chat addition now comes from WebSocketContext directly to store
  useEffect(() => {}, [addChatRoom]);

  // Foreground chat sync lives in GlobalChatRoomsSync (_layout) so Home tab badge updates after push.

  // Load chat rooms once per app session (not per screen that uses this hook)
  useEffect(() => {
    if (globalMountLoadScheduled) return;
    globalMountLoadScheduled = true;
    loadChatRooms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    chatRooms: sortedChatRooms,
    isLoading,
    error,
    loadChatRooms,
    refreshChatRooms,
    addChatRoom,
    updateChatRoom,
  };
};
