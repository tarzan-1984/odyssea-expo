import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { secureStorage } from '@/utils/secureStorage';
import { WS_URL } from '@/lib/config';
import { AppState, AppStateStatus } from 'react-native';
import { useChatStore, updateLastMessage } from '@/stores/chatStore';
import { chatApi } from '@/app-api/chatApi';
import { ChatRoom } from '@/components/ChatListItem';
import { messagesCacheService } from '@/services/MessagesCacheService';

// WebSocket context interface
interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  joinChatRoom: (chatRoomId: string) => void;
  leaveChatRoom: (chatRoomId: string) => void;
  removeParticipant: (data: { chatRoomId: string; participantId: string }) => void;
  sendMessage: (data: SendMessageData) => void;
  sendTyping: (chatRoomId: string, isTyping: boolean) => void;
  markMessageAsRead: (messageId: string, chatRoomId: string) => void;
  markChatRoomAsRead: (chatRoomId: string) => void;
  typingByRoom: Record<string, Record<string, { isTyping: boolean; firstName?: string }>>;
}

// Message sending interface
interface SendMessageData {
  chatRoomId: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyData?: {
    avatar?: string;
    time: string;
    content: string;
    senderName: string;
  };
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { authState } = useAuth();
  const currentUser = authState.user;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingByRoom, setTypingByRoom] = useState<Record<string, Record<string, { isTyping: boolean; firstName?: string }>>>({});
  const chatRoomsList = useChatStore((s) => s.chatRooms);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const periodicRetryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Get authentication token from secure storage
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await secureStorage.getItemAsync('accessToken');
      return token;
    } catch (error) {
      console.error('❌ [WebSocket] Failed to get auth token:', error);
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    // Do not connect when app is not active; keep WebSocket connection only in active app state.
    if (!String(appStateRef.current).match(/active/)) {
      return;
    }

    if (socket || isConnectingRef.current) {
      return;
    }
    isConnectingRef.current = true;
    // Only connect if we have a current user
    if (!currentUser) {
      isConnectingRef.current = false;
      return;
    }

    // Disconnect existing connection if any
    if (socket) {
      (socket as Socket).disconnect();
      setSocket(null);
    }

    // Get token from secure storage
    const token = await getAuthToken();

    if (!token) {
      console.warn('⚠️ [WebSocket] No access token available');
      return;
    }

    // Validate WebSocket URL
    if (!WS_URL) {
      console.error('❌ [WebSocket] WS_URL is not defined');
      return;
    }

    if (WS_URL.includes('https/')) {
      console.error('❌ [WebSocket] Invalid WebSocket URL:', WS_URL);
      return;
    }


    // Create new socket connection with authentication
    const newSocket = io(WS_URL, {
      auth: {
        token: token,
      },
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      timeout: 20000,
      forceNew: true,
      // Enable automatic reconnection with exponential backoff
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000, // Initial delay
      reconnectionDelayMax: 30000, // Max delay
      randomizationFactor: 0.5, // Add randomness to prevent thundering herd
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      const wasDisconnected = !isConnected;
      setIsConnected(true);
      reconnectAttempts.current = 0;
      isConnectingRef.current = false;

      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Clear periodic retry interval if it exists
      if (periodicRetryIntervalRef.current) {
        clearInterval(periodicRetryIntervalRef.current);
        periodicRetryIntervalRef.current = null;
      }

      // If we were disconnected and now reconnected, trigger sync
      // This handles the case when device was offline and missed messages
      if (wasDisconnected) {
        console.log('🔄 [WebSocket] Reconnected after disconnection');
      }
    });

    // Handle server's connected event (with user data)
    newSocket.on('connected', (data: any) => {
      // Server automatically joins user to all their chat rooms
      // So we should receive userOnline events for other participants
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      isConnectingRef.current = false;

      // Attempt to reconnect if disconnected unexpectedly
      // Handle various disconnect reasons:
      // - 'io server disconnect': Server closed connection
      // - 'transport close': Network issue or connection lost
      // - 'io client disconnect': Client manually disconnected (don't reconnect)
      // - 'ping timeout': Server didn't respond to ping (network issue)
      if (reason === 'io server disconnect' || 
          reason === 'transport close' || 
          reason === 'ping timeout' ||
          reason === 'transport error') {
        // Socket.IO will handle automatic reconnection, but we also track it manually
        // Reset our counter to allow Socket.IO's built-in reconnection to work
        // We'll only use manual reconnection if Socket.IO gives up
        console.log(`🔄 [WebSocket] Disconnected (${reason}), Socket.IO will attempt automatic reconnection...`);
      } else if (reason === 'io client disconnect') {
        // Client manually disconnected, don't reconnect
        console.log('ℹ️ [WebSocket] Client manually disconnected, not attempting reconnect');
        reconnectAttempts.current = 0;
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ [WebSocket] Connection error:', error.message);
      setIsConnected(false);
      isConnectingRef.current = false;
      
      // Attempt to reconnect on connection error
      // This handles network issues, server unavailable, etc.
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`🔄 [WebSocket] Connection error, attempting reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
        
        // Clear any existing timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current += 1;
          console.log(`🔄 [WebSocket] Retrying connection (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...`);
          connect();
        }, delay);
      } else {
        console.error(`❌ [WebSocket] Max reconnection attempts (${maxReconnectAttempts}) reached. Stopping reconnection attempts.`);
      }
    });

    // Handle Socket.IO reconnection events
    newSocket.on('reconnect_attempt', (attemptNumber: number) => {
      console.log(`🔄 [WebSocket] Socket.IO reconnection attempt ${attemptNumber}/${maxReconnectAttempts}`);
    });

    newSocket.on('reconnect', (attemptNumber: number) => {
      console.log(`✅ [WebSocket] Socket.IO reconnected successfully after ${attemptNumber} attempts`);
      reconnectAttempts.current = 0; // Reset our counter when Socket.IO reconnects
    });

    newSocket.on('reconnect_error', (error: Error) => {
      console.error(`❌ [WebSocket] Socket.IO reconnection error:`, error.message);
    });

    newSocket.on('reconnect_failed', () => {
      console.error(`❌ [WebSocket] Socket.IO reconnection failed after ${maxReconnectAttempts} attempts`);
      reconnectAttempts.current = maxReconnectAttempts; // Mark as failed
      
      // Even after Socket.IO gives up, we should still try to reconnect periodically
      // This allows recovery if network comes back later
      console.log('💡 [WebSocket] Will retry connection periodically every 30 seconds...');
      
      // Clear any existing periodic retry
      if (periodicRetryIntervalRef.current) {
        clearInterval(periodicRetryIntervalRef.current);
      }
      
      periodicRetryIntervalRef.current = setInterval(() => {
        if (!isConnected && !isConnectingRef.current && currentUser) {
          console.log('🔄 [WebSocket] Periodic retry: attempting to reconnect...');
          reconnectAttempts.current = 0; // Reset attempts for periodic retry
          connect();
        } else if (isConnected) {
          // Connection succeeded, clear interval
          if (periodicRetryIntervalRef.current) {
            clearInterval(periodicRetryIntervalRef.current);
            periodicRetryIntervalRef.current = null;
          }
        }
      }, 30000); // Retry every 30 seconds
    });

    // Handle server's connected event
    newSocket.on('connected', (data: any) => {
      console.log('✅ [WebSocket] Server confirmed connection');
    });

    // DEV: Log every incoming event to verify names/payloads
    if (__DEV__) {
      newSocket.onAny((event: string, payload: any) => {
        try {
          const rid = payload?.chatRoomId || payload?.message?.chatRoomId || payload?.[0]?.chatRoomId;
         // console.log(`🛰️ [WebSocket] onAny '${event}'`, rid ? `room=${rid}` : '', payload);
        } catch {}
      });
    }

    // Handle new message from server
    newSocket.on('newMessage', async (data: any) => {
      // If the app is not active (background/inactive), do not touch store/cache.
      // All such messages will be synchronized via API when returning to active state.
      if (!appStateRef.current.match(/active/)) {
        console.log('[WebSocket] newMessage received while app is not active, ignoring', {
          appState: appStateRef.current,
        });
        return;
      }

      // Handle case where data comes as array (from onAny handler)
      const messageData = Array.isArray(data) ? data[0] : data;

      if (messageData && messageData.chatRoomId && messageData.message) {
        const isMessageFromCurrentUser = messageData.message.senderId === currentUser?.id;

        // Check if chat room exists in store
        const { chatRooms, addMessage, updateChatRoom, mergeChatRooms } = useChatStore.getState();
        const existingRoom = chatRooms.find((r: ChatRoom) => r.id === messageData.chatRoomId);

        // If chat room doesn't exist in store, it might have been deleted/hidden
        // Try to restore it by loading from API
        if (!existingRoom) {
          console.log('🔄 [WebSocket] Chat room not found in store, attempting to restore:', messageData.chatRoomId);
          try {
            const restoredRoom = await chatApi.getChatRoom(messageData.chatRoomId);
            
            // Normalize participant avatar field (profilePhoto -> avatar)
            const normalized: ChatRoom = {
              ...restoredRoom,
              participants: Array.isArray(restoredRoom.participants)
                ? restoredRoom.participants.map((p: any) => ({
                    ...p,
                    user: {
                      ...p.user,
                      avatar: p.user?.avatar ?? p.user?.profilePhoto ?? '',
                    },
                  }))
                : [],
            };

            // Add restored chat room to store
            mergeChatRooms([normalized]);
            console.log('✅ [WebSocket] Chat room restored:', normalized.id);

            // Join WebSocket room for the restored chat
            if (newSocket && newSocket.connected) {
              console.log('🔌 [WebSocket] Joining restored chat room:', normalized.id);
              newSocket.emit('joinChatRoom', { chatRoomId: normalized.id });
              joinedRoomsRef.current.add(normalized.id);
            }
          } catch (restoreError) {
            console.error('❌ [WebSocket] Failed to restore chat room:', restoreError);
            // Continue with message processing even if restore failed
          }
        }

        // Check if this chat is currently active (open)
        const { getActiveChatRoomId } = await import('@/services/ActiveChatService');
        const activeChatRoomId = getActiveChatRoomId();
        const isChatActive = activeChatRoomId === messageData.chatRoomId;
        const currentUserId = currentUser?.id || '';
        const currentReadBy = messageData.message.readBy || [];
        const shouldMarkAsRead = isChatActive && !isMessageFromCurrentUser && !currentReadBy.includes(currentUserId);
        
        // If chat is active and message is not from current user, mark it as read immediately
        let messageToAdd = messageData.message;
        if (shouldMarkAsRead) {
          messageToAdd = {
            ...messageData.message,
            readBy: [...currentReadBy, currentUserId],
            // For DIRECT chats: isRead becomes true when any participant reads
            // For GROUP/LOAD chats: isRead might stay false, but readBy tracks who read
            isRead: existingRoom?.type === 'DIRECT' ? true : messageData.message.isRead,
          };
          
          console.log('✅ [WebSocket] Marking new message as read (chat is active):', messageToAdd.id);
          
          // Send messageRead event to server
          if (newSocket && newSocket.connected) {
            newSocket.emit('messageRead', {
              messageId: messageToAdd.id,
              chatRoomId: messageData.chatRoomId,
            });
          }
        }
        
        // Update Zustand store (same as in Next.js)
        try {
          addMessage(messageData.chatRoomId, messageToAdd);
        } catch {}

        // Save message to cache immediately (regardless of whether chat is open or not)
        // This ensures message is available when user opens the chat
        // IMPORTANT: Use messageToAdd (which may be marked as read if chat is active) instead of original message
        try {
          const { messagesByRoom } = useChatStore.getState();
          const existingMessages = messagesByRoom[messageData.chatRoomId] || [];
          
          // Check if message already exists to avoid duplicates
          const messageExists = existingMessages.some(msg => msg.id === messageToAdd.id);
          if (!messageExists) {
            // Add new message to existing messages and sort by date
            // Use messageToAdd which may already be marked as read if chat is active
            const updatedMessages = [...existingMessages, messageToAdd].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            
            // Save to cache asynchronously with read status if chat is active
            messagesCacheService.saveMessages(messageData.chatRoomId, updatedMessages).catch((error) => {
              console.error('❌ [WebSocket] Failed to save new message to cache:', error);
            });
          } else if (shouldMarkAsRead) {
            // Message already exists, but we need to update it as read in cache
            messagesCacheService.updateMessage(messageToAdd.id, {
              isRead: messageToAdd.isRead,
              readBy: messageToAdd.readBy,
            }).catch((error) => {
              console.error('❌ [WebSocket] Failed to update message as read in cache:', error);
            });
          }
        } catch (cacheError) {
          console.error('❌ [WebSocket] Failed to save message to cache:', cacheError);
        }

        // Prepare updates for chat room
        // IMPORTANT: Use messageToAdd (which may be marked as read if chat is active) instead of original message
        // This ensures lastMessage in chat list shows correct read status
        const updates: any = {
          lastMessage: messageToAdd, // Use messageToAdd which may already be marked as read
          updatedAt: messageToAdd.createdAt,
        };
        
        // Log if message is marked as read for debugging
        if (shouldMarkAsRead) {
          console.log('✅ [WebSocket] Updating lastMessage with read status:', {
            messageId: messageToAdd.id,
            isRead: messageToAdd.isRead,
            readBy: messageToAdd.readBy,
            chatRoomId: messageData.chatRoomId,
          });
        }

        // Update unreadCount based on whether chat is active:
        // 1. If chat is active and message is marked as read immediately -> unreadCount doesn't change
        //    (message never counts as unread)
        // 2. If chat is NOT active and message is NOT from current user -> increment unreadCount
        //    (message counts as unread)
        if (!isMessageFromCurrentUser && !shouldMarkAsRead) {
          // Chat is not active, message is not from current user -> increment unreadCount
          updates.unreadCountIncrement = 1;
        }
        // If shouldMarkAsRead is true, we don't update unreadCount because message is immediately marked as read
        // and never counts as unread

        // Update chat room in store (unreadCount increment if needed)
        try {
          const { chatRooms: updatedRooms, updateChatRoom: updateRoom } = useChatStore.getState();
          let patch: any = { lastMessage: updates.lastMessage, updatedAt: updates.updatedAt };
          if (updates.unreadCountIncrement) {
            const room = updatedRooms.find((r: ChatRoom) => r.id === messageData.chatRoomId);
            const currentUnread = room?.unreadCount || 0;
            patch.unreadCount = currentUnread + updates.unreadCountIncrement;
          }
          updateRoom(messageData.chatRoomId, patch);
        } catch {}
      }
    });

    // Handle chat room updates
    newSocket.on('chatRoomUpdated', (data: any) => {
      console.log('💬 [WebSocket] Chat room updated:', data);
      // TODO: Update chat room in store
    });

    // Handle chat room deleted (permanently deleted from database)
    newSocket.on('chatRoomDeleted', async (data: { chatRoomId: string; deletedBy: string }) => {
      try {
        console.log('🗑️ [WebSocket] Chat room deleted:', data.chatRoomId);
        const { removeChatRoom } = useChatStore.getState();
        removeChatRoom(data.chatRoomId);
        
        // Clear messages cache for this chat room
        await messagesCacheService.clearMessages(data.chatRoomId).catch((err) => {
          console.error('Failed to clear messages cache:', err);
        });
      } catch (e) {
        console.error('Failed to handle chatRoomDeleted:', e);
      }
    });

    // Handle chat room hidden (for DIRECT chats - marked as hidden in DB)
    newSocket.on('chatRoomHidden', async (data: { chatRoomId: string }) => {
      try {
        console.log('👁️ [WebSocket] Chat room hidden:', data.chatRoomId);
        const { removeChatRoom } = useChatStore.getState();
        removeChatRoom(data.chatRoomId);
        
        // Clear messages cache for this chat room
        await messagesCacheService.clearMessages(data.chatRoomId).catch((err) => {
          console.error('Failed to clear messages cache:', err);
        });
      } catch (e) {
        console.error('Failed to handle chatRoomHidden:', e);
      }
    });

    // Handle chat room restoration (when a message is sent to a hidden DIRECT chat)
    newSocket.on('chatRoomRestored', async (data: { chatRoomId: string }) => {
      try {
        console.log('🔄 [WebSocket] Chat room restored:', data.chatRoomId);
        
        // Load the restored chat room from API
        const restoredRoom = await chatApi.getChatRoom(data.chatRoomId);
        
        // Normalize participant avatar field (profilePhoto -> avatar)
        const normalized: ChatRoom = {
          ...restoredRoom,
          participants: Array.isArray(restoredRoom.participants)
            ? restoredRoom.participants.map((p: any) => ({
                ...p,
                user: {
                  ...p.user,
                  avatar: p.user?.avatar ?? p.user?.profilePhoto ?? '',
                },
              }))
            : [],
        };

        // Add restored chat room to store
        const { mergeChatRooms } = useChatStore.getState();
        mergeChatRooms([normalized]);
        console.log('✅ [WebSocket] Chat room added to store:', normalized.id);

        // Join WebSocket room for the restored chat
        if (newSocket && newSocket.connected) {
          console.log('🔌 [WebSocket] Joining restored chat room:', normalized.id);
          newSocket.emit('joinChatRoom', { chatRoomId: normalized.id });
          joinedRoomsRef.current.add(normalized.id);
        }

        // Update cache service
        try {
          const { chatCacheService } = await import('@/services/ChatCacheService');
          const cachedRooms = await chatCacheService.getChatRooms();
          const updatedRooms = [...cachedRooms.filter(r => r.id !== normalized.id), normalized];
          await chatCacheService.saveChatRooms(updatedRooms);
          console.log('✅ [WebSocket] Chat room saved to cache');
        } catch (cacheError) {
          console.error('❌ [WebSocket] Failed to update cache:', cacheError);
        }
      } catch (error) {
        console.error('❌ [WebSocket] Failed to restore chat room:', error);
      }
    });

    // Handle participant removed from chat room
    newSocket.on('participantRemoved', async (data: { chatRoomId: string; removedUserId: string; removedBy: string }) => {
      try {
        const { chatRoomId, removedUserId } = data;
        const state = useChatStore.getState();
        const room = state.chatRooms.find((r) => r.id === chatRoomId);
        if (!room) return;

        // Check if the removed user is the current user
        if (currentUser?.id === removedUserId) {
          // Remove the entire chat room from the list
          state.removeChatRoom(chatRoomId);
          
          // Clear messages cache for this chat room
          await messagesCacheService.clearMessages(chatRoomId).catch((err) => {
            console.error('Failed to clear messages cache:', err);
          });
          return;
        }

        // Otherwise, just remove the participant from the room
        const filtered = room.participants.filter(
          (p) => (p.user?.id || p.userId) !== removedUserId
        );
        state.updateChatRoom(chatRoomId, { participants: filtered });
      } catch (e) {
        console.error('Failed to handle participantRemoved:', e);
      }
    });

    // Handle when current user is removed from a chat room
    newSocket.on('removedFromChatRoom', async (data: { chatRoomId: string; removedBy: string }) => {
      try {
        const { chatRoomId } = data;
        console.log('🚪 [WebSocket] Removed from chat room:', chatRoomId);
        const { removeChatRoom } = useChatStore.getState();
        removeChatRoom(chatRoomId);
        
        // Clear messages cache for this chat room
        await messagesCacheService.clearMessages(chatRoomId).catch((err) => {
          console.error('Failed to clear messages cache:', err);
        });
      } catch (e) {
        console.error('Failed to handle removedFromChatRoom:', e);
      }
    });

    // Handle chat room created / user added to a chat room
    // Mirrors Next.js WebSocketContext.tsx chatRoomCreated handler
    newSocket.on('chatRoomCreated', async (data: any) => {
      try {
        console.log('📦 [WebSocket] chatRoomCreated event received:', JSON.stringify(data, null, 2));
        
        // Backend may emit either the chat room object directly or wrapped as { chatRoom }
        const raw: any = data && 'chatRoom' in data ? data.chatRoom : data;

        if (raw && raw.id) {
          // Normalize participant avatar field (profilePhoto -> avatar)
          // Mirrors Next.js normalization logic
          const normalized: ChatRoom = {
            ...raw,
            participants: Array.isArray(raw.participants)
              ? raw.participants.map((p: any) => ({
                  ...p,
                  user: {
                    ...p.user,
                    avatar: p.user?.avatar ?? p.user?.profilePhoto ?? '',
                  },
                }))
              : [],
          };

          console.log('✅ [WebSocket] Normalized chat room:', {
            id: normalized.id,
            type: normalized.type,
            name: normalized.name,
            participantsCount: normalized.participants?.length || 0,
          });
          // Add to store
          try {
            const { mergeChatRooms } = useChatStore.getState();
            mergeChatRooms([normalized]);
            
            // Also save to cache to ensure persistence
            // This ensures the chat appears even if app was inactive
            const { chatCacheService } = await import('@/services/ChatCacheService');
            const currentRooms = useChatStore.getState().chatRooms;
            await chatCacheService.saveChatRooms(currentRooms).catch((err) => {
              console.error('❌ [WebSocket] Failed to save chat room to cache:', err);
            });
            console.log('💾 [WebSocket] Saved chat room to cache:', normalized.id);
          } catch {}

          // Automatically join the WebSocket room for the new chat
          // This ensures the user receives real-time messages in this chat
          if (newSocket && newSocket.connected) {
            console.log('🔌 [WebSocket] Joining chat room:', normalized.id);
            newSocket.emit('joinChatRoom', { chatRoomId: normalized.id });
            joinedRoomsRef.current.add(normalized.id);
          }
        } else {
          console.error('❌ [WebSocket] Invalid chatRoomCreated payload:', data);
        }
      } catch (error) {
        console.error('❌ [WebSocket] Error handling chatRoomCreated:', error);
      }
    });

    // Handle user added to a chat room
    // Mirrors Next.js WebSocketContext.tsx addedToChatRoom handler
    newSocket.on('addedToChatRoom', async (data: any) => {
      try {
        console.log('📦 [WebSocket] addedToChatRoom event received:', JSON.stringify(data, null, 2));
        
        const roomId = data?.chatRoomId;
        if (roomId) {
          console.log('🔄 [WebSocket] Loading chat room from API:', roomId);
          // Try to get chat room from API to ensure we have full data
          // This is needed because addedToChatRoom might not include full chat room data
          try {
            const room = await chatApi.getChatRoom(roomId);
            
            // Normalize participant avatar field (profilePhoto -> avatar)
            const normalized: ChatRoom = {
              ...room,
              participants: Array.isArray(room.participants)
                ? room.participants.map((p: any) => ({
                    ...p,
                    user: {
                      ...p.user,
                      avatar: p.user?.avatar ?? p.user?.profilePhoto ?? '',
                    },
                  }))
                : [],
            };
            
            console.log('✅ [WebSocket] Loaded and normalized chat room from API:', {
              id: normalized.id,
              type: normalized.type,
              name: normalized.name,
              participantsCount: normalized.participants?.length || 0,
            });
            try {
              const { mergeChatRooms } = useChatStore.getState();
              mergeChatRooms([normalized]);
              
              // Also save to cache to ensure persistence
              // This ensures the chat appears even if app was inactive
              const { chatCacheService } = await import('@/services/ChatCacheService');
              const currentRooms = useChatStore.getState().chatRooms;
              await chatCacheService.saveChatRooms(currentRooms).catch((err) => {
                console.error('❌ [WebSocket] Failed to save chat room to cache:', err);
              });
              console.log('💾 [WebSocket] Saved chat room to cache:', normalized.id);
            } catch {}
            
            // Automatically join the WebSocket room for the new chat
            if (newSocket && newSocket.connected) {
              console.log('🔌 [WebSocket] Joining chat room:', normalized.id);
              newSocket.emit('joinChatRoom', { chatRoomId: normalized.id });
              joinedRoomsRef.current.add(normalized.id);
            }
          } catch (apiError) {
            console.error('❌ [WebSocket] Failed to load chat room from API:', apiError);
            // If API fails, we can't add the chat room, but log the error
          }
        } else {
          console.error('❌ [WebSocket] Invalid addedToChatRoom payload - missing chatRoomId:', data);
        }
      } catch (error) {
        console.error('❌ [WebSocket] Error handling addedToChatRoom:', error);
      }
    });

    // Handle typing indicators
    newSocket.on('userTyping', (data: any) => {
      try {
        if (!data?.chatRoomId || !data?.userId) return;
        setTypingByRoom(prev => {
          const room = prev[data.chatRoomId] || {};
          return {
            ...prev,
            [data.chatRoomId]: {
              ...room,
              [data.userId]: { isTyping: !!data.isTyping, firstName: data.firstName },
            },
          };
        });
      } catch {}
    });

    // Handle user online/offline status
    // Note: Server sends 'userOnline' event with isOnline field (true/false)
    // These events will be handled by useOnlineStatusWithWebSocket hook
    newSocket.on('userOnline', (data: { userId: string; chatRoomId?: string; isOnline: boolean }) => {
      // Status will be updated by useOnlineStatusWithWebSocket hook listening to socket events
    });

    // Handle message read status update (sender gets this when someone reads their message)
    newSocket.on('messageRead', (data: { messageId: string; readBy: string; chatRoomId?: string }) => {
      console.log('📖 [WebSocket] messageRead:', data);
      
      // Emit event through eventBus so useChatRoom can handle it
      // This ensures proper handling for GROUP and LOAD chats
      const { eventBus, AppEvents } = require('@/services/EventBus');
      eventBus.emit(AppEvents.MessageRead, data);
      
      try {
        const { chatRooms, messagesByRoom, markMessagesRead } = useChatStore.getState();
        let roomId = data.chatRoomId;
        if (!roomId) {
          const room = chatRooms.find((r: ChatRoom) => r.lastMessage?.id === data.messageId);
          roomId = room?.id;
        }
        if (!roomId) {
          for (const [rid, msgs] of Object.entries(messagesByRoom)) {
            if ((msgs || []).some((m) => m.id === data.messageId)) {
              roomId = rid;
              break;
            }
          }
        }
        if (roomId) {
          console.log('📖 [WebSocket] messageRead -> resolved roomId:', roomId);
          markMessagesRead(roomId, [data.messageId], data.readBy);
        } else {
          console.warn('📖 [WebSocket] messageRead -> roomId not found; will retry once');
          setTimeout(() => {
            try {
              const { chatRooms: cr, messagesByRoom: mbr, markMessagesRead: mmr } = useChatStore.getState();
              let rid: string | undefined;
              const room = cr.find((r: ChatRoom) => r.lastMessage?.id === data.messageId);
              rid = room?.id;
              if (!rid) {
                for (const [ridCandidate, msgs] of Object.entries(mbr)) {
                  if ((msgs || []).some((m) => m.id === data.messageId)) {
                    rid = ridCandidate;
                    break;
                  }
                }
              }
              if (rid) {
                console.log('📖 [WebSocket] messageRead -> resolved on retry roomId:', rid);
                mmr(rid, [data.messageId], data.readBy);
              } else {
                console.warn('📖 [WebSocket] messageRead -> still no roomId after retry');
              }
            } catch {}
          }, 200);
        }
      } catch (e) {
        console.warn('messageRead handling failed:', e);
      }
    });

    // Handle bulk messages marked as read (when markChatRoomAsRead is called)
    // This updates unreadCount in the chat room list
    newSocket.on('messagesMarkedAsRead', (data: { chatRoomId: string; messageIds: string[]; userId: string }) => {
      console.log('✅ [WebSocket] Messages marked as read:', data);
      try {
        const { markMessagesRead } = useChatStore.getState();
        markMessagesRead(data.chatRoomId, data.messageIds, data.userId);
        
        // Only update unreadCount if this is for the current user
        // Compare userId from event with current user's ID
        if (data.userId === currentUser?.id) {
          try {
            const { chatRooms, updateChatRoom } = useChatStore.getState();
            const room = chatRooms.find((r: ChatRoom) => r.id === data.chatRoomId);
            if (room) {
              // Decrement unreadCount by the number of messages that were marked as read
              const currentUnread = room.unreadCount || 0;
              const readCount = data.messageIds.length; // Number of messages that were read
              const nextUnread = Math.max(0, currentUnread - readCount);
              
              console.log(`📉 [WebSocket] Decreasing unreadCount for ${data.chatRoomId}: ${currentUnread} - ${readCount} = ${nextUnread}`);
              
              // Update unreadCount for this chat room
              updateChatRoom(data.chatRoomId, { unreadCount: nextUnread });
              
              // Also update cache to ensure persistence
              const { chatCacheService } = require('@/services/ChatCacheService');
              chatCacheService.updateChatRoom(data.chatRoomId, { unreadCount: nextUnread }).catch(() => {});
            }
          } catch (error) {
            console.error('❌ [WebSocket] Failed to update unreadCount:', error);
          }
        } else {
          // userId doesn't match current user - this is for read receipts only
          // Don't update unreadCount for current user
          console.log(`ℹ️ [WebSocket] messagesMarkedAsRead for different user (${data.userId}), skipping unreadCount update`);
        }
      } catch {}

      // Emit event through eventBus so useChatRoom can handle it
      // This ensures proper handling for GROUP and LOAD chats
      const { eventBus, AppEvents } = require('@/services/EventBus');
      eventBus.emit(AppEvents.MessagesMarkedAsRead, data);
    });

    newSocket.on('joinedChatRoom', (data: { chatRoomId: string }) => {
      if (data?.chatRoomId) {
        joinedRoomsRef.current.add(data.chatRoomId);
      }
    });

    setSocket(newSocket);
  }, [currentUser, getAuthToken]);

  const disconnect = useCallback(() => {
    if (socket) {
      console.log('🔌 [WebSocket] Disconnecting...');
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttempts.current = 0;
    isConnectingRef.current = false;
  }, [socket]);

  const joinChatRoom = useCallback((chatRoomId: string) => {
    if (socket && isConnected) {
      console.log('🚪 [WebSocket] Joining chat room:', chatRoomId);
      socket.emit('joinChatRoom', { chatRoomId });
    }
  }, [socket, isConnected]);

  const leaveChatRoom = useCallback((chatRoomId: string) => {
    if (socket && isConnected) {
      console.log('🚪 [WebSocket] Leaving chat room:', chatRoomId);
      socket.emit('leaveChatRoom', { chatRoomId });
    }
  }, [socket, isConnected]);

  const removeParticipant = useCallback((data: { chatRoomId: string; participantId: string }) => {
    if (socket && isConnected) {
      console.log('🚪 [WebSocket] Removing participant from chat room:', data);
      socket.emit('removeParticipant', data);
    }
  }, [socket, isConnected]);

  const sendMessage = useCallback((data: SendMessageData) => {
    if (!socket) {
      throw new Error('WebSocket not initialized');
    }
    
    if (!isConnected || !socket.connected) {
      throw new Error('WebSocket not connected');
    }
    
    console.log('📤 [WebSocket] Sending message:', data);
    socket.emit('sendMessage', data);
  }, [socket, isConnected]);

  const sendTyping = useCallback((chatRoomId: string, isTyping: boolean) => {
    if (socket && isConnected) {
      socket.emit('typing', { chatRoomId, isTyping });
    }
  }, [socket, isConnected]);

  const markMessageAsRead = useCallback((messageId: string, chatRoomId: string) => {
    if (socket && isConnected && socket.connected) {
      // Send messageRead event, matching Next.js implementation
      socket.emit('messageRead', { messageId, chatRoomId });
    }
  }, [socket, isConnected]);

  const markChatRoomAsRead = useCallback((chatRoomId: string) => {
    if (socket && isConnected && String(appStateRef.current).match(/active/)) {
      socket.emit('markChatRoomAsRead', { chatRoomId });
    }
  }, [socket, isConnected]);

  // Auto-connect when user is available
  useEffect(() => {
    if (currentUser) {
      if (!isConnected && !socket && !isConnectingRef.current) {
        connect();
      }
    } else {
      if (isConnected) {
        disconnect();
      }
    }
  }, [currentUser, isConnected, socket]);

  // Disconnect event via EventBus is no longer used; call disconnect directly where needed

  // Track app state to detect when app was closed
  const wasInBackgroundRef = useRef(false);

  // Handle app state changes (reconnect when app comes to foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      appStateRef.current = nextAppState;

      // Track when app goes to background/inactive
      if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        wasInBackgroundRef.current = true;
        console.log('📱 [WebSocket] App went to background/inactive');
      }

      if (nextAppState === 'active' && currentUser) {
        const wasInBackground = wasInBackgroundRef.current;
        
        if (wasInBackground) {
          console.log('📱 [WebSocket] App became active after being in background');
          wasInBackgroundRef.current = false;
        }

        if (!isConnected && !socket && !isConnectingRef.current) {
          // App came to foreground and we're disconnected, reset attempts and try to reconnect
          console.log('📱 [WebSocket] App became active, resetting reconnection attempts and attempting to reconnect...');
          reconnectAttempts.current = 0; // Reset attempts when app comes to foreground
          
          // Clear any existing timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          
          connect();
        } else if (isConnected && wasInBackground) {
          // App was in background and WebSocket is already connected
          // Trigger sync event so useChatRooms can sync data
          console.log('✅ [WebSocket] App became active, WebSocket already connected, sync should happen via useChatRooms');
        } else {
          console.log('✅ [WebSocket] App became active, already connected');
        }
      }

      // When app goes to background/inactive, explicitly close WebSocket
      // to prevent messages from being auto-marked as read in the background.
      if (nextAppState.match(/inactive|background/)) {
        if (socket) {
          console.log('📱 [WebSocket] App moved to background, disconnecting socket');
          socket.disconnect();
          setSocket(null);
          setIsConnected(false);
          joinedRoomsRef.current.clear();
        }
      }

    });

    return () => {
      subscription.remove();
    };
  }, [currentUser, isConnected, connect, socket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (periodicRetryIntervalRef.current) {
        clearInterval(periodicRetryIntervalRef.current);
      }
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  // Removed global auto-join to avoid re-render loops; we join
  // explicitly on chatRoomCreated/addedToChatRoom and when user opens a chat

  const value: WebSocketContextType = {
    socket,
    isConnected,
    connect,
    disconnect,
    joinChatRoom,
    leaveChatRoom,
    removeParticipant,
    sendMessage,
    sendTyping,
    markMessageAsRead,
    markChatRoomAsRead,
    typingByRoom,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

