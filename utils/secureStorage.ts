import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Secure Storage Wrapper
 * Uses SecureStore for iOS/Android and AsyncStorage for Web
 */

const isWeb = Platform.OS === 'web';

export const secureStorage = {
  /**
   * Save item to secure storage
   */
  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      if (isWeb) {
        // Web: use AsyncStorage (localStorage)
        await AsyncStorage.setItem(key, value);
      } else {
        // iOS/Android: use SecureStore
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error(`❌ [SecureStorage] Failed to save ${key}:`, error);
      throw error;
    }
  },

  /**
   * Get item from secure storage
   */
  async getItemAsync(key: string): Promise<string | null> {
    try {
      if (isWeb) {
        // Web: use AsyncStorage (localStorage)
        const value = await AsyncStorage.getItem(key);
        return value;
      } else {
        // iOS/Android: use SecureStore
        const value = await SecureStore.getItemAsync(key);
        return value;
      }
    } catch (error) {
      console.error(`❌ [SecureStorage] Failed to read ${key}:`, error);
      return null;
    }
  },

  /**
   * Delete item from secure storage
   */
  async deleteItemAsync(key: string): Promise<void> {
    try {
      if (isWeb) {
        // Web: use AsyncStorage (localStorage)
        await AsyncStorage.removeItem(key);
      } else {
        // iOS/Android: use SecureStore
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error(`❌ [SecureStorage] Failed to delete ${key}:`, error);
      throw error;
    }
  },
};

