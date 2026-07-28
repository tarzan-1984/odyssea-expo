import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useWebSocket } from '@/context/WebSocketContext';
import { colors, fonts } from '@/lib';
import { rem, fp } from '@/lib';

export default function WebSocketConnectionSettings() {
  const { isConnected, connect } = useWebSocket();
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnect = async () => {
    if (isReconnecting) return;

    setIsReconnecting(true);
    try {
      // Always force a fresh Socket.IO client. When the socket is stuck in
      // Manager reconnect (`active` but not `connected`), plain connect() is a no-op.
      await Promise.resolve(connect({ force: true }));

      // Wait a moment to allow the connection attempt to settle
      await new Promise((resolve) => setTimeout(resolve, 2000));

      Alert.alert(
        'Reconnection initiated',
        'WebSocket reconnection has been initiated. The connection status will update automatically.',
      );
    } catch (error) {
      console.error('[WebSocketConnectionSettings] Failed to reconnect:', error);
      Alert.alert('Error', 'Failed to reconnect WebSocket. Please try again.');
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>WebSocket Connection</Text>
          <Text style={styles.statusText}>
            Status: <Text style={[styles.statusValue, isConnected && styles.statusOnline, !isConnected && styles.statusOffline]}>
              {isConnected ? 'Online' : 'Offline'}
            </Text>
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.button, styles.reconnectButton, isReconnecting && styles.buttonDisabled]}
          onPress={handleReconnect}
          disabled={isReconnecting}
        >
          {isReconnecting ? (
            <ActivityIndicator color={colors.neutral.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>Reconnect</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: rem(16),
    backgroundColor: 'white',
    marginBottom: rem(12),
    borderRadius: rem(8),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    flex: 1,
    marginRight: rem(12),
  },
  title: {
    fontFamily: fonts['700'],
    fontSize: fp(18),
    color: colors.primary.blue,
    marginBottom: rem(4),
  },
  statusText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  statusValue: {
    fontFamily: fonts['600'],
  },
  statusOnline: {
    color: colors.semantic.success,
  },
  statusOffline: {
    color: colors.semantic.error,
  },
  button: {
    paddingVertical: rem(10),
    paddingHorizontal: rem(16),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(90),
  },
  reconnectButton: {
    backgroundColor: colors.primary.blue,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: fp(13),
    fontWeight: '600',
  },
});
