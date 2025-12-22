import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_STORAGE_KEY = '@odyssea_app_settings';

export interface AppSettings {
  automaticLocationSharing: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  automaticLocationSharing: true, // Active by default
};

export const useAppSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from storage
  const loadSettings = useCallback(async () => {
    try {
      // Check if this is first launch (settings should already be cleared in final-verify.tsx)
      const firstLaunch = await AsyncStorage.getItem('@app_first_launch');
      
      // If first launch, settings should already be cleared, but ensure defaults
      if (!firstLaunch) {
        // First launch - use defaults (settings were cleared in final-verify.tsx)
        console.log('[useAppSettings] First launch detected, using default settings');
        await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
        setSettings(DEFAULT_SETTINGS);
        setIsLoading(false);
        return;
      }
      
      // Not first launch - load saved settings
      const storedSettings = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsedSettings });
      } else {
        // Save default settings if they don't exist
        await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('❌ [useAppSettings] Failed to load settings:', error);
      // Use default settings on error
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save settings to storage
  const saveSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updatedSettings));
      setSettings(updatedSettings);
    } catch (error) {
      console.error('❌ [useAppSettings] Failed to save settings:', error);
    }
  }, [settings]);

  // Update automatic location sharing
  const setAutomaticLocationSharing = useCallback(
    async (enabled: boolean) => {
      await saveSettings({ automaticLocationSharing: enabled });
    },
    [saveSettings]
  );

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    isLoading,
    automaticLocationSharing: settings.automaticLocationSharing,
    setAutomaticLocationSharing,
    updateSettings: saveSettings,
  };
};

