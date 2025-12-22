import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const LOG_FILE_NAME = 'odyssea-logs.txt';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LINES = 10000;

let logFilePath: string | null = null;

// Initialize log file path
const getLogFilePath = async (): Promise<string> => {
  if (logFilePath) {
    return logFilePath;
  }
  
  const directory = FileSystem.documentDirectory;
  if (!directory) {
    throw new Error('Document directory not available');
  }
  
  logFilePath = `${directory}${LOG_FILE_NAME}`;
  return logFilePath;
};

// Format log entry
const formatLogEntry = (level: string, tag: string, message: string, data?: any): string => {
  const timestamp = new Date().toISOString();
  const levelStr = String(level).padEnd(5);
  const tagStr = String(tag).padEnd(30);
  let logLine = `[${timestamp}] ${levelStr} [${tagStr}] ${message}`;
  
  if (data !== undefined) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      logLine += ` ${dataStr}`;
    } catch (e) {
      logLine += ` [Failed to stringify data]`;
    }
  }
  
  return logLine + '\n';
};

// Rotate log file if too large
const rotateLogFile = async (): Promise<void> => {
  try {
    const filePath = await getLogFilePath();
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    
    if (fileInfo.exists && fileInfo.size && fileInfo.size > MAX_FILE_SIZE) {
      // Read file and keep only last MAX_LINES
      const content = await FileSystem.readAsStringAsync(filePath);
      const lines = content.split('\n');
      
      if (lines.length > MAX_LINES) {
        const keptLines = lines.slice(-MAX_LINES);
        await FileSystem.writeAsStringAsync(filePath, keptLines.join('\n'));
      }
    }
  } catch (error) {
    console.warn('[FileLogger] Failed to rotate log file:', error);
  }
};

// Write to log file
const writeToFile = async (level: string, tag: string, message: string, data?: any): Promise<void> => {
  try {
    const filePath = await getLogFilePath();
    const logEntry = formatLogEntry(level, tag, message, data);
    
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    
    if (fileInfo.exists) {
      // Append to existing file - need to read first, then append
      const existingContent = await FileSystem.readAsStringAsync(filePath);
      await FileSystem.writeAsStringAsync(filePath, existingContent + logEntry, { encoding: FileSystem.EncodingType.UTF8 });
    } else {
      // Create new file
      await FileSystem.writeAsStringAsync(filePath, logEntry, { encoding: FileSystem.EncodingType.UTF8 });
    }
    
    // Rotate if needed
    await rotateLogFile();
  } catch (error) {
    console.error('[FileLogger] Failed to write to log file:', error);
  }
};

export const fileLogger = {
  error: (tag: string, message: string, data?: any) => {
    console.error(`[${tag}] ${message}`, data);
    writeToFile('ERROR', tag, message, data);
  },
  
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${tag}] ${message}`, data);
    writeToFile('WARN', tag, message, data);
  },
  
  // Get log file path for sharing
  getLogFilePath: async (): Promise<string | null> => {
    try {
      const filePath = await getLogFilePath();
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo.exists ? filePath : null;
    } catch (error) {
      console.error('[FileLogger] Failed to get log file path:', error);
      return null;
    }
  },
  
  // Clear log file
  clearLogs: async (): Promise<void> => {
    try {
      const filePath = await getLogFilePath();
      await FileSystem.deleteAsync(filePath, { idempotent: true });
      logFilePath = null; // Reset cache
    } catch (error) {
      console.error('[FileLogger] Failed to clear log file:', error);
      throw error;
    }
  },
  
  // Get log file size
  getLogFileSize: async (): Promise<number> => {
    try {
      const filePath = await getLogFilePath();
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo.exists && fileInfo.size ? fileInfo.size : 0;
    } catch (error) {
      console.error('[FileLogger] Failed to get log file size:', error);
      return 0;
    }
  },
};

