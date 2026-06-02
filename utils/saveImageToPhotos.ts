import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import ReactNativeBlobUtil from 'react-native-blob-util';

export type SaveImageToPhotosResult =
  | 'saved'
  | 'permission_denied'
  | 'native_unavailable'
  | 'failed';

function toFilesystemPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace('file://', ''));
  }
  return uri;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.jpg';
}

export function isPhotoLibrarySaveAvailable(): boolean {
  if (Platform.OS === 'android') {
    return true;
  }
  return requireOptionalNativeModule('ExpoMediaLibrary') != null;
}

/** Saves a local image file to the device photo library (no share sheet). */
export async function saveImageToPhotoLibrary(
  localUri: string,
  fileName: string,
  mimeType: string
): Promise<SaveImageToPhotosResult> {
  if (Platform.OS === 'android') {
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        {
          name: sanitizeFileName(fileName),
          parentFolder: '',
          mimeType,
        },
        'Image',
        toFilesystemPath(localUri)
      );
      return 'saved';
    } catch (error) {
      console.warn('[saveImageToPhotoLibrary] Android save failed:', error);
      return 'failed';
    }
  }

  if (requireOptionalNativeModule('ExpoMediaLibrary') == null) {
    return 'native_unavailable';
  }

  try {
    const MediaLibrary = await import('expo-media-library');
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      return 'permission_denied';
    }
    await MediaLibrary.saveToLibraryAsync(localUri);
    return 'saved';
  } catch (error) {
    console.warn('[saveImageToPhotoLibrary] iOS save failed:', error);
    return 'failed';
  }
}
