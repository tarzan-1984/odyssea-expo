import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { chatApi } from '@/app-api/chatApi';
import { chatCacheService } from '@/services/ChatCacheService';
import { ChatRoom } from '@/components/ChatListItem';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/context/WebSocketContext';

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
  const { isConnected } = useWebSocket();
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

      // On first load, check if we need to refresh
      // Only force refresh if WebSocket is not connected (to sync with server)
      // If WebSocket is connected, rely on it for real-time updates
      const isFirstLoad = !hasLoadedOnceRef.current;
      if (isFirstLoad) {
        hasLoadedOnceRef.current = true;
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
            return;
          }
        }
      }

      // If no cached data, or forceRefresh is true, load from API
      try {
        const apiRooms = await chatApi.getChatRooms();
        const normalizedApiRooms = apiRooms.map(room => ({
          ...room,
          participants: normalizeParticipants(room.participants || []),
        }));

        // Merge API data with current state to preserve real-time updates.
        // В обычном режиме (forceRefresh === false) мы считаем store (WebSocket) источником истины
        // по unreadCount и lastMessage. Но при forceRefresh (например, после возврата из background,
        // когда WebSocket был отключён и пропустил сообщения) нужно доверять API/бэкенду, иначе
        // мы затрём новые значения unreadCount нулями из стора.
        storeSetChatRooms((() => {
          const mergedRooms = normalizedApiRooms.map(apiRoom => {
            const storeRoom = chatRooms.find(storeRoom => storeRoom.id === apiRoom.id);
            if (storeRoom) {
              let finalUnreadCount = 0;

              if (!forceRefresh && storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null) {
                // Обычный режим: приоритет у значения из стора (обновлённого через WebSocket).
                finalUnreadCount = storeRoom.unreadCount;
              } else if (apiRoom.unreadCount !== undefined && apiRoom.unreadCount !== null) {
                // При forceRefresh (или если в сторе нет значения) — доверяем API.
                finalUnreadCount = apiRoom.unreadCount;
              } else if (storeRoom.unreadCount !== undefined && storeRoom.unreadCount !== null) {
                // Запасной вариант: если API не вернул счётчик, но в сторе он есть — используем его.
                finalUnreadCount = storeRoom.unreadCount;
              }

              // Для lastMessage и updatedAt логика аналогичная:
              // - в обычном режиме используем значения из стора, чтобы сохранить
              //   обновления по WebSocket;
              // - при forceRefresh (возврат из background, WebSocket мог пропустить сообщения)
              //   доверяем API и полностью синхронизируем lastMessage/updatedAt с бэкендом.
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

  // Realtime chat addition now comes from WebSocketContext directly to store
  useEffect(() => {}, [addChatRoom]);

  // Track app state to force sync when app opens after being closed or returns from background.
  // On transition from inactive/background -> active:
  // - Force refresh chat rooms from API
  // - Log refreshed chat rooms and total unread count to console
  useEffect(() => {
    let appState = AppState.currentState;
    let wasInBackground = false;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // Track when app goes to background/inactive
      if (appState.match(/active/) && nextAppState.match(/inactive|background/)) {
        wasInBackground = true;
        console.log('📱 [useChatRooms] App went to background/inactive');
      }

      // When app becomes active again
      if (nextAppState === 'active') {
        if (wasInBackground) {
          console.log('📱 [useChatRooms] App became active after being in background, forcing chat rooms sync from API...');
          wasInBackground = false;

          // Force refresh from API to sync unreadCount and chat list.
          // After sync, log resulting chat rooms and total unread count.
          (async () => {
            try {
              await loadChatRooms(true);

              // Read the latest chat rooms from store after loadChatRooms finishes
              const latestRooms = useChatStore.getState().chatRooms;
              const totalUnread = latestRooms.reduce((total, room) => {
                return total + (room.unreadCount || 0);
              }, 0);

              console.log('✅ [useChatRooms] Chat rooms synced on app active. Summary:', {
                totalChats: latestRooms.length,
                totalUnread,
                chats: latestRooms.map((room) => ({
                  id: room.id,
                  name: room.name,
                  unreadCount: room.unreadCount || 0,
                  lastMessageId: room.lastMessage?.id,
                  lastMessageCreatedAt: room.lastMessage?.createdAt,
                })),
              });
            } catch (error) {
              console.error('❌ [useChatRooms] Failed to sync on app open:', error);
            }
          })();
        } else {
          // App was already active (just switching between screens)
          // Only reset flags if WebSocket is not connected
          if (!isConnected) {
            hasLoadedOnceRef.current = false;
          }
        }
      }

      appState = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isConnected, loadChatRooms]);

  // Load chat rooms on mount (only once)
  useEffect(() => {
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

