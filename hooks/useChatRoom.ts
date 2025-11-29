import { useState, useCallback, useEffect, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { AppState, AppStateStatus } from 'react-native';
import { chatApi, ArchiveDay, ArchiveFile } from '@/app-api/chatApi';
import { messagesCacheService } from '@/services/MessagesCacheService';
import { ChatRoom, Message } from '@/components/ChatListItem';
import { useWebSocket } from '@/context/WebSocketContext';
import { useAuth } from '@/context/AuthContext';
import { eventBus, AppEvents } from '@/services/EventBus';
import { useChatStore } from '@/stores/chatStore';

// Stable empty array to avoid creating a new reference on each render
const EMPTY_MESSAGES: Message[] = [];

interface UseChatRoomReturn {
  chatRoom: ChatRoom | null;
  messages: Message[];
  isLoadingChatRoom: boolean;
  isLoadingMessages: boolean;
  isLoadingOlderMessages: boolean; // Separate flag for loading older messages (scroll up)
  error: string | null;
  hasMoreMessages: boolean;
  currentPage: number;
  loadChatRoom: () => Promise<void>;
  loadMessages: (page?: number, limit?: number) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number }, replyData?: Message['replyData']) => Promise<void>;
  isSendingMessage: boolean;
}

/**
 * Hook for managing a specific chat room and its messages
 * Implements the same logic as useChatSync in Next.js application
 */
export const useChatRoom = (chatRoomId: string | undefined): UseChatRoomReturn => {
  const { socket, isConnected, joinChatRoom, leaveChatRoom, sendMessage: wsSendMessage, markChatRoomAsRead } = useWebSocket();
  const { authState } = useAuth();
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingChatRoom, setIsLoadingChatRoom] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false); // Separate flag for loading older messages (scroll up)
  const [error, setError] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const currentRoomRef = useRef<string | null>(null);
  const hasLoadedMessagesOnceRef = useRef<Record<string, boolean>>({});
  const isLoadingMoreRef = useRef(false); // Prevent multiple simultaneous loadMoreMessages calls
  
  // Archive-related state
  const [availableArchives, setAvailableArchives] = useState<ArchiveDay[]>([]);
  const [currentArchiveIndex, setCurrentArchiveIndex] = useState(0);
  const [isLoadingAvailableArchives, setIsLoadingAvailableArchives] = useState(false);
  const [isLoadingArchivedMessages, setIsLoadingArchivedMessages] = useState(false);
  const [pendingArchiveLoad, setPendingArchiveLoad] = useState(false);
  const archivedMessagesCacheRef = useRef<Map<string, Message[]>>(new Map());

  // Subscribe to global store messages for this room with a stable selector
  // Avoid returning a new array each render to prevent infinite update loops
  const storeMessages =
    useChatStore(
      useCallback((s) => (chatRoomId ? (s.messagesByRoom[chatRoomId] as Message[] | undefined) : undefined), [chatRoomId])
    ) ?? EMPTY_MESSAGES;

  // Keep local messages in sync with store when store changes (no optimistic writes here)
  useEffect(() => {
    if (!chatRoomId) return;
    if (!storeMessages || storeMessages.length === 0) return;
    setMessages((prev) => {
      // If different length or any read/isRead differs, replace with store
      if (prev.length !== storeMessages.length) return [...storeMessages];
      const changed = storeMessages.some((m) => {
        const p = prev.find((pm) => pm.id === m.id);
        if (!p) return true;
        if (p.isRead !== m.isRead) return true;
        const a = (p.readBy || []).join(',');
        const b = (m.readBy || []).join(',');
        return a !== b;
      });
      return changed ? [...storeMessages] : prev;
    });
  }, [chatRoomId, storeMessages]);

  /**
   * Get user's join date for current chat room
   */
  const getUserJoinDate = useCallback((): Date | null => {
    if (!chatRoom || !authState.user) {
      return null;
    }
    
    const participant: any = chatRoom.participants.find(
      p => p.userId === authState.user?.id
    );
    const joinedAt = participant?.joinedAt as (string | Date | undefined);
    return joinedAt ? new Date(joinedAt) : null;
  }, [chatRoom, authState.user]);

  /**
   * Get available archive days for current chat room
   * Mirrors Next.js getAvailableArchiveDays
   */
  const getAvailableArchiveDays = useCallback(async (): Promise<ArchiveDay[]> => {
    if (!chatRoomId) {
      return [];
    }

    try {
      setIsLoadingAvailableArchives(true);

      const archives = await chatApi.getAvailableArchiveDays(chatRoomId);

      // Filter archives by user join date to avoid unnecessary requests
      const userJoinDate = getUserJoinDate();
      
      let filteredArchives = archives;
      if (userJoinDate) {
        filteredArchives = archives.filter(archive => {
          const archiveDate = new Date(archive.year, archive.month - 1, archive.day);
          const isAfterJoin = archiveDate >= userJoinDate;
          
          return isAfterJoin;
        });
      }

      // Sort archives by date (newest first, but we'll load oldest first)
      filteredArchives.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      setAvailableArchives(filteredArchives);
      setCurrentArchiveIndex(0);
      setIsLoadingAvailableArchives(false);

      return filteredArchives;
    } catch (error) {
      console.error(`❌ [useChatRoom] Failed to load available archive days:`, error);
      setIsLoadingAvailableArchives(false);
      return [];
    }
  }, [chatRoomId, getUserJoinDate]);

  /**
   * Get next available archive from the list
   * Uses the archive data loaded when chat room was opened
   */
  const getNextAvailableArchive = useCallback((): ArchiveDay | null => {
    if (currentArchiveIndex >= availableArchives.length) {
      return null; // No more archives
    }

    const nextArchive = availableArchives[currentArchiveIndex];
    
    // Move to next archive
    setCurrentArchiveIndex(prev => prev + 1);

    return nextArchive;
  }, [availableArchives, currentArchiveIndex]);

  /**
   * Load archived messages for a specific day
   * Mirrors Next.js loadArchivedMessages
   * This is called when PostgreSQL is exhausted and user scrolls up
   */
  const loadArchivedMessages = useCallback(async (
    year: number,
    month: number,
    day: number
  ): Promise<void> => {
    if (!chatRoomId) {
      return;
    }

    const key = `${year}-${month}-${day}`;

    // Check if already cached
    if (archivedMessagesCacheRef.current.has(key)) {
      const cachedMessages = archivedMessagesCacheRef.current.get(key)!;
      let sortedMessages: Message[] = [];
      setMessages(prev => {
        const existingMessageIds = new Set(prev.map(msg => msg.id));
        const newMessages = cachedMessages.filter(msg => !existingMessageIds.has(msg.id));

        if (newMessages.length > 0) {
          const updatedMessages = [...newMessages, ...prev];
          sortedMessages = updatedMessages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return sortedMessages;
        }
        return prev;
      });
      
      // Update store (defer to avoid updating during render)
      if (sortedMessages.length > 0) {
        setTimeout(() => {
          try {
            useChatStore.getState().setMessages(chatRoomId, sortedMessages);
          } catch {}
        }, 0);
      }
      return;
    }

    try {
      console.log('🔄 [useChatRoom] loadArchivedMessages called - setting isLoadingOlderMessages to true');
      console.log('🔄 [useChatRoom] loadArchivedMessages called - setting isLoadingOlderMessages to true');
      console.trace('📍 [useChatRoom] Stack trace for loadArchivedMessages');
      setIsLoadingArchivedMessages(true);
      // Also set isLoadingMessages and isLoadingOlderMessages to show loader in UI
      setIsLoadingMessages(true);
      setIsLoadingOlderMessages(true); // Set flag for loading older messages from archive

      const archiveFile = await chatApi.loadArchivedMessages(chatRoomId, year, month, day);

      if (archiveFile && archiveFile.messages.length > 0) {
        // Convert ArchiveMessage to Message format
        const convertedMessages: Message[] = archiveFile.messages.map(archiveMsg => ({
          id: archiveMsg.id,
          content: archiveMsg.content,
          senderId: archiveMsg.senderId,
          chatRoomId: archiveMsg.chatRoomId,
          createdAt: archiveMsg.createdAt,
          updatedAt: archiveMsg.updatedAt,
          isRead: archiveMsg.isRead,
          fileUrl: archiveMsg.fileUrl,
          fileName: archiveMsg.fileName,
          fileSize: archiveMsg.fileSize,
          sender: archiveMsg.sender,
          readBy: [], // Archive messages don't have readBy, will be populated if needed
        }));

        // Add to cache
        archivedMessagesCacheRef.current.set(key, convertedMessages);

        let sortedMessages: Message[] = [];
        setMessages(prev => {
          const existingMessageIds = new Set(prev.map(msg => msg.id));
          const newMessages = convertedMessages.filter(msg => !existingMessageIds.has(msg.id));

          if (newMessages.length > 0) {
            const updatedMessages = [...newMessages, ...prev];
            sortedMessages = updatedMessages.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            return sortedMessages;
          }
          return prev;
        });
        
        // Update store (defer to avoid updating during render)
        if (sortedMessages.length > 0) {
          setTimeout(() => {
            try {
              useChatStore.getState().setMessages(chatRoomId, sortedMessages);
            } catch {}
          }, 0);
        }
      }
    } catch (error) {
      setError('Failed to load archived messages');
    } finally {
      setIsLoadingArchivedMessages(false);
      setIsLoadingMessages(false);
      setIsLoadingOlderMessages(false);
    }
  }, [chatRoomId]);

  /**
   * Load chat room data
   * This is called immediately when chat room is opened
   */
  const loadChatRoom = useCallback(async () => {
    if (!chatRoomId) {
      setError('Chat room ID is required');
      return;
    }

    try {
      setIsLoadingChatRoom(true);
      setError(null);

      const room = await chatApi.getChatRoom(chatRoomId);
      setChatRoom(room);
      
      // Load available archives when switching to a chat room
      // This mirrors Next.js behavior in chatStore.setCurrentChatRoom
      // Note: getUserJoinDate depends on chatRoom, so we need to wait for it to be set
      // We'll load archives in a separate useEffect that depends on chatRoom
      // The archive data will be used for pagination when user scrolls up
    } catch (err) {
      setError('Failed to load chat room');
    } finally {
      setIsLoadingChatRoom(false);
    }
  }, [chatRoomId]);

  /**
   * Calculate and update unreadCount based on loaded messages
   * Counts messages that are not from current user and not read by current user
   */
  const recalculateUnreadCount = useCallback((messagesToCheck: Message[]) => {
    if (!chatRoomId || !authState.user?.id) {
      return;
    }

    const currentUserId = authState.user.id;
    
    // Count unread messages: messages not from current user AND not read by current user
    const unreadCount = messagesToCheck.filter(msg => {
      // Skip messages from current user
      if (msg.senderId === currentUserId) {
        return false;
      }
      
      // Check if message is read by current user
      const readBy = msg.readBy || [];
      const isReadByCurrentUser = readBy.includes(currentUserId);
      
      return !isReadByCurrentUser;
    }).length;
    
    // Update unreadCount through eventBus with absolute value
    // This ensures unreadCount matches the actual number of unread messages
    eventBus.emit(AppEvents.ChatRoomUpdated, {
      chatRoomId,
      updates: {
        unreadCount: unreadCount, // Set absolute value, not increment/decrement
      },
    });
  }, [chatRoomId, authState.user?.id]);

  /**
   * Load messages for a specific chat room
   * Same logic as in Next.js useChatSync.loadMessages
   * @param forceRefresh - If true, force refresh from API even if cache is fresh
   */
  const loadMessages = useCallback(
    async (page: number = 1, limit: number = 50, forceRefresh: boolean = false) => {
      if (!chatRoomId) {
        return;
      }

      try {
        setIsLoadingMessages(true);
        setError(null);

        const isFirstLoadForThisRoom = !hasLoadedMessagesOnceRef.current[chatRoomId];
        if (isFirstLoadForThisRoom) {
          hasLoadedMessagesOnceRef.current[chatRoomId] = true;
        }

        // Priority 1: Check store first (WebSocket updates are the source of truth)
        const { messagesByRoom } = useChatStore.getState();
        const storeMessages = messagesByRoom[chatRoomId] || [];
        
        if (storeMessages.length > 0) {
          // Use messages from store (already synced via WebSocket)
          const sortedStoreMessages = [...storeMessages].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          setMessages(sortedStoreMessages);
          setIsLoadingMessages(false);
          
          // Recalculate unreadCount based on store messages
          recalculateUnreadCount(sortedStoreMessages);
          
          // Set pagination state
          setCurrentPage(page);
          setHasMoreMessages(sortedStoreMessages.length >= limit);
          
          // If WebSocket is not connected, update from API in background to ensure data is fresh
          if (!isConnected) {
            // Use setTimeout to avoid updating store during render
            setTimeout(async () => {
              try {
                const response = await chatApi.getMessages(chatRoomId, page, limit);
                const sortedApiMessages = [...response.messages].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                
                // Merge API messages with store messages, removing duplicates
                const apiMessageIds = new Set(sortedApiMessages.map(msg => msg.id));
                const uniqueStoreMessages = sortedStoreMessages.filter(msg => !apiMessageIds.has(msg.id));
                const mergedMessages = [...uniqueStoreMessages, ...sortedApiMessages].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                
                // Update store and cache with merged messages
                setMessages(mergedMessages);
                try {
                  useChatStore.getState().setMessages(chatRoomId, mergedMessages);
                } catch {}
                await messagesCacheService.saveMessages(chatRoomId, mergedMessages);
                
                setCurrentPage(page);
                setHasMoreMessages(response.hasMore);
                recalculateUnreadCount(mergedMessages);
              } catch (apiError) {
                console.warn('Background API update failed (WebSocket disconnected):', apiError);
              }
            }, 0);
          }
          
          return;
        }

        // Priority 2: Check cache if store is empty
        const hasCachedMessages = await messagesCacheService.hasMessages(chatRoomId);
        
        if (hasCachedMessages) {
          const cachedMessages = await messagesCacheService.getMessages(
            chatRoomId,
            limit,
            (page - 1) * limit
          );
          
          if (cachedMessages.length > 0) {
            // Load from cache for immediate display
            setMessages(cachedMessages);
            setIsLoadingMessages(false);
            
            // Sync store with cache (defer to avoid updating during render)
            setTimeout(() => {
              try {
                useChatStore.getState().setMessages(chatRoomId, cachedMessages);
              } catch {}
            }, 0);
            
            // Recalculate unreadCount based on cached messages
            recalculateUnreadCount(cachedMessages);
            
            // Set pagination state
            setCurrentPage(page);
            setHasMoreMessages(cachedMessages.length >= limit);
            
            // If WebSocket is not connected, update from API to ensure data is fresh
            if (!isConnected) {
              // Use setTimeout to avoid updating store during render
              setTimeout(async () => {
                try {
                  const response = await chatApi.getMessages(chatRoomId, page, limit);
                  const sortedApiMessages = [...response.messages].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  
                  // Merge API messages with cached messages, removing duplicates
                  const apiMessageIds = new Set(sortedApiMessages.map(msg => msg.id));
                  const uniqueCachedMessages = cachedMessages.filter(msg => !apiMessageIds.has(msg.id));
                  const mergedMessages = [...uniqueCachedMessages, ...sortedApiMessages].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  
                  // Update store and cache with merged messages
                  setMessages(mergedMessages);
                  try {
                    useChatStore.getState().setMessages(chatRoomId, mergedMessages);
                  } catch {}
                  await messagesCacheService.saveMessages(chatRoomId, mergedMessages);
                  
                  setCurrentPage(page);
                  setHasMoreMessages(response.hasMore);
                  recalculateUnreadCount(mergedMessages);
                } catch (apiError) {
                  console.warn('Background API update failed (WebSocket disconnected):', apiError);
                }
              }, 0);
            }
            
            return;
          }
        }

        // Priority 3: Load from API only if store and cache are both empty
        // This happens on first app launch or after data was cleared
        try {
          const response = await chatApi.getMessages(chatRoomId, page, limit);
          const sortedMessages = [...response.messages].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          setMessages(sortedMessages);
          
          // Update store and cache (defer to avoid updating during render)
          setTimeout(async () => {
            try {
              useChatStore.getState().setMessages(chatRoomId, sortedMessages);
            } catch {}
            await messagesCacheService.saveMessages(chatRoomId, sortedMessages);
          }, 0);
          
          // Recalculate unreadCount based on loaded messages
          recalculateUnreadCount(sortedMessages);
          
          // Update pagination state
          setCurrentPage(page);
          setHasMoreMessages(response.hasMore);
        } catch (apiError) {
          console.warn('API unavailable, no cached data available:', apiError);
          setError('Failed to load messages');
          setMessages([]);
          // Update store (defer to avoid updating during render)
          setTimeout(() => {
            try {
              useChatStore.getState().setMessages(chatRoomId, []);
            } catch {}
          }, 0);
        }

        // Messages loaded successfully
      } catch (error) {
        console.error('Failed to load messages:', error);
        setError('Failed to load messages');
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [chatRoomId, recalculateUnreadCount, isConnected]
  );

  /**
   * Load more messages (pagination)
   * Mirrors Next.js ChatBox.handleScroll logic
   * IMPORTANT: This should ONLY be called when user scrolls up to load older messages
   * It should NOT be called when receiving new messages via WebSocket
   */
  const loadMoreMessages = useCallback(async () => {
    if (!chatRoomId) {
      return;
    }
    
    if (isLoadingMessages) {
      return;
    }
    
    if (isLoadingMoreRef.current) {
      return;
    }

    // Set loading flag immediately to prevent multiple calls
    // IMPORTANT: Only set isLoadingOlderMessages when explicitly loading older messages (scroll up)
    // Do NOT set it when receiving new messages via WebSocket
    console.log('🔄 [useChatRoom] loadMoreMessages called - setting isLoadingOlderMessages to true');
    console.trace('📍 [useChatRoom] Stack trace for loadMoreMessages');
    isLoadingMoreRef.current = true;
    setIsLoadingMessages(true);
    setIsLoadingOlderMessages(true); // Set flag for loading older messages (scroll up only)

    try {
      // First try to load from PostgreSQL
      if (hasMoreMessages) {
        const nextPage = currentPage + 1;
        const response = await chatApi.getMessages(chatRoomId, nextPage, 50);

        // Prepend new messages to existing ones (older messages at the top)
        // Mirrors Next.js logic: prepend older messages to beginning
        let sortedMessages: Message[] = [];
        setMessages(prev => {
          // Remove duplicates by creating a Map of message IDs
          const existingMessageIds = new Set(prev.map(msg => msg.id));
          const newMessages = response.messages.filter(msg => !existingMessageIds.has(msg.id));

          // Prepend only new messages to the beginning of the array
          const updatedMessages = [...newMessages, ...prev];
          
          // Sort by date to ensure correct order (oldest first)
          sortedMessages = updatedMessages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          return sortedMessages;
        });

        // Update store (defer to avoid updating during render)
        setTimeout(() => {
          try {
            useChatStore.getState().setMessages(chatRoomId, sortedMessages);
          } catch {}
        }, 0);

        setCurrentPage(nextPage);
        const wasHasMore = hasMoreMessages;
        setHasMoreMessages(response.hasMore);
        
        // If we just exhausted PostgreSQL (hasMore changed from true to false),
        // immediately try to load from archive if available
        if (wasHasMore && !response.hasMore) {
          // PostgreSQL is now exhausted, try to load from archive
          if (isLoadingAvailableArchives) {
            // Archives are still loading, set pending flag
            setPendingArchiveLoad(true);
            setIsLoadingMessages(false);
            setIsLoadingOlderMessages(false);
            isLoadingMoreRef.current = false;
          } else {
            const nextArchive = getNextAvailableArchive();
            if (nextArchive) {
              // Keep loading state to show loader while loading archived messages
              // loadArchivedMessages will manage isLoadingMessages state
              try {
                await loadArchivedMessages(nextArchive.year, nextArchive.month, nextArchive.day);
              } catch (error) {
                setIsLoadingMessages(false);
                setIsLoadingOlderMessages(false);
                isLoadingMoreRef.current = false;
              }
            } else {
              // No more archives, stop loading
              setIsLoadingMessages(false);
              setIsLoadingOlderMessages(false);
              isLoadingMoreRef.current = false;
            }
          }
        } else {
          // Normal case: still have more messages in PostgreSQL, stop loading
          setIsLoadingMessages(false);
          setIsLoadingOlderMessages(false);
          isLoadingMoreRef.current = false;
        }
      } else {
        // PostgreSQL is exhausted, try to load from archive
        if (isLoadingAvailableArchives) {
          // Archives are still loading, set pending flag
          setPendingArchiveLoad(true);
          setIsLoadingMessages(false);
          setIsLoadingOlderMessages(false);
          isLoadingMoreRef.current = false;
        } else {
          const nextArchive = getNextAvailableArchive();
          if (nextArchive) {
            // loadArchivedMessages will manage isLoadingMessages state
            try {
              await loadArchivedMessages(nextArchive.year, nextArchive.month, nextArchive.day);
            } catch (error) {
              setIsLoadingMessages(false);
              setIsLoadingOlderMessages(false);
              isLoadingMoreRef.current = false;
            }
          } else {
            // No more archives available
            setIsLoadingMessages(false);
            setIsLoadingOlderMessages(false);
            isLoadingMoreRef.current = false;
          }
        }
      }
    } catch (error) {
      setError('Failed to load more messages');
      setIsLoadingMessages(false);
      setIsLoadingOlderMessages(false);
      isLoadingMoreRef.current = false;
    }
  }, [
    chatRoomId,
    isLoadingMessages,
    hasMoreMessages,
    currentPage,
    isLoadingAvailableArchives,
    getNextAvailableArchive,
    loadArchivedMessages,
  ]);

  /**
   * Send a message
   */
  const sendMessage = useCallback(
    async (
      content: string,
      fileData?: { fileUrl: string; fileName: string; fileSize: number },
      replyData?: Message['replyData']
    ) => {
      if (!chatRoomId) {
        throw new Error('Cannot send message: no chat room selected');
      }
      
      if (!socket) {
        throw new Error('Cannot send message: WebSocket not initialized');
      }
      
      if (!isConnected || !socket.connected) {
        throw new Error('Cannot send message: WebSocket not connected');
      }

      try {
        setIsSendingMessage(true);

        // Send via WebSocket
        // Message will be added to state when we receive 'newMessage' event from server
        // This matches the Next.js implementation - no optimistic updates
        wsSendMessage({
          chatRoomId,
          content,
          fileUrl: fileData?.fileUrl,
          fileName: fileData?.fileName,
          fileSize: fileData?.fileSize,
          replyData,
        });
        
        // Message will be added automatically when server sends 'newMessage' event
        // No need to add optimistic message here
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      } finally {
        setIsSendingMessage(false);
      }
    },
    [chatRoomId, socket, isConnected, wsSendMessage, authState.user]
  );

  // Join chat room when component mounts or chatRoomId changes
  useEffect(() => {
    if (isConnected && chatRoomId && currentRoomRef.current !== chatRoomId) {
      // Clear typing state when switching chat rooms
      currentRoomRef.current = chatRoomId;
      // Join the new room
      joinChatRoom(chatRoomId);

      // Mark all messages as read in this chat (will trigger messagesMarkedAsRead event)
      // Do NOT optimistically update unreadCount - wait for server response
      // This matches Next.js behavior - unreadCount is updated only when messagesMarkedAsRead event arrives
      markChatRoomAsRead(chatRoomId);
      return;
    }

    // When there is no selected room (empty id) but we were previously in a room — leave it
    if (isConnected && !chatRoomId && currentRoomRef.current) {
      leaveChatRoom(currentRoomRef.current);
      currentRoomRef.current = null;
    }
  }, [isConnected, chatRoomId, joinChatRoom, leaveChatRoom, markChatRoomAsRead]);

  // Leave chat room on unmount
  useEffect(() => {
    return () => {
      if (currentRoomRef.current) {
        leaveChatRoom(currentRoomRef.current);
        currentRoomRef.current = null;
      }
    };
  }, [leaveChatRoom]);

  // Listen for new messages via WebSocket
  useEffect(() => {
    if (!socket || !chatRoomId) return;

    const handleNewMessage = (data: { chatRoomId: string; message: Message }) => {
      // Handle case where data comes as array (from onAny handler)
      const messageData = Array.isArray(data) ? data[0] : data;
      
      if (!messageData || !messageData.chatRoomId || !messageData.message) {
        return;
      }

      if (messageData.chatRoomId === chatRoomId) {
        // IMPORTANT: Do NOT set isLoadingMessages or isLoadingOlderMessages here
        // New messages via WebSocket should NOT trigger loading indicators
        // They should be added directly to the messages array without showing a loader
        // Also ensure isLoadingOlderMessages is false when receiving new messages
        console.log('📨 [useChatRoom] handleNewMessage - received new message');
        console.log('📨 [useChatRoom] handleNewMessage - current isLoadingOlderMessages:', isLoadingOlderMessages);
        console.log('📨 [useChatRoom] handleNewMessage - current isLoadingMoreRef.current:', isLoadingMoreRef.current);
        if (isLoadingOlderMessages) {
          console.warn('⚠️ [useChatRoom] isLoadingOlderMessages is true when receiving new message via WebSocket - resetting it');
          console.trace('📍 [useChatRoom] Stack trace showing where isLoadingOlderMessages was set to true');
          setIsLoadingOlderMessages(false);
        }
        const newMessage = messageData.message;
        const isMessageFromCurrentUser = newMessage.senderId === authState.user?.id;
        const currentUserId = authState.user?.id || '';
        const currentReadBy = newMessage.readBy || [];
        const shouldMarkAsRead = !isMessageFromCurrentUser && !currentReadBy.includes(currentUserId);
        
        // Add message to state
        setMessages(prev => {
          // Check if message already exists by ID (avoid duplicates)
          // This matches Next.js implementation - messages are added only when received from server
          const existingMessageIndex = prev.findIndex(msg => msg.id === newMessage.id);
          if (existingMessageIndex >= 0) {
            // Message already exists, just return current state
            return prev;
          }
          
          // Auto-mark message as read if it's in the current active chat
          // and it's not from the current user (don't mark own messages as read)
          // This matches Next.js behavior - messages in active chat are marked as read immediately
          let messageToAdd = newMessage;
          if (shouldMarkAsRead) {
            // Mark message as read immediately for current user
            // This matches Next.js implementation in WebSocketContext
            messageToAdd = {
              ...newMessage,
              readBy: [...currentReadBy, currentUserId],
              // For DIRECT chats: isRead becomes true when any participant reads
              // For GROUP/LOAD chats: isRead might stay false, but readBy tracks who read
              isRead: chatRoom?.type === 'DIRECT' ? true : newMessage.isRead,
            };
            
            // Update message as read in cache immediately (matching Next.js)
            messagesCacheService.updateMessage(messageToAdd.id, {
              isRead: messageToAdd.isRead,
              readBy: messageToAdd.readBy,
            }).catch((error) => {
              console.error('Failed to update message as read in cache:', error);
            });
          }
          
          // Add new message and sort by date
          const updatedMessages = [...prev, messageToAdd].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          // Save to cache asynchronously
          messagesCacheService.saveMessages(chatRoomId, updatedMessages).catch((error) => {
            console.error('Failed to save message to cache:', error);
          });
          
          return updatedMessages;
        });
        
        // Mark message as read and update unreadCount OUTSIDE of setMessages
        // This matches Next.js implementation in WebSocketContext
        if (shouldMarkAsRead) {
          // Optimistically decrease unreadCount immediately
          // This provides instant UI feedback, matching Next.js behavior
          eventBus.emit(AppEvents.ChatRoomUpdated, {
            chatRoomId,
            updates: {
              unreadCountDecrement: 1,
            },
          });
          
          // Send WebSocket event to mark message as read immediately
          // Use socket.emit directly, matching Next.js implementation in WebSocketContext
          // Server will confirm via messageRead event
          if (socket && socket.connected && chatRoomId) {
            socket.emit('messageRead', {
              messageId: newMessage.id,
              chatRoomId: chatRoomId,
            });
          }
          
          // Also call markChatRoomAsRead to ensure unreadCount is updated on server
          // This ensures that when user exits and re-enters the chat, unreadCount is correct
          // markChatRoomAsRead will mark all unread messages in the chat as read, including this new one
          if (chatRoomId) {
            // Use setTimeout to avoid calling during render
            setTimeout(() => {
              markChatRoomAsRead(chatRoomId);
            }, 0);
          }
        }
      }
    };

    socket.on('newMessage', handleNewMessage);

    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket, chatRoomId, authState.user?.id, chatRoom?.type, isConnected]);

  // Sync messages when WebSocket reconnects after being offline
  // This ensures we get messages that arrived while device was offline
  useEffect(() => {
    const off = eventBus.on(AppEvents.WebSocketReconnected, () => {
      if (chatRoomId) {
        // Reset flag to force refresh from API
        // This ensures we get messages that arrived while device was offline
        delete hasLoadedMessagesOnceRef.current[chatRoomId];
        // Force reload messages from API to get any that arrived while offline
        // This ensures we don't miss messages even if cache appears fresh
        loadMessages(1, 50, true).catch((error) => {
          console.error('Failed to refresh messages after reconnection:', error);
        });
      }
    });
    
    return () => { off(); };
  }, [chatRoomId, loadMessages]);

  // Handle pending archive load when archives finish loading
  useEffect(() => {
    if (pendingArchiveLoad && !isLoadingAvailableArchives && availableArchives.length > 0) {
      setPendingArchiveLoad(false);
      const nextArchive = getNextAvailableArchive();
      if (nextArchive) {
        loadArchivedMessages(nextArchive.year, nextArchive.month, nextArchive.day);
      }
    }
  }, [pendingArchiveLoad, isLoadingAvailableArchives, availableArchives, getNextAvailableArchive, loadArchivedMessages]);

  // Reset archive state when chat room changes
  useEffect(() => {
    setAvailableArchives([]);
    setCurrentArchiveIndex(0);
    setPendingArchiveLoad(false);
    setIsLoadingAvailableArchives(false);
    setIsLoadingArchivedMessages(false);
    archivedMessagesCacheRef.current.clear();
  }, [chatRoomId]);

  // Load available archives when chat room is loaded
  // This mirrors Next.js behavior in chatStore.setCurrentChatRoom
  // This is called immediately when chat room is opened to prepare archive data
  // for subsequent pagination requests when user scrolls up
  useEffect(() => {
    if (chatRoom && chatRoomId) {
      getAvailableArchiveDays().catch(() => {
        // Silently handle errors
      });
    }
  }, [chatRoom, chatRoomId, getAvailableArchiveDays]);

  // Handle bulk messages marked as read (when markChatRoomAsRead is called)
  // This matches Next.js behavior - unreadCount is updated only when server confirms
  const handleMessagesMarkedAsRead = useCallback((data: { chatRoomId: string; messageIds: string[]; userId: string }) => {
    if (data.chatRoomId !== chatRoomId) return;

    const currentUserId = authState.user?.id;

    // Update all messages in state and recalculate unreadCount based on updated messages
    setMessages(prev => {
      const updatedMessages = prev.map(msg => {
        if (data.messageIds.includes(msg.id)) {
          const currentReadBy = msg.readBy || [];
          const updatedReadBy = currentReadBy.includes(data.userId) 
            ? currentReadBy 
            : [...currentReadBy, data.userId];

          // Determine isRead based on chat type
          // For DIRECT chats: isRead becomes true when any participant reads
          // For GROUP/LOAD chats: isRead becomes true when at least one participant reads
          // This is needed for displaying the read status icon in the chat
          // The readBy array tracks who specifically read the message
          const updatedIsRead = updatedReadBy.length > 0 ? true : false;

          return {
            ...msg,
            isRead: updatedIsRead,
            readBy: updatedReadBy,
          };
        }
        return msg;
      });

      // Save to cache asynchronously
      // Sort messages by date to ensure correct order
      const sortedMessages = updatedMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      messagesCacheService.saveMessages(chatRoomId, sortedMessages).catch((error) => {
        console.error('Failed to save messages read status to cache:', error);
      });

      // Update unreadCount only if this is for the current user
      // Compare userId from event with current user's ID
      if (currentUserId && data.userId === currentUserId) {
        // Decrement unreadCount by the number of messages that were marked as read
        const readCount = data.messageIds.length; // Number of messages that were read
        const currentUnread = chatRoom?.unreadCount || 0;
        const nextUnread = Math.max(0, currentUnread - readCount);
        
        console.log(`📉 [useChatRoom] Decreasing unreadCount for ${chatRoomId}: ${currentUnread} - ${readCount} = ${nextUnread}`);
        
        // Update chat room's unreadCount through eventBus
        // Use setTimeout to ensure state is updated before emitting event
        setTimeout(() => {
          eventBus.emit(AppEvents.ChatRoomUpdated, {
            chatRoomId,
            updates: {
              unreadCount: nextUnread, // Decrement by readCount
            },
          });
        }, 0);
      } else {
        // userId doesn't match current user - this is for read receipts only
        // Don't update unreadCount for current user
        console.log(`ℹ️ [useChatRoom] messagesMarkedAsRead for different user (${data.userId}), skipping unreadCount update`);
      }

      return sortedMessages;
    });
  }, [chatRoomId, authState.user?.id, chatRoom?.unreadCount]);

  // Listen for messageRead events via eventBus (real-time read status updates)
  // This listens to events emitted by WebSocketContext when messageRead event is received
  useEffect(() => {
    if (!chatRoomId) return;

    const handleMessageRead = (data: { messageId: string; readBy: string; chatRoomId?: string }) => {
      console.log('📖 [useChatRoom] messageRead event received via eventBus:', data);
      
      // Only process if this event is for the current chat room
      // If chatRoomId is provided, filter by it; otherwise process all (for backward compatibility)
      if (data.chatRoomId && data.chatRoomId !== chatRoomId) {
        console.log('⚠️ [useChatRoom] messageRead event for different chat room, ignoring:', {
          eventChatRoomId: data.chatRoomId,
          currentChatRoomId: chatRoomId,
        });
        return;
      }
      
      const currentUserId = authState.user?.id;
      
      // Update message read status in state
      setMessages(prev => {
        const message = prev.find(msg => msg.id === data.messageId);
        if (!message) {
          console.log('⚠️ [useChatRoom] Message not found in state:', data.messageId);
          return prev;
        }
        
        // Also check if message belongs to current chat room
        if (message.chatRoomId !== chatRoomId) {
          console.log('⚠️ [useChatRoom] Message belongs to different chat room, ignoring:', {
            messageChatRoomId: message.chatRoomId,
            currentChatRoomId: chatRoomId,
          });
          return prev;
        }
        
        console.log('📖 [useChatRoom] Updating message read status:', {
          messageId: data.messageId,
          currentIsRead: message.isRead,
          currentReadBy: message.readBy,
          newReadBy: data.readBy,
        });

        const currentReadBy = message.readBy || [];
        // Check if current user already read this message BEFORE updating
        // This prevents double decrementing unreadCount when we optimistically marked it as read
        const wasReadByCurrentUser = currentReadBy.includes(currentUserId || '');
        
        const updatedReadBy = currentReadBy.includes(data.readBy) 
          ? currentReadBy 
          : [...currentReadBy, data.readBy];
        const isNowReadByCurrentUser = updatedReadBy.includes(currentUserId || '');

        // Determine isRead based on chat type
        // For DIRECT chats: isRead becomes true when any participant reads
        // For GROUP/LOAD chats: isRead becomes true when at least one participant reads
        // This matches Next.js behavior where isRead is always set to true when messageRead event arrives
        // The readBy array tracks who specifically read the message
        const updatedIsRead = true; // When messageRead event arrives, message is read by someone

        // Create a new array to ensure React detects the change
        const updatedMessages = prev.map(msg => {
          if (msg.id === data.messageId) {
            // Create a completely new object to ensure React detects the change
            return {
              ...msg,
              isRead: updatedIsRead,
              readBy: updatedReadBy,
            };
          }
          return msg;
        });

        console.log('✅ [useChatRoom] Message read status updated:', {
          messageId: data.messageId,
          updatedIsRead,
          updatedReadBy,
          previousIsRead: message.isRead,
          previousReadBy: message.readBy,
        });

        // If current user just read this message (and wasn't read before), decrease unreadCount
        // This matches Next.js behavior in chatStore.updateMessage
        // Note: If we optimistically marked it as read, wasReadByCurrentUser will be true,
        // so we won't decrement unreadCount again
        if (currentUserId && !wasReadByCurrentUser && isNowReadByCurrentUser) {
          eventBus.emit(AppEvents.ChatRoomUpdated, {
            chatRoomId,
            updates: {
              unreadCountDecrement: 1,
            },
          });
        }

        // Save to cache asynchronously
        messagesCacheService.saveMessages(chatRoomId, updatedMessages).catch((error) => {
          console.error('Failed to save message read status to cache:', error);
        });

        return updatedMessages;
      });
    };

    // Subscribe to messagesMarkedAsRead events via eventBus (emitted by WebSocketContext)
    // This handles bulk marking of messages as read when user enters a chat room
    const offMessagesMarkedAsRead = eventBus.on(AppEvents.MessagesMarkedAsRead, handleMessagesMarkedAsRead);
    
    // Subscribe to messageRead events via eventBus (emitted by WebSocketContext)
    // This handles individual message read status updates
    const offMessageRead = eventBus.on(AppEvents.MessageRead, handleMessageRead);
    
    return () => {
      offMessagesMarkedAsRead();
      offMessageRead();
    };
  }, [socket, chatRoomId, chatRoom?.type, authState.user?.id, handleMessagesMarkedAsRead]);

  // Reset flags when app starts (comes to foreground after being closed)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground, reset flags to force refresh on next load
        // This ensures we get messages that arrived while app was closed
        hasLoadedMessagesOnceRef.current = {};
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Load chat room and messages on mount
  // Load chat room and messages immediately when chat room is opened
  // This is the entry point when user navigates to a chat room
  useEffect(() => {
    if (chatRoomId) {
      loadChatRoom(); // Loads chat room data (participants, name, etc.)
      loadMessages(); // Loads initial messages from database/cache
      // Note: Available archive days will be loaded automatically after chatRoom is set
      // (see useEffect below that depends on chatRoom)
    }
  }, [chatRoomId, loadChatRoom, loadMessages]);

  return {
    chatRoom,
    messages,
    isLoadingChatRoom,
    isLoadingMessages,
    isLoadingOlderMessages,
    error,
    hasMoreMessages,
    currentPage,
    loadChatRoom,
    loadMessages,
    loadMoreMessages,
    sendMessage,
    isSendingMessage,
  };
};

