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
        Alert.alert('Ошибка', 'Файл логов не найден');
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Ошибка', 'Функция "Поделиться" недоступна на этом устройстве');
        return;
      }

      await Sharing.shareAsync(filePath, {
        mimeType: 'text/plain',
        dialogTitle: 'Поделиться логами',
      });
      
      await loadFileSize();
    } catch (error) {
      console.error('[LogsSettings] Failed to share logs:', error);
      Alert.alert('Ошибка', 'Не удалось поделиться файлом логов');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    Alert.alert(
      'Очистить логи',
      'Вы уверены, что хотите очистить все логи?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await fileLogger.clearLogs();
              await loadFileSize();
              Alert.alert('Успешно', 'Логи очищены');
            } catch (error) {
              console.error('[LogsSettings] Failed to clear logs:', error);
              Alert.alert('Ошибка', 'Не удалось очистить логи');
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
      <Text style={styles.title}>Логирование</Text>
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Размер файла логов: {formatFileSize(fileSize)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.shareButton, isLoading && styles.buttonDisabled]}
        onPress={handleShareLogs}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary.white} />
        ) : (
          <Text style={styles.buttonText}>Поделиться логами</Text>
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
          <Text style={styles.buttonText}>Очистить логи</Text>
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

