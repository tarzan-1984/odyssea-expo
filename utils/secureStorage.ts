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
        console.log(`💾 [SecureStorage] Saved to AsyncStorage (Web): ${key}`);
      } else {
        // iOS/Android: use SecureStore
        await SecureStore.setItemAsync(key, value);
        console.log(`💾 [SecureStorage] Saved to SecureStore (Native): ${key}`);
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
        console.log(`📖 [SecureStorage] Read from AsyncStorage (Web): ${key} = ${value ? 'found' : 'null'}`);
        return value;
      } else {
        // iOS/Android: use SecureStore
        const value = await SecureStore.getItemAsync(key);
        console.log(`📖 [SecureStorage] Read from SecureStore (Native): ${key} = ${value ? 'found' : 'null'}`);
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
        console.log(`🗑️ [SecureStorage] Deleted from AsyncStorage (Web): ${key}`);
      } else {
        // iOS/Android: use SecureStore
        await SecureStore.deleteItemAsync(key);
        console.log(`🗑️ [SecureStorage] Deleted from SecureStore (Native): ${key}`);
      }
    } catch (error) {
      console.error(`❌ [SecureStorage] Failed to delete ${key}:`, error);
      throw error;
    }
  },
};

