import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Nudge WebSocket reconnect as soon as the device regains network connectivity.
 */
export function useNetworkReconnect(onNetworkBack: () => void): void {
  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        onNetworkBack();
      }
    });
    return () => subscription();
  }, [onNetworkBack]);
}
