import { useState, useEffect, useCallback } from 'react';
import { chatApi } from '@/app-api/chatApi';
import { chatCacheService } from '@/services/ChatCacheService';
import { ChatRoom } from '@/components/ChatListItem';
import { eventBus, AppEvents } from '@/services/EventBus';

interface UseChatRoomsReturn {
  chatRooms: ChatRoom[];
  isLoading: boolean;
  error: string | null;
  loadChatRooms: () => Promise<void>;
  refreshChatRooms: () => Promise<void>;
  addChatRoom: (room: ChatRoom) => Promise<void>;
}

/**
 * Hook for managing chat rooms with caching
 * Implements the same logic as useChatSync in Next.js application
 */
export const useChatRooms = (): UseChatRoomsReturn => {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
   */
  const loadChatRooms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current rooms for merging (using functional update to get latest state)
      let currentRooms: ChatRoom[] = [];
      setChatRooms(prev => {
        currentRooms = prev;
        return prev;
      });

      // Check if we have cached chat rooms first
      const hasCachedRooms = await chatCacheService.hasChatRooms();

      if (hasCachedRooms) {
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
                // Use cached unreadCount if available, otherwise use store unreadCount
                const finalUnreadCount = cachedRoom.unreadCount !== undefined
                  ? cachedRoom.unreadCount
                  : (storeRoom.unreadCount || 0);
                return {
                  ...cachedRoom,
                  unreadCount: finalUnreadCount,
                  lastMessage: storeRoom.lastMessage || cachedRoom.lastMessage,
                  updatedAt: storeRoom.updatedAt || cachedRoom.updatedAt,
                } as ChatRoom;
              }
              return cachedRoom;
            });
            setChatRooms(mergedCachedRooms);
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

          // Merge API data with current state to preserve real-time updates
          setChatRooms(prevRooms => {
            const mergedRooms = normalizedApiRooms.map(apiRoom => {
              const storeRoom = prevRooms.find(storeRoom => storeRoom.id === apiRoom.id);
              if (storeRoom) {
                // Use API unreadCount if available, otherwise use store unreadCount
                const finalUnreadCount = apiRoom.unreadCount !== undefined
                  ? apiRoom.unreadCount
                  : (storeRoom.unreadCount || 0);
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
          });

          setIsLoading(false);
          console.log('✅ [useChatRooms] Loaded from API and updated cache');
          return;
        } catch (apiError) {
          console.warn('⚠️ [useChatRooms] API update failed, falling back to cached data:', apiError);
          // Fallback to cached data if API fails
          const cachedRooms = await chatCacheService.getChatRooms();
          if (cachedRooms.length > 0) {
            // Merge cached data with current state
            setChatRooms(prevRooms => {
              const mergedCachedRooms = cachedRooms.map(cachedRoom => {
                const storeRoom = prevRooms.find(storeRoom => storeRoom.id === cachedRoom.id);
                if (storeRoom) {
                  return {
                    ...cachedRoom,
                    unreadCount: storeRoom.unreadCount || 0,
                    lastMessage: storeRoom.lastMessage || cachedRoom.lastMessage,
                    updatedAt: storeRoom.updatedAt || cachedRoom.updatedAt,
                  } as ChatRoom;
                }
                return cachedRoom;
              });
              return mergedCachedRooms;
            });
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
        setChatRooms(prevRooms => {
          const mergedRooms = normalizedApiRooms.map(apiRoom => {
            const storeRoom = prevRooms.find(storeRoom => storeRoom.id === apiRoom.id);
            if (storeRoom) {
              // Use API unreadCount if available, otherwise use store unreadCount
              const finalUnreadCount = apiRoom.unreadCount !== undefined
                ? apiRoom.unreadCount
                : (storeRoom.unreadCount || 0);
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
        });
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

      setChatRooms(normalizedApiRooms);
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
    setChatRooms(prev => {
      const exists = prev.some(r => r.id === room.id);
      const updated = exists ? prev : [room, ...prev];
      chatCacheService.saveChatRooms(updated).catch(() => {});
      return updated;
    });
  }, []);

  // Subscribe to realtime chat room additions
  useEffect(() => {
    const off = eventBus.on<ChatRoom>(AppEvents.ChatRoomAdded, (room) => {
      addChatRoom(room);
    });
    return () => { off(); };
  }, [addChatRoom]);

  return {
    chatRooms,
    isLoading,
    error,
    loadChatRooms,
    refreshChatRooms,
    addChatRoom,
  };
};

