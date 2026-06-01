import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message } from '@/components/ChatListItem';

/**
 * Messages Cache Service
 * Implements caching for messages using AsyncStorage
 * Similar to IndexedDBChatService in Next.js, but using AsyncStorage for React Native
 */

const MESSAGES_KEY_PREFIX = '@messages_cache_';
const MESSAGES_TIMESTAMP_KEY_PREFIX = '@messages_cache_timestamp_';

interface StoredMessage extends Message {
  cachedAt: number;
  version: number;
}

class MessagesCacheService {
  /**
   * Get cache key for a specific chat room
   */
  private getMessagesKey(chatRoomId: string): string {
    return `${MESSAGES_KEY_PREFIX}${chatRoomId}`;
  }

  /**
   * Get timestamp key for a specific chat room
   */
  private getTimestampKey(chatRoomId: string): string {
    return `${MESSAGES_TIMESTAMP_KEY_PREFIX}${chatRoomId}`;
  }

  /**
   * Save messages to cache for a specific chat room
   * Messages are always saved sorted by createdAt (oldest first) to ensure correct order on load
   */
  async saveMessages(chatRoomId: string, messages: Message[]): Promise<void> {
    try {
      // Always sort messages by createdAt (oldest first) before saving
      // This ensures messages are stored in the correct order for display
      const sortedMessages = [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Convert messages to stored format with cache metadata
      const storedMessages: StoredMessage[] = sortedMessages.map(message => ({
        ...message,
        cachedAt: Date.now(),
        version: 1,
      }));

      // Get existing messages and merge (avoid duplicates)
      const existingMessages = await this.getMessages(chatRoomId);
      const messageMap = new Map<string, StoredMessage>();

      // Add existing messages to map
      existingMessages.forEach(msg => {
        messageMap.set(msg.id, {
          ...msg,
          cachedAt: Date.now(),
          version: 1,
        } as StoredMessage);
      });

      // Add/update new messages (newer messages will override older cached versions)
      storedMessages.forEach(msg => {
        messageMap.set(msg.id, msg);
      });

      // Convert back to array and ensure it's sorted by createdAt (oldest first)
      // This is redundant but ensures correctness even if merge logic changes
      const allMessages = Array.from(messageMap.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Save to AsyncStorage
      await AsyncStorage.setItem(this.getMessagesKey(chatRoomId), JSON.stringify(allMessages));
      await AsyncStorage.setItem(this.getTimestampKey(chatRoomId), Date.now().toString());
      
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to save messages:', error);
      throw error;
    }
  }

  /**
   * Get messages from cache for a specific chat room
   */
  async getMessages(chatRoomId: string, limit?: number, offset?: number): Promise<Message[]> {
    try {
      const storedData = await AsyncStorage.getItem(this.getMessagesKey(chatRoomId));
      
      if (!storedData) {
        return [];
      }

      const storedMessages: StoredMessage[] = JSON.parse(storedData);

      // Messages should already be sorted when saved, but sort again to ensure correctness
      // Sort by creation time (oldest first - newest at bottom)
      const sorted = [...storedMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Apply pagination if specified
      // For chat messages, we want the LATEST messages (reverse order)
      let messages = sorted;
      if (limit) {
        // Take the last N messages (most recent)
        messages = messages.slice(-limit);
      }
      if (offset) {
        // Apply offset from the beginning of the limited set
        messages = messages.slice(offset);
      }

      // Convert back to Message format (remove cache metadata)
      const result: Message[] = messages.map(
        ({ cachedAt, version, ...message }) => message
      );
      
      return result;
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to get messages from cache:', error);
      return [];
    }
  }

  /**
   * Check if messages exist in cache for a chat room
   */
  async hasMessages(chatRoomId: string): Promise<boolean> {
    try {
      const storedData = await AsyncStorage.getItem(this.getMessagesKey(chatRoomId));
      if (!storedData) {
        return false;
      }

      const storedMessages: StoredMessage[] = JSON.parse(storedData);
      return storedMessages.length > 0;
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to check messages in cache:', error);
      return false;
    }
  }

  /**
   * Get message count for a chat room
   */
  async getMessageCount(chatRoomId: string): Promise<number> {
    try {
      const storedData = await AsyncStorage.getItem(this.getMessagesKey(chatRoomId));
      if (!storedData) {
        return 0;
      }

      const storedMessages: StoredMessage[] = JSON.parse(storedData);
      return storedMessages.length;
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to get message count:', error);
      return 0;
    }
  }

  /**
   * Check if messages cache is fresh (less than specified minutes old)
   */
  async isMessagesCacheFresh(chatRoomId: string, maxAgeMinutes: number = 5): Promise<boolean> {
    try {
      const timestampStr = await AsyncStorage.getItem(this.getTimestampKey(chatRoomId));
      if (!timestampStr) {
        return false;
      }

      const cachedAt = parseInt(timestampStr, 10);
      const now = Date.now();
      const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds

      const isFresh = now - cachedAt < maxAge;
      return isFresh;
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to check cache freshness:', error);
      return false;
    }
  }

  /**
   * Update a specific message in cache
   */
  async updateMessage(
    messageId: string,
    chatRoomIdOrUpdates: string | Partial<Message>,
    maybeUpdates?: Partial<Message>
  ): Promise<void> {
    try {
      const chatRoomId =
        typeof chatRoomIdOrUpdates === 'string' ? chatRoomIdOrUpdates : undefined;
      const updates =
        typeof chatRoomIdOrUpdates === 'string' ? maybeUpdates : chatRoomIdOrUpdates;

      if (!updates) return;

      const updateInRoom = async (roomId: string) => {
        const currentMessages = await this.getMessages(roomId);
        if (!currentMessages.some((message) => message.id === messageId)) return false;

        const updatedMessages = currentMessages.map((message) =>
          message.id === messageId ? { ...message, ...updates } : message
        );
        await this.saveMessages(roomId, updatedMessages);
        return true;
      };

      if (chatRoomId) {
        await updateInRoom(chatRoomId);
        return;
      }

      const keys = await AsyncStorage.getAllKeys();
      const messageKeys = keys.filter((key) => key.startsWith(MESSAGES_KEY_PREFIX));
      for (const key of messageKeys) {
        const roomId = key.slice(MESSAGES_KEY_PREFIX.length);
        const updated = await updateInRoom(roomId);
        if (updated) break;
      }
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to update message:', error);
      throw error;
    }
  }

  /**
   * Clear messages cache for a specific chat room
   */
  async clearMessages(chatRoomId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.getMessagesKey(chatRoomId));
      await AsyncStorage.removeItem(this.getTimestampKey(chatRoomId));
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to clear messages cache:', error);
      throw error;
    }
  }

  /**
   * Remove a single message from cache for a specific chat room
   */
  async removeMessage(chatRoomId: string, messageId: string): Promise<void> {
    try {
      const currentMessages = await this.getMessages(chatRoomId);
      const updatedMessages = currentMessages.filter((message) => message.id !== messageId);
      await this.saveMessages(chatRoomId, updatedMessages);
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to remove message from cache:', error);
      throw error;
    }
  }

  /**
   * Clear all messages cache
   */
  async clearAllMessages(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messagesKeys = keys.filter(key => 
        key.startsWith(MESSAGES_KEY_PREFIX) || key.startsWith(MESSAGES_TIMESTAMP_KEY_PREFIX)
      );
      await AsyncStorage.multiRemove(messagesKeys);
      console.log('🗑️ [MessagesCache] Cleared all messages cache');
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to clear all messages cache:', error);
      throw error;
    }
  }

  /**
   * Get total cache size in bytes for all messages
   */
  async getCacheSize(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messagesKeys = keys.filter(key => 
        key.startsWith(MESSAGES_KEY_PREFIX) || key.startsWith(MESSAGES_TIMESTAMP_KEY_PREFIX)
      );
      
      if (messagesKeys.length === 0) {
        return 0;
      }

      // Get all message cache data
      const items = await AsyncStorage.multiGet(messagesKeys);
      
      // Calculate total size
      let totalSize = 0;
      for (const [key, value] of items) {
        if (value) {
          // Calculate size in bytes (UTF-8 encoding)
          if (typeof TextEncoder !== 'undefined') {
            const encoder = new TextEncoder();
            totalSize += encoder.encode(value).length;
          } else {
            // Fallback: approximate size
            totalSize += value.length;
          }
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('❌ [MessagesCache] Failed to get cache size:', error);
      return 0;
    }
  }
}

// Create singleton instance
export const messagesCacheService = new MessagesCacheService();
