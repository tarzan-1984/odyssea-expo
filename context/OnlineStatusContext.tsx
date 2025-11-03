import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '@/context/WebSocketContext';

interface OnlineStatusMap {
  [userId: string]: boolean;
}

interface OnlineStatusContextType {
  isUserOnline: (userId: string) => boolean;
  onlineStatus: OnlineStatusMap;
}

const OnlineStatusContext = createContext<OnlineStatusContextType | null>(null);

export const OnlineStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, isConnected } = useWebSocket();
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatusMap>({});
  const offlineTimeouts = useRef<Map<string, number>>(new Map());

  const updateUserOnlineStatus = useCallback((userId: string, isOnline: boolean) => {
    // Clear any pending timeout for this user
    const existing = offlineTimeouts.current.get(userId);
    if (existing) {
      clearTimeout(existing);
      offlineTimeouts.current.delete(userId);
    }

    if (isOnline) {
      setOnlineStatus(prev => ({ ...prev, [userId]: true }));
    } else {
      // Delay marking offline to avoid flicker
      const t = setTimeout(() => {
        setOnlineStatus(prev => ({ ...prev, [userId]: false }));
        offlineTimeouts.current.delete(userId);
      }, 5000);
      offlineTimeouts.current.set(userId, t);
    }
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleUserOnline = (data: { userId: string; chatRoomId?: string; isOnline: boolean }) => {
      if (!data?.userId) return;
      updateUserOnlineStatus(data.userId, data.isOnline === true);
    };

    socket.on('userOnline', handleUserOnline);

    return () => {
      socket.off('userOnline', handleUserOnline);
    };
  }, [socket, isConnected, updateUserOnlineStatus]);

  useEffect(() => () => {
    for (const t of offlineTimeouts.current.values()) clearTimeout(t);
    offlineTimeouts.current.clear();
  }, []);

  const isUserOnline = useCallback((userId: string) => !!onlineStatus[userId], [onlineStatus]);

  return (
    <OnlineStatusContext.Provider value={{ isUserOnline, onlineStatus }}>
      {children}
    </OnlineStatusContext.Provider>
  );
};

export const useOnlineStatusContext = () => {
  const ctx = useContext(OnlineStatusContext);
  if (!ctx) throw new Error('useOnlineStatusContext must be used within OnlineStatusProvider');
  return ctx;
};
