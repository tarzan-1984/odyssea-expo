import * as FileSystem from 'expo-file-system/legacy';
import FileViewer from 'react-native-file-viewer';

/**
 * Opens a remote file by downloading it and opening with system app
 * @param url - Remote URL of the file
 * @param filename - Name of the file (with extension)
 * @returns Promise that resolves when file is opened
 */
export async function openRemoteFile(url: string, filename: string): Promise<void> {
  try {
    // Clean filename from invalid characters
    const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localPath = `${FileSystem.documentDirectory}${sanitizedName}`;

    console.log('[fileOpener] Downloading file from:', url);
    console.log('[fileOpener] Saving to:', localPath);

    // 1️⃣ Download file
    const { uri } = await FileSystem.downloadAsync(url, localPath);
    console.log('[fileOpener] File downloaded to:', uri);

    // 2️⃣ Open file with system app using react-native-file-viewer
    // Works on both Android and iOS, opens file directly in system app
    console.log('[fileOpener] Opening file with FileViewer');
    await FileViewer.open(uri);

    console.log('[fileOpener] File opened successfully');
  } catch (error) {
    console.error('[fileOpener] Failed to open file:', error);
    throw error;
  }
}

/**
 * Opens a local file with system app
 * @param fileUri - Local file URI (file://)
 * @param filename - Name of the file (with extension)
 * @returns Promise that resolves when file is opened
 */
export async function openLocalFile(fileUri: string, filename: string): Promise<void> {
  try {
    console.log('[fileOpener] Opening local file:', fileUri);

    // react-native-file-viewer works on both Android and iOS
    // Opens file directly in system app (Adobe Reader, Microsoft Word, etc.)
    console.log('[fileOpener] Opening file with FileViewer');
    await FileViewer.open(fileUri);

    console.log('[fileOpener] File opened successfully');
  } catch (error) {
    console.error('[fileOpener] Failed to open file:', error);
    throw error;
  }
}
