import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { secureStorage } from '@/utils/secureStorage';
import { WS_URL } from '@/lib/config';
import { AppState, AppStateStatus } from 'react-native';
import { useChatStore, updateLastMessage } from '@/stores/chatStore';
import { chatApi } from '@/app-api/chatApi';
import { ChatRoom } from '@/components/ChatListItem';

// WebSocket context interface
interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  joinChatRoom: (chatRoomId: string) => void;
  leaveChatRoom: (chatRoomId: string) => void;
  sendMessage: (data: SendMessageData) => void;
  sendTyping: (chatRoomId: string, isTyping: boolean) => void;
  markMessageAsRead: (messageId: string, chatRoomId: string) => void;
  markChatRoomAsRead: (chatRoomId: string) => void;
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
  const chatRoomsList = useChatStore((s) => s.chatRooms);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);

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
    if (socket || isConnectingRef.current) {
      return;
    }
    isConnectingRef.current = true;
    // Only connect if we have a current user
    if (!currentUser) {
      console.log('⚠️ [WebSocket] No user, skipping connection');
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

    console.log('🔌 [WebSocket] Connecting to:', WS_URL);

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
      console.log('✅ [WebSocket] Connected');
      const wasDisconnected = !isConnected;
      setIsConnected(true);
      reconnectAttempts.current = 0;
      isConnectingRef.current = false;

      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // If we were disconnected and now reconnected, trigger sync
      // This handles the case when device was offline and missed messages
      if (wasDisconnected) {
        console.log('🔄 [WebSocket] Reconnected after disconnection');
      }
    });

    // Handle server's connected event (with user data)
    newSocket.on('connected', (data: any) => {
      console.log('✅ [WebSocket] Server confirmed connection:', data);
      // Server automatically joins user to all their chat rooms
      // So we should receive userOnline events for other participants
    });

    newSocket.on('disconnect', (reason) => {
      console.log('⚠️ [WebSocket] Disconnected:', reason);
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
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 [WebSocket] Disconnected (${reason}), attempting reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
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
          console.log('💡 [WebSocket] Tip: Check your network connection or restart the app to try again.');
        }
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
          console.log(`🛰️ [WebSocket] onAny '${event}'`, rid ? `room=${rid}` : '', payload);
        } catch {}
      });
    }

    // Handle new message from server
    newSocket.on('newMessage', (data: any) => {
      // Handle case where data comes as array (from onAny handler)
      const messageData = Array.isArray(data) ? data[0] : data;

      if (messageData && messageData.chatRoomId && messageData.message) {
        const isMessageFromCurrentUser = messageData.message.senderId === currentUser?.id;

        // Update Zustand store (как в Next)
        try {
          const { addMessage } = useChatStore.getState();
          addMessage(messageData.chatRoomId, messageData.message);
        } catch {}

        // Prepare updates for chat room
        const updates: any = {
          lastMessage: messageData.message,
          updatedAt: messageData.message.createdAt,
        };

        // Increment unreadCount only if:
        // 1. The message is NOT from the current user
        // 2. Currently there's no chat screen implementation, so we always increment for others' messages
        // TODO: When chat screen is implemented, check if this is the current active chat
        if (!isMessageFromCurrentUser) {
          // We need to get current unreadCount from the chat room in the list
          // For now, emit event with increment flag and let useChatRooms handle it
          updates.unreadCountIncrement = 1;
        }

        // Update chat room in store (unreadCount increment if нужно) 
        try {
          const { chatRooms, updateChatRoom } = useChatStore.getState();
          let patch: any = { lastMessage: updates.lastMessage, updatedAt: updates.updatedAt };
          if (updates.unreadCountIncrement) {
            const room = chatRooms.find((r: ChatRoom) => r.id === messageData.chatRoomId);
            const currentUnread = room?.unreadCount || 0;
            patch.unreadCount = currentUnread + updates.unreadCountIncrement;
          }
          updateChatRoom(messageData.chatRoomId, patch);
        } catch {}
      }
    });

    // Handle chat room updates
    newSocket.on('chatRoomUpdated', (data: any) => {
      console.log('💬 [WebSocket] Chat room updated:', data);
      // TODO: Update chat room in store
    });

    // Handle chat room created / user added to a chat room
    // Mirrors Next.js WebSocketContext.tsx chatRoomCreated handler
    newSocket.on('chatRoomCreated', async (data: any) => {
      try {
        console.log('📦 [WebSocket] chatRoomCreated event received:', data);
        
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

          console.log('✅ [WebSocket] Normalized chat room:', normalized.id);
          // Add to store
          try {
            const { mergeChatRooms } = useChatStore.getState();
            mergeChatRooms([normalized]);
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
        console.log('📦 [WebSocket] addedToChatRoom event received:', data);
        
        const roomId = data?.chatRoomId;
        if (roomId) {
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
            
            console.log('✅ [WebSocket] Loaded and normalized chat room from API:', normalized.id);
            try {
              const { mergeChatRooms } = useChatStore.getState();
              mergeChatRooms([normalized]);
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
      console.log('⌨️ [WebSocket] User typing:', data);
      // TODO: Handle typing indicators
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
      } catch {}

      // Только для текущего пользователя уменьшаем unreadCount через стор
      if (data.userId === currentUser?.id) {
        try {
          const { chatRooms, updateChatRoom } = useChatStore.getState();
          const room = chatRooms.find((r: ChatRoom) => r.id === data.chatRoomId);
          if (room) {
            const currentUnread = room.unreadCount || 0;
            const nextUnread = Math.max(0, currentUnread - data.messageIds.length);
            updateChatRoom(data.chatRoomId, { unreadCount: nextUnread });
          }
        } catch {}
      }
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
    if (socket && isConnected) {
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

  // Событие отключения через EventBus больше не используем; вызываем disconnect напрямую там, где нужно

  // Handle app state changes (reconnect when app comes to foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && currentUser) {
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
        } else {
          console.log('✅ [WebSocket] App became active, already connected');
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
    sendMessage,
    sendTyping,
    markMessageAsRead,
    markChatRoomAsRead,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

