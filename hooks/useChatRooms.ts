import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { chatApi } from '@/app-api/chatApi';
import { chatCacheService } from '@/services/ChatCacheService';
import { ChatRoom } from '@/components/ChatListItem';
import { useChatStore } from '@/stores/chatStore';

/**
 * Sort chat rooms by pin status, mute status, and last message date
 * Mirrors Next.js sortChatRoomsByLastMessage function
 */
const sortChatRoomsByLastMessage = (chatRooms: ChatRoom[]): ChatRoom[] => {
  return [...chatRooms].sort((a, b) => {
    // First priority: pin status - pinned chats go to top regardless of mute status
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // If both have same pin status, then consider mute status
    if (a.isPinned === b.isPinned) {
      // If both are pinned, sort by last message date (mute doesn't matter)
      if (a.isPinned && b.isPinned) {
        const aLastMessageDate = a.lastMessage?.createdAt || a.createdAt;
        const bLastMessageDate = b.lastMessage?.createdAt || b.createdAt;
        return new Date(bLastMessageDate).getTime() - new Date(aLastMessageDate).getTime();
      }
      
      // If both are not pinned, then mute status matters
      if (!a.isPinned && !b.isPinned) {
        // Muted chats go to bottom
        if (a.isMuted && !b.isMuted) return 1;
        if (!a.isMuted && b.isMuted) return -1;
        
        // If both have same mute status, sort by last message date
        const aLastMessageDate = a.lastMessage?.createdAt || a.createdAt;
        const bLastMessageDate = b.lastMessage?.createdAt || b.createdAt;
        return new Date(bLastMessageDate).getTime() - new Date(aLastMessageDate).getTime();
      }
    }
    
    // Fallback - should not reach here
    const aLastMessageDate = a.lastMessage?.createdAt || a.createdAt;
    const bLastMessageDate = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bLastMessageDate).getTime() - new Date(aLastMessageDate).getTime();
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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);

  // Sort chat rooms by pin status, mute status, and last message date
  const sortedChatRooms = useMemo(() => {
    return sortChatRoomsByLastMessage(chatRooms);
  }, [chatRooms]);

  /**
   * Normalize participants data (similar to Next.js implementation)
   */
  const normalizeParticipants = (participants: any[]) => {
    return participants.map(p => ({
      ...p,
      user: {
        ...p.user,
        avatar: p.user.avatar || p.user.profilePhoto,
      },
    }));
  };

  /**
   * Load chat rooms from API and sync with cache
   * Same logic as in Next.js useChatSync.loadChatRooms
   * @param forceRefresh - If true, force refresh from API even if cache is fresh
   */
  const loadChatRooms = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // On first load after app start, always force refresh to get latest data
      // This ensures we get messages that arrived while app was closed
      const isFirstLoad = !hasLoadedOnceRef.current;
      if (isFirstLoad) {
        hasLoadedOnceRef.current = true;
        forceRefresh = true; // Force refresh on first load
      }

      // Get current rooms for merging (using functional update to get latest state)
      const currentRooms: ChatRoom[] = chatRooms;

      // Check if we have cached chat rooms first
      const hasCachedRooms = await chatCacheService.hasChatRooms();

      if (hasCachedRooms && !forceRefresh) {
        // Check if cache is fresh (less than 5 minutes old)
        const isCacheFresh = await chatCacheService.isCacheFresh(5);

        if (isCacheFresh) {
          // Load from cache for immediate display only if cache is fresh
          const cachedRooms = await chatCacheService.getChatRooms();
          if (cachedRooms.length > 0) {
            // Merge cached data with current state to preserve real-time updates
            const mergedCachedRooms = cachedRooms.map(cachedRoom => {
              const storeRoom = currentRooms.find(storeRoom => storeRoom.id === cachedRoom.id);
              if (storeRoom) {
                // Prioritize cached unreadCount, but use store unreadCount if cache doesn't have it
                // This ensures unreadCount from cache is preserved after remounting
                const finalUnreadCount = cachedRoom.unreadCount !== undefined && cachedRoom.unreadCount !== null
                  ? cachedRoom.unreadCount
                  : (storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null ? storeRoom.unreadCount : 0);
                return {
                  ...cachedRoom,
                  unreadCount: finalUnreadCount,
                  lastMessage: storeRoom.lastMessage || cachedRoom.lastMessage,
                  updatedAt: storeRoom.updatedAt || cachedRoom.updatedAt,
                } as ChatRoom;
              }
              // If no store room (component just mounted), use cached data as-is
              // This ensures unreadCount from cache is preserved
              return cachedRoom;
            });
            storeSetChatRooms(mergedCachedRooms);
            setIsLoading(false);
            console.log('✅ [useChatRooms] Loaded from fresh cache');
            return;
          }
        }

        // If cache is not fresh, load from API and merge with current state
        try {
          const apiRooms = await chatApi.getChatRooms();
          const normalizedApiRooms = apiRooms.map(room => ({
            ...room,
            participants: normalizeParticipants(room.participants || []),
          }));

          // Get cached rooms first to preserve unreadCount
          const cachedRooms = await chatCacheService.getChatRooms();
          
          // Merge API data with current state and cached data to preserve real-time updates
          storeSetChatRooms((() => {
            const mergedRooms = normalizedApiRooms.map(apiRoom => {
              const storeRoom = chatRooms.find(storeRoom => storeRoom.id === apiRoom.id);
              const cachedRoom = cachedRooms.find(cachedRoom => cachedRoom.id === apiRoom.id);
              
              // Priority: store > cache > API for unreadCount
              // This ensures real-time updates are preserved, then cached data, then API
              let finalUnreadCount = 0;
              if (storeRoom && storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null) {
                finalUnreadCount = storeRoom.unreadCount;
              } else if (cachedRoom && cachedRoom.unreadCount !== undefined && cachedRoom.unreadCount !== null) {
                finalUnreadCount = cachedRoom.unreadCount;
              } else if (apiRoom.unreadCount !== undefined && apiRoom.unreadCount !== null) {
                finalUnreadCount = apiRoom.unreadCount;
              }
              
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
            return mergedRooms;
          })());

          setIsLoading(false);
          console.log('✅ [useChatRooms] Loaded from API and updated cache');
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
                  } as ChatRoom;
                }
                // If no store room, use cached data as-is (preserves unreadCount from cache)
                return cachedRoom;
              });
            return mergedCachedRooms;
          })());
            setIsLoading(false);
            console.log('✅ [useChatRooms] Fallback to stale cache');
            return;
          }
        }
      }

      // If no cached data, load from API
      try {
        const apiRooms = await chatApi.getChatRooms();
        const normalizedApiRooms = apiRooms.map(room => ({
          ...room,
          participants: normalizeParticipants(room.participants || []),
        }));

        // Merge API data with current state to preserve real-time updates
        storeSetChatRooms((() => {
          const mergedRooms = normalizedApiRooms.map(apiRoom => {
            const storeRoom = chatRooms.find(storeRoom => storeRoom.id === apiRoom.id);
            if (storeRoom) {
              // Use store unreadCount if available (preserves real-time updates), otherwise use API
              const finalUnreadCount = storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null
                ? storeRoom.unreadCount
                : (apiRoom.unreadCount !== undefined && apiRoom.unreadCount !== null ? apiRoom.unreadCount : 0);
              return {
                ...apiRoom,
                unreadCount: finalUnreadCount,
                lastMessage: storeRoom.lastMessage || apiRoom.lastMessage,
                updatedAt: storeRoom.updatedAt || apiRoom.updatedAt,
              } as ChatRoom;
            }
            return apiRoom;
          });
          // Save to cache asynchronously
          chatCacheService.saveChatRooms(mergedRooms).catch(err => {
            console.error('❌ [useChatRooms] Failed to save to cache:', err);
          });
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
  }, []);

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
        participants: normalizeParticipants(room.participants || []),
      }));

      storeSetChatRooms(normalizedApiRooms);
      await chatCacheService.saveChatRooms(normalizedApiRooms);
      console.log('🔄 [useChatRooms] Refreshed chat rooms from API');
    } catch (error) {
      console.error('❌ [useChatRooms] Failed to refresh chat rooms:', error);
      setError('Failed to refresh chat rooms');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize chat data on mount
  useEffect(() => {
    loadChatRooms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add a single chat room into state and cache (used by realtime and optimistic updates)
  const addChatRoom = useCallback(async (room: ChatRoom) => {
    mergeChatRooms([room]);
    chatCacheService.saveChatRooms([...chatRooms]).catch(() => {});
  }, [chatRooms, mergeChatRooms]);

  // Update a single chat room in state and cache
  const updateChatRoom = useCallback(async (chatRoomId: string, updates: any) => {
    const prev = chatRooms;
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
      // This ensures unreadCount is always persisted
      chatCacheService.saveChatRooms(sorted).catch(() => {});
      storeSetChatRooms(sorted);
  }, []);

  // Realtime добавление чатов теперь приходит из WebSocketContext напрямую в стор
  useEffect(() => {}, [addChatRoom]);

  // EventBus больше не используем: обновления приходят через WebSocketContext → Zustand
  useEffect(() => {}, [updateChatRoom, loadChatRooms]);

  // Reset flags when app starts (comes to foreground after being closed)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground, reset flags to force refresh on next load
        // This ensures we get messages that arrived while app was closed
        hasLoadedOnceRef.current = false;
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Load chat rooms on mount (same as Next.js useChatSync)
  useEffect(() => {
    loadChatRooms();
  }, [loadChatRooms]);

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

