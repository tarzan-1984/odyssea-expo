import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { secureStorage } from '@/utils/secureStorage';
import { WS_URL } from '@/lib/config';
import { AppState, AppStateStatus } from 'react-native';
import { eventBus, AppEvents } from '@/services/EventBus';
import { chatApi } from '@/app-api/chatApi';

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
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

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
    // Only connect if we have a current user
    if (!currentUser) {
      console.log('⚠️ [WebSocket] No user, skipping connection');
      return;
    }

    // Disconnect existing connection if any
    if (socket) {
      socket.disconnect();
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
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('✅ [WebSocket] Connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;

      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
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

      // Attempt to reconnect if disconnected unexpectedly
      if (reason === 'io server disconnect' || reason === 'transport close') {
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 [WebSocket] Attempting reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current += 1;
            connect();
          }, delay);
        } else {
          console.error('❌ [WebSocket] Max reconnection attempts reached');
        }
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ [WebSocket] Connection error:', error.message);
      setIsConnected(false);
    });

    // Handle server's connected event
    newSocket.on('connected', (data: any) => {
      console.log('✅ [WebSocket] Server confirmed connection');
    });

    // Handle new message from server
    newSocket.on('newMessage', (data: any) => {
      console.log('📨 [WebSocket] New message received:', data);
      // TODO: Handle new messages (update chat store, show notifications, etc.)
    });

    // Handle chat room updates
    newSocket.on('chatRoomUpdated', (data: any) => {
      console.log('💬 [WebSocket] Chat room updated:', data);
      // TODO: Update chat room in store
    });

    // Handle chat room created / user added to a chat room
    newSocket.on('chatRoomCreated', async (data: any) => {
      try {
        const roomId = data?.chatRoom?.id || data?.chatRoomId;
        if (roomId) {
          const room = await chatApi.getChatRoom(roomId);
          eventBus.emit(AppEvents.ChatRoomAdded, room);
        } else if (data?.chatRoom) {
          eventBus.emit(AppEvents.ChatRoomAdded, data.chatRoom);
        }
      } catch {}
    });

    newSocket.on('addedToChatRoom', async (data: any) => {
      try {
        const roomId = data?.chatRoomId;
        if (roomId) {
          const room = await chatApi.getChatRoom(roomId);
          eventBus.emit(AppEvents.ChatRoomAdded, room);
        }
      } catch {}
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
    if (socket && isConnected) {
      console.log('📤 [WebSocket] Sending message:', data);
      socket.emit('sendMessage', data);
    }
  }, [socket, isConnected]);

  const sendTyping = useCallback((chatRoomId: string, isTyping: boolean) => {
    if (socket && isConnected) {
      socket.emit('typing', { chatRoomId, isTyping });
    }
  }, [socket, isConnected]);

  const markMessageAsRead = useCallback((messageId: string, chatRoomId: string) => {
    if (socket && isConnected) {
      socket.emit('markMessageAsRead', { messageId, chatRoomId });
    }
  }, [socket, isConnected]);

  const markChatRoomAsRead = useCallback((chatRoomId: string) => {
    if (socket && isConnected) {
      socket.emit('markChatRoomAsRead', { chatRoomId });
    }
  }, [socket, isConnected]);

  // Auto-connect when user is available
  useEffect(() => {
    if (currentUser && !isConnected && !socket) {
      connect();
    } else if (!currentUser && isConnected) {
      disconnect();
    }
  }, [currentUser, isConnected, socket, connect, disconnect]);

  // Handle app state changes (reconnect when app comes to foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && currentUser && !isConnected) {
        // App came to foreground, try to reconnect
        console.log('📱 [WebSocket] App became active, attempting to reconnect...');
        connect();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [currentUser, isConnected, connect]);

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

