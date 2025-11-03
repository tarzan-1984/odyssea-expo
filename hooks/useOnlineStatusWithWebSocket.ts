import { useEffect } from 'react';
import { useWebSocket } from '@/context/WebSocketContext';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Hook that combines useOnlineStatus with WebSocket integration
 * Listens to userOnline/userOffline events and updates status accordingly
 */
export const useOnlineStatusWithWebSocket = () => {
  const { socket, isConnected } = useWebSocket();
  const { onlineStatus, updateUserOnlineStatus, isUserOnline } = useOnlineStatus();

  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    const handleUserOnline = (data: { userId: string; chatRoomId?: string; isOnline: boolean }) => {
      if (data.userId) {
        // Server sends userOnline event with isOnline field (true for online, false for offline)
        // This is the same event used for both online and offline status
        updateUserOnlineStatus(data.userId, data.isOnline === true);
      }
    };

    // Listen to userOnline events (handles both online and offline via isOnline field)
    socket.on('userOnline', handleUserOnline);

    return () => {
      socket.off('userOnline', handleUserOnline);
    };
  }, [socket, isConnected, updateUserOnlineStatus]);

  return {
    onlineStatus,
    updateUserOnlineStatus,
    isUserOnline,
  };
};

