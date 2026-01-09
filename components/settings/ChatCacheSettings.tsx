import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { chatCacheService } from '@/services/ChatCacheService';
import { messagesCacheService } from '@/services/MessagesCacheService';
import { colors, fonts } from '@/lib';
import { rem, fp } from '@/lib';

export default function ChatCacheSettings() {
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadCacheSize = async () => {
    try {
      // Get size from both chat cache (chat rooms list) and messages cache (messages in chats)
      const chatCacheSize = await chatCacheService.getCacheSize();
      const messagesCacheSize = await messagesCacheService.getCacheSize();
      const totalSize = chatCacheSize + messagesCacheSize;
      setCacheSize(totalSize);
    } catch (error) {
      console.error('[ChatCacheSettings] Failed to load cache size:', error);
    }
  };

  // Update cache size every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      loadCacheSize();
    }, [])
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear chat cache',
      'Are you sure you want to clear all cached chat data? This will free up storage space but chat rooms and messages will need to be reloaded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              // Clear both chat cache and messages cache
              await chatCacheService.clearCache();
              await messagesCacheService.clearAllMessages();
              await loadCacheSize();
              Alert.alert('Success', 'Chat cache cleared');
            } catch (error) {
              console.error('[ChatCacheSettings] Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear chat cache');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Chat Cache</Text>
        <TouchableOpacity
          style={[styles.button, styles.clearButton, isLoading && styles.buttonDisabled]}
          onPress={handleClearCache}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.neutral.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>Clear cache</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Cache size: {formatFileSize(cacheSize)}</Text>
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
    marginBottom: rem(12),
  },
  title: {
    fontFamily: fonts['700'],
    fontSize: fp(18),
    color: colors.primary.blue,
    flex: 1,
  },
  infoContainer: {
    marginTop: 0,
    marginBottom: 0,
    padding: 0,
    backgroundColor: 'transparent',
  },
  infoText: {
    fontSize: fp(14),
    color: colors.neutral.darkGrey,
  },
  button: {
    paddingVertical: rem(10),
    paddingHorizontal: rem(16),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: rem(90),
  },
  clearButton: {
    backgroundColor: '#FF3B30',
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

