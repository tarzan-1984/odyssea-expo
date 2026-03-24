import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useWebSocket } from '@/context/WebSocketContext';
import { useAuth } from '@/context/AuthContext';

/**
 * Hook to ensure WebSocket is connected when entering a screen that needs real-time updates.
 * Call this on screens like Offers (Work), Chat, etc. to trigger reconnect if connection was lost.
 */
export function useWebSocketConnectionCheck() {
  const { isConnected, connect } = useWebSocket();
  const { authState } = useAuth();
  const currentUser = authState.user;

  useEffect(() => {
    if (currentUser && !isConnected && AppState.currentState === 'active') {
      connect();
    }
  }, [currentUser, isConnected]);
}
