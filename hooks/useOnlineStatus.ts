import { useState, useEffect, useRef, useCallback } from 'react';

interface OnlineStatus {
  [userId: string]: boolean;
}

/**
 * Hook for tracking online/offline status of users
 * Implements the same logic as useOnlineStatus in Next.js application
 */
export const useOnlineStatus = () => {
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>({});
  const offlineTimeouts = useRef<Map<string, number>>(new Map());

  const updateUserOnlineStatus = useCallback((userId: string, isOnline: boolean) => {
    // Clear existing timeout for this user
    const existingTimeout = offlineTimeouts.current.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      offlineTimeouts.current.delete(userId);
    }

    if (isOnline) {
      // User is online, update immediately
      setOnlineStatus(prev => ({
        ...prev,
        [userId]: true,
      }));
    } else {
      // User is offline, set a 5-second delay before updating
      const timeout = setTimeout(() => {
        setOnlineStatus(prev => ({
          ...prev,
          [userId]: false,
        }));
        offlineTimeouts.current.delete(userId);
      }, 5000);

      offlineTimeouts.current.set(userId, timeout);
    }
  }, []);

  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineStatus[userId] || false;
  }, [onlineStatus]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeout of offlineTimeouts.current.values()) {
        clearTimeout(timeout);
      }
    };
  }, []);

  return {
    onlineStatus,
    updateUserOnlineStatus,
    isUserOnline,
  };
};

