import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as Sharing from 'expo-sharing';
import { fileLogger } from '@/utils/fileLogger';
import { colors } from '@/lib';
import { rem, fp } from '@/lib';

export default function LogsSettings() {
  const [fileSize, setFileSize] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadFileSize = async () => {
    try {
      const size = await fileLogger.getLogFileSize();
      setFileSize(size);
    } catch (error) {
      console.error('[LogsSettings] Failed to load file size:', error);
    }
  };

  useEffect(() => {
    loadFileSize();
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleShareLogs = async () => {
    setIsLoading(true);
    try {
      const filePath = await fileLogger.getLogFilePath();
      
      if (!filePath) {
        Alert.alert('Error', 'Log file not found');
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      await Sharing.shareAsync(filePath, {
        mimeType: 'text/plain',
        dialogTitle: 'Share logs',
      });
      
      await loadFileSize();
    } catch (error) {
      console.error('[LogsSettings] Failed to share logs:', error);
      Alert.alert('Error', 'Failed to share log file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    Alert.alert(
      'Clear logs',
      'Are you sure you want to clear all logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await fileLogger.clearLogs();
              await loadFileSize();
              Alert.alert('Success', 'Logs cleared');
            } catch (error) {
              console.error('[LogsSettings] Failed to clear logs:', error);
              Alert.alert('Error', 'Failed to clear logs');
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
      <Text style={styles.title}>Logging</Text>
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Log file size: {formatFileSize(fileSize)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.shareButton, isLoading && styles.buttonDisabled]}
        onPress={handleShareLogs}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary.white} />
        ) : (
          <Text style={styles.buttonText}>Share logs</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.clearButton, isLoading && styles.buttonDisabled]}
        onPress={handleClearLogs}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary.white} />
        ) : (
          <Text style={styles.buttonText}>Clear logs</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: rem(20),
  },
  title: {
    fontSize: fp(18),
    fontWeight: 'bold',
    marginBottom: rem(15),
    color: colors.primary.violet,
  },
  infoContainer: {
    marginBottom: rem(15),
    padding: rem(10),
    backgroundColor: colors.primary.white,
    borderRadius: rem(8),
  },
  infoText: {
    fontSize: fp(14),
    color: colors.primary.gray,
  },
  button: {
    padding: rem(15),
    borderRadius: rem(8),
    alignItems: 'center',
    marginBottom: rem(10),
  },
  shareButton: {
    backgroundColor: colors.primary.blue,
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.primary.white,
    fontSize: fp(16),
    fontWeight: '600',
  },
});

