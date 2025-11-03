import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatRoom } from '@/components/ChatListItem';

/**
 * Chat Cache Service
 * Implements caching for chat rooms using AsyncStorage
 * Similar to IndexedDBChatService in Next.js, but using AsyncStorage for React Native
 */

const CHAT_ROOMS_KEY = '@chat_rooms_cache';
const CHAT_ROOMS_CACHE_TIMESTAMP_KEY = '@chat_rooms_cache_timestamp';

interface StoredChatRoom extends ChatRoom {
  cachedAt: number;
  version: number;
}

class ChatCacheService {
  /**
   * Save chat rooms to cache
   */
  async saveChatRooms(chatRooms: ChatRoom[]): Promise<void> {
    try {
      // Convert chat rooms to stored format with cache metadata
      const storedChatRooms: StoredChatRoom[] = chatRooms.map(chatRoom => ({
        ...chatRoom,
        cachedAt: Date.now(),
        version: 1,
      }));

      // Save to AsyncStorage
      await AsyncStorage.setItem(CHAT_ROOMS_KEY, JSON.stringify(storedChatRooms));
      await AsyncStorage.setItem(CHAT_ROOMS_CACHE_TIMESTAMP_KEY, Date.now().toString());

      console.log(`💾 [ChatCache] Saved ${chatRooms.length} chat rooms to cache`);
    } catch (error) {
      console.error('❌ [ChatCache] Failed to save chat rooms:', error);
      throw error;
    }
  }

  /**
   * Get chat rooms from cache
   */
  async getChatRooms(): Promise<ChatRoom[]> {
    try {
      const storedData = await AsyncStorage.getItem(CHAT_ROOMS_KEY);
      
      if (!storedData) {
        return [];
      }

      const storedChatRooms: StoredChatRoom[] = JSON.parse(storedData);

      // Sort by updated time (newest first)
      storedChatRooms.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      // Convert back to ChatRoom format (remove cache metadata)
      const result: ChatRoom[] = storedChatRooms.map(
        ({ cachedAt, version, ...chatRoom }) => chatRoom
      );

      console.log(`📖 [ChatCache] Loaded ${result.length} chat rooms from cache`);
      return result;
    } catch (error) {
      console.error('❌ [ChatCache] Failed to get chat rooms from cache:', error);
      return [];
    }
  }

  /**
   * Check if chat rooms exist in cache
   */
  async hasChatRooms(): Promise<boolean> {
    try {
      const storedData = await AsyncStorage.getItem(CHAT_ROOMS_KEY);
      if (!storedData) {
        return false;
      }

      const storedChatRooms: StoredChatRoom[] = JSON.parse(storedData);
      return storedChatRooms.length > 0;
    } catch (error) {
      console.error('❌ [ChatCache] Failed to check chat rooms in cache:', error);
      return false;
    }
  }

  /**
   * Check if cache is fresh (less than specified minutes old)
   */
  async isCacheFresh(maxAgeMinutes: number = 5): Promise<boolean> {
    try {
      const timestampStr = await AsyncStorage.getItem(CHAT_ROOMS_CACHE_TIMESTAMP_KEY);
      if (!timestampStr) {
        return false;
      }

      const cachedAt = parseInt(timestampStr, 10);
      const now = Date.now();
      const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds

      const isFresh = now - cachedAt < maxAge;
      console.log(`🕐 [ChatCache] Cache freshness check: ${isFresh ? 'fresh' : 'stale'} (age: ${Math.floor((now - cachedAt) / 60000)} minutes)`);
      return isFresh;
    } catch (error) {
      console.error('❌ [ChatCache] Failed to check cache freshness:', error);
      return false;
    }
  }

  /**
   * Delete a specific chat room from cache
   */
  async deleteChatRoom(chatRoomId: string): Promise<void> {
    try {
      const storedData = await AsyncStorage.getItem(CHAT_ROOMS_KEY);
      if (!storedData) {
        return;
      }

      const storedChatRooms: StoredChatRoom[] = JSON.parse(storedData);
      const filteredRooms = storedChatRooms.filter(
        room => room.id !== chatRoomId
      );

      await AsyncStorage.setItem(CHAT_ROOMS_KEY, JSON.stringify(filteredRooms));
      console.log(`🗑️ [ChatCache] Deleted chat room ${chatRoomId} from cache`);
    } catch (error) {
      console.error('❌ [ChatCache] Failed to delete chat room from cache:', error);
      throw error;
    }
  }

  /**
   * Clear all cached chat rooms
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CHAT_ROOMS_KEY);
      await AsyncStorage.removeItem(CHAT_ROOMS_CACHE_TIMESTAMP_KEY);
      console.log('🗑️ [ChatCache] Cleared chat rooms cache');
    } catch (error) {
      console.error('❌ [ChatCache] Failed to clear cache:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const chatCacheService = new ChatCacheService();

