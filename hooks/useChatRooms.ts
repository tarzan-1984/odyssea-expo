import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatApi } from '@/app-api/chatApi';
import { chatCacheService } from '@/services/ChatCacheService';
import { ChatRoom } from '@/components/ChatListItem';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/context/WebSocketContext';
import { useAuth } from '@/context/AuthContext';
import { normalizeChatParticipants } from '@/utils/normalizeChatParticipants';

const OPENED_CHATS_KEY = '@chat_opened_rooms';

/** Merge API unread with store. If API says 0, trust it (clears ghost badges after read). */
const mergeSourcesUnreadCount = (
  sourceUnread: number | undefined,
  storeUnread: number | undefined,
): number => {
  const s = sourceUnread ?? 0;
  const st = storeUnread ?? 0;
  if (s === 0) return 0;
  return Math.max(s, st);
};

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
 * Sort: pinned → unread → (non-pinned) unmuted before muted → newest last message first.
 * Matches Odyssea-backend-ui chatStore sortChatRoomsByLastMessage.
 */
const sortChatRoomsByLastMessage = (chatRooms: ChatRoom[]): ChatRoom[] => {
  const compareByDate = (a: ChatRoom, b: ChatRoom) => {
    const aDate = a.lastMessage?.createdAt || a.createdAt;
    const bDate = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  };

  const hasUnread = (room: ChatRoom) => (room.unreadCount ?? 0) > 0;

  return [...chatRooms].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    const aUnread = hasUnread(a);
    const bUnread = hasUnread(b);
    if (aUnread && !bUnread) return -1;
    if (!aUnread && bUnread) return 1;

    if (!a.isPinned && !b.isPinned) {
      if (a.isMuted && !b.isMuted) return 1;
      if (!a.isMuted && b.isMuted) return -1;
    }

    return compareByDate(a, b);
  });
};

interface ChatRoomUpdate {
  chatRoomId: string;
  updates: Partial<ChatRoom>;
}

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
  const { chatRooms, setChatRooms: storeSetChatRooms, updateChatRoom: storeUpdateChatRoom, mergeChatRooms } = useChatStore();
  const { isConnected } = useWebSocket();
  const { authState } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isConnectedRef = useRef<boolean>(isConnected);

  // Sort chat rooms by pin status, mute status, and last message date
  const sortedChatRooms = useMemo(() => {
    return sortChatRoomsByLastMessage(chatRooms);
  }, [chatRooms]);

  /**
   * Load chat rooms from API and sync with cache
   * Same logic as in Next.js useChatSync.loadChatRooms
   * @param forceRefresh - If true, force refresh from API even if cache is fresh
   */
  const loadChatRooms = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // On first load, check if we need to refresh
      // Only force refresh if WebSocket is not connected (to sync with server)
      // If WebSocket is connected, rely on it for real-time updates
      const isFirstLoad = !globalHasLoadedOnce;
      if (isFirstLoad) {
        globalHasLoadedOnce = true;
        // Only force refresh if WebSocket is not connected
        // If connected, WebSocket will provide real-time updates
        if (!isConnected) {
          forceRefresh = true; // Force refresh only if WebSocket is disconnected
        }
      }

      // Get current rooms for merging (using functional update to get latest state)
      const currentRooms: ChatRoom[] = chatRooms;

      // Check if we have cached chat rooms first
      const hasCachedRooms = await chatCacheService.hasChatRooms();

      // If WebSocket is connected and we have data in store, skip API call
      // WebSocket provides real-time updates, so API is only needed for initial sync
      if (isConnected && chatRooms.length > 0 && hasCachedRooms && !forceRefresh) {
        // Check if cache is fresh (less than 5 minutes old)
        const isCacheFresh = await chatCacheService.isCacheFresh(5);

        if (isCacheFresh) {
          // Load from cache and merge with store (WebSocket updates are source of truth)
          const cachedRooms = await chatCacheService.getChatRooms();
          if (cachedRooms.length > 0) {
            // Merge cached data with current state to preserve real-time updates
            // IMPORTANT: Prioritize store unreadCount (from WebSocket) over cached
            // WebSocket updates are the source of truth for real-time data
            const mergedCachedRooms = cachedRooms.map(cachedRoom => {
              const storeRoom = currentRooms.find(storeRoom => storeRoom.id === cachedRoom.id);
              if (storeRoom) {
                // Prioritize store unreadCount (from WebSocket updates) over cached
                // This ensures real-time updates are preserved when returning to screen
                const finalUnreadCount = storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null
                  ? storeRoom.unreadCount
                  : (cachedRoom.unreadCount !== undefined && cachedRoom.unreadCount !== null ? cachedRoom.unreadCount : 0);
                return {
                  ...cachedRoom,
                  unreadCount: finalUnreadCount,
                  lastMessage: storeRoom.lastMessage || cachedRoom.lastMessage,
                  updatedAt: storeRoom.updatedAt || cachedRoom.updatedAt,
                  isMuted: storeRoom.isMuted,
                  isPinned: storeRoom.isPinned,
                } as ChatRoom;
              }
              // If no store room (component just mounted), use cached data as-is
              // This ensures unreadCount from cache is preserved
              return cachedRoom;
            });
            storeSetChatRooms(mergedCachedRooms);
            setIsLoading(false);
            return;
          }
        }
      }

      // If WebSocket is not connected or cache is stale, check cache first
      if (hasCachedRooms && !forceRefresh) {
        // Check if cache is fresh (less than 5 minutes old)
        const isCacheFresh = await chatCacheService.isCacheFresh(5);

          if (isCacheFresh) {
            // Load from cache for immediate display only if cache is fresh
            const cachedRooms = await chatCacheService.getChatRooms();
            if (cachedRooms.length > 0) {
              // Merge cached data with current state to preserve real-time updates
              // IMPORTANT: Prioritize store unreadCount (from WebSocket) over cached
              // WebSocket updates are the source of truth for real-time data
              const mergedCachedRooms = cachedRooms.map(cachedRoom => {
                const storeRoom = currentRooms.find(storeRoom => storeRoom.id === cachedRoom.id);
                if (storeRoom) {
                  // Prioritize store unreadCount (from WebSocket updates) over cached
                  // This ensures real-time updates are preserved when returning to screen
                  const finalUnreadCount = storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null
                    ? storeRoom.unreadCount
                    : (cachedRoom.unreadCount !== undefined && cachedRoom.unreadCount !== null ? cachedRoom.unreadCount : 0);
                  return {
                    ...cachedRoom,
                    unreadCount: finalUnreadCount,
                    lastMessage: storeRoom.lastMessage || cachedRoom.lastMessage,
                    updatedAt: storeRoom.updatedAt || cachedRoom.updatedAt,
                    isMuted: storeRoom.isMuted,
                    isPinned: storeRoom.isPinned,
                  } as ChatRoom;
                }
                // If no store room (component just mounted), use cached data as-is
                // This ensures unreadCount from cache is preserved
                return cachedRoom;
              });
              storeSetChatRooms(mergedCachedRooms);
              // Clean up opened-chats session list from rooms that no longer exist
              syncOpenedChatsWithExistingRooms(mergedCachedRooms).catch(() => {});
              setIsLoading(false);
              return;
            }
          }

        // If cache is not fresh, load from API and merge with current state
        try {
          const apiRooms = await chatApi.getChatRooms();
          const normalizedApiRooms = apiRooms.map(room => ({
            ...room,
            participants: normalizeChatParticipants(room.participants || []),
          }));

          // Get cached rooms first to preserve unreadCount
          const cachedRooms = await chatCacheService.getChatRooms();
          
          // Merge API data with current state and cached data to preserve real-time updates
          storeSetChatRooms((() => {
            const mergedRooms = normalizedApiRooms.map(apiRoom => {
              const storeRoom = chatRooms.find(storeRoom => storeRoom.id === apiRoom.id);
              const cachedRoom = cachedRooms.find(cachedRoom => cachedRoom.id === apiRoom.id);
              
              const finalUnreadCount = mergeSourcesUnreadCount(
                apiRoom.unreadCount,
                storeRoom?.unreadCount ?? cachedRoom?.unreadCount,
              );

              return {
                ...apiRoom,
                unreadCount: finalUnreadCount,
                lastMessage: storeRoom?.lastMessage || apiRoom.lastMessage,
                updatedAt: storeRoom?.updatedAt || apiRoom.updatedAt,
              } as ChatRoom;
            });
            // Save to cache asynchronously
            chatCacheService.saveChatRooms(mergedRooms).catch(err => {
              console.error('❌ [useChatRooms] Failed to save to cache:', err);
            });
            // Clean up opened-chats session list from rooms that no longer exist
            syncOpenedChatsWithExistingRooms(mergedRooms).catch(() => {});
            return mergedRooms;
          })());

          setIsLoading(false);
          
          return;
        } catch (apiError) {
          console.warn('⚠️ [useChatRooms] API update failed, falling back to cached data:', apiError);
          // Fallback to cached data if API fails
          const cachedRooms = await chatCacheService.getChatRooms();
          if (cachedRooms.length > 0) {
            // Merge cached data with current state
            storeSetChatRooms((() => {
              const mergedCachedRooms = cachedRooms.map(cachedRoom => {
                const storeRoom = chatRooms.find(storeRoom => storeRoom.id === cachedRoom.id);
                if (storeRoom) {
                  // Prioritize store unreadCount, but use cached if store doesn't have it
                  const finalUnreadCount = storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null
                    ? storeRoom.unreadCount
                    : (cachedRoom.unreadCount !== undefined && cachedRoom.unreadCount !== null ? cachedRoom.unreadCount : 0);
                  return {
                    ...cachedRoom,
                    unreadCount: finalUnreadCount,
                    lastMessage: storeRoom.lastMessage || cachedRoom.lastMessage,
                    updatedAt: storeRoom.updatedAt || cachedRoom.updatedAt,
                    isMuted: storeRoom.isMuted,
                    isPinned: storeRoom.isPinned,
                  } as ChatRoom;
                }
                // If no store room, use cached data as-is (preserves unreadCount from cache)
                return cachedRoom;
              });
              // Clean up opened-chats session list from rooms that no longer exist
              syncOpenedChatsWithExistingRooms(mergedCachedRooms).catch(() => {});
              return mergedCachedRooms;
            })());
            setIsLoading(false);
            return;
          }
        }
      }

      // If no cached data, or forceRefresh is true, load from API
      try {
        const apiRooms = await chatApi.getChatRooms();
        const normalizedApiRooms = apiRooms.map(room => ({
          ...room,
          participants: normalizeChatParticipants(room.participants || []),
        }));

        // Merge API data with current state to preserve real-time updates.
        // In normal mode (forceRefresh === false) we treat the store (WebSocket) as source of truth
        // for unreadCount and lastMessage. But when forceRefresh is true (for example after returning
        // from background when WebSocket was disconnected and missed messages), we must trust API/backend,
        // otherwise we may overwrite new unreadCount values with zeros from the store.
        storeSetChatRooms((() => {
          const mergedRooms = normalizedApiRooms.map(apiRoom => {
            const storeRoom = chatRooms.find(storeRoom => storeRoom.id === apiRoom.id);
            if (storeRoom) {
              let finalUnreadCount = 0;

              if (!forceRefresh && storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null) {
                // Normal mode: prioritize value from the store (updated via WebSocket).
                finalUnreadCount = storeRoom.unreadCount;
              } else if (apiRoom.unreadCount !== undefined && apiRoom.unreadCount !== null) {
                // When forceRefresh is true (or there is no value in store) — trust API.
                finalUnreadCount = apiRoom.unreadCount;
              } else if (storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null) {
                // Fallback: if API did not return a counter but the store has one — use the store value.
                finalUnreadCount = storeRoom.unreadCount;
              }

              // For lastMessage and updatedAt logic is similar:
              // - in normal mode use values from the store to preserve WebSocket updates;
              // - when forceRefresh is true (returning from background where WebSocket might miss messages)
              //   trust API and fully synchronize lastMessage/updatedAt with backend.
              const finalLastMessage =
                !forceRefresh && storeRoom.lastMessage
                  ? storeRoom.lastMessage
                  : apiRoom.lastMessage;

              const finalUpdatedAt =
                !forceRefresh && storeRoom.updatedAt
                  ? storeRoom.updatedAt
                  : apiRoom.updatedAt;
              
              return {
                ...apiRoom,
                unreadCount: finalUnreadCount,
                lastMessage: finalLastMessage,
                updatedAt: finalUpdatedAt,
              } as ChatRoom;
            }
            return apiRoom;
          });
          // Save to cache asynchronously
          chatCacheService.saveChatRooms(mergedRooms).catch(err => {
            console.error('❌ [useChatRooms] Failed to save to cache:', err);
          });
          // Clean up opened-chats session list from rooms that no longer exist
          syncOpenedChatsWithExistingRooms(mergedRooms).catch(() => {});
          return mergedRooms;
        })());
      } catch (apiError) {
        console.warn('❌ [useChatRooms] API unavailable, no cached data available:', apiError);
        setError('Failed to load chat rooms');
      }
    } catch (error) {
      console.error('❌ [useChatRooms] Failed to load chat rooms:', error);
      setError('Failed to load chat rooms');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, chatRooms]);

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
      const normalizedApiRooms = apiRooms.map(room => ({
        ...room,
        participants: normalizeChatParticipants(room.participants || []),
      }));

      storeSetChatRooms(normalizedApiRooms);
      await chatCacheService.saveChatRooms(normalizedApiRooms);
      // Clean up opened-chats session list from rooms that no longer exist
      await syncOpenedChatsWithExistingRooms(normalizedApiRooms);
    } catch (error) {
      console.error('❌ [useChatRooms] Failed to refresh chat rooms:', error);
      setError('Failed to refresh chat rooms');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, chatRooms]);

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

    const updated = prev.map(room => {
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
      const updatedRoom = updated.find(room => room.id === chatRoomId);
      if (updatedRoom && updatedRoom.unreadCount !== undefined) {
        cacheUpdates.unreadCount = updatedRoom.unreadCount;
      }
    } else if (cleanUpdates.unreadCount !== undefined) {
      // If unreadCount is explicitly provided in updates, use it
      cacheUpdates.unreadCount = cleanUpdates.unreadCount;
    } else {
      // If no unreadCount in updates, preserve the current value
      const updatedRoom = updated.find(room => room.id === chatRoomId);
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

