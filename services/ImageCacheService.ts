import * as FileSystem from 'expo-file-system/legacy';

const HEIC_CACHE_DIR = `${FileSystem.documentDirectory}chat-heic-cache/`;

const stableHash = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
};

const getDirectorySize = async (directoryUri: string): Promise<number> => {
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
  if (!directoryInfo.exists) {
    return 0;
  }

  const entries = await FileSystem.readDirectoryAsync(directoryUri);
  let totalSize = 0;

  for (const entry of entries) {
    const entryUri = `${directoryUri}${entry}`;
    const entryInfo = await FileSystem.getInfoAsync(entryUri);
    if (!entryInfo.exists) continue;

    if (entryInfo.isDirectory) {
      totalSize += await getDirectorySize(`${entryUri}/`);
    } else {
      totalSize += entryInfo.size || 0;
    }
  }

  return totalSize;
};

export const imageCacheService = {
  heicQueryKeyPrefix: ['chat-heic-file'] as const,

  getHeicCacheUri(fileUrl: string, fileName: string): string {
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.heic';
    return `${HEIC_CACHE_DIR}${stableHash(fileUrl)}-${sanitizedName}`;
  },

  async ensureHeicCacheDirectory(): Promise<void> {
    const directoryInfo = await FileSystem.getInfoAsync(HEIC_CACHE_DIR);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(HEIC_CACHE_DIR, { intermediates: true });
    }
  },

  async getHeicCacheSize(): Promise<number> {
    return getDirectorySize(HEIC_CACHE_DIR);
  },

  async clearHeicCache(): Promise<void> {
    const directoryInfo = await FileSystem.getInfoAsync(HEIC_CACHE_DIR);
    if (directoryInfo.exists) {
      await FileSystem.deleteAsync(HEIC_CACHE_DIR, { idempotent: true });
    }
  },
};
