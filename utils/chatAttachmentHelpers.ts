import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { secureStorage } from '@/utils/secureStorage';
import { uploadChatFilesBatch } from '@/app-api/upload';
import { ensureHeicUploadMetadata } from '@/utils/heicUpload';
import { formatUploadErrorMessage } from '@/utils/mimeTypeUpload';

export interface FileData {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface UploadQueueItem {
  name: string;
  mimeType?: string;
  size?: number;
  status: 'selected' | 'uploading' | 'done' | 'error';
}

export type ChatSendFileAttachment = { fileUrl: string; fileName: string; fileSize?: number };

/** Matches useChatRoom.sendMessage (2+ files → one message via attachments). */
export type ChatSendMessageFn = (
  content: string,
  fileData?: { fileUrl: string; fileName: string; fileSize: number },
  replyData?: unknown,
  attachments?: ChatSendFileAttachment[],
) => Promise<void>;

/** Normalize iOS gallery/camera metadata so HEIC uploads use the correct name and MIME. */
export async function normalizeAttachmentForUpload(file: FileData): Promise<FileData> {
  const meta = await ensureHeicUploadMetadata({
    fileUri: file.uri,
    filename: file.name,
    mimeType: file.mimeType,
  });
  return {
    ...file,
    name: meta.filename,
    mimeType: meta.mimeType,
  };
}

export async function uploadAttachmentFile(file: FileData): Promise<{ fileUrl: string; fileName: string; fileSize: number }> {
  const [uploaded] = await uploadAttachmentFiles([file]);
  return uploaded;
}

export type UploadProgressCallback = (index: number, status: UploadQueueItem['status']) => void;

/** Upload multiple attachments in one presign-batch + parallel S3 PUT flow. */
export async function uploadAttachmentFiles(
  files: FileData[],
  onProgress?: UploadProgressCallback,
): Promise<{ fileUrl: string; fileName: string; fileSize: number }[]> {
  if (files.length === 0) return [];

  const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
  if (!token) {
    throw new Error('Authentication required');
  }

  const normalized = await Promise.all(files.map((f) => normalizeAttachmentForUpload(f)));
  normalized.forEach((_, index) => onProgress?.(index, 'uploading'));

  const uploaded = await uploadChatFilesBatch({
    files: normalized.map((f) => ({
      fileUri: f.uri,
      filename: f.name,
      mimeType: f.mimeType,
    })),
    accessToken: token,
    onFileComplete: (index, success) => {
      onProgress?.(index, success ? 'done' : 'error');
    },
  });

  return uploaded.map((item, index) => ({
    fileUrl: item.fileUrl,
    fileName: item.fileName,
    fileSize: item.fileSize || files[index].size || 0,
  }));
}

async function sendUploadedAttachments(
  uploaded: ChatSendFileAttachment[],
  sendMessage: ChatSendMessageFn,
): Promise<void> {
  if (uploaded.length >= 2) {
    await sendMessage('', undefined, undefined, uploaded);
  } else if (uploaded.length === 1) {
    const one = uploaded[0];
    await sendMessage('', {
      fileUrl: one.fileUrl,
      fileName: one.fileName,
      fileSize: one.fileSize ?? 0,
    });
  }
}

/**
 * Pick files with DocumentPicker.
 */
export async function pickFiles(): Promise<FileData[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (result.canceled) return [];
  const files = (result.assets || []).map((a) => ({
    uri: a.uri,
    name: a.name || 'file',
    mimeType: a.mimeType || undefined,
    size: a.size || undefined,
  }));
  return files;
}

/**
 * Capture a photo using device camera and return as a single-file array.
 */
export async function capturePhoto(): Promise<FileData[]> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Camera permission', 'Camera permission is required to take photos.');
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    allowsEditing: false,
    exif: false,
  });
  if (result.canceled) return [];
  const asset = result.assets?.[0];
  if (!asset) return [];
  const filename = asset.fileName || `photo_${Date.now()}.jpg`;
  const mimeType = asset.mimeType || 'image/jpeg';
  const file: FileData = {
    uri: asset.uri,
    name: filename,
    mimeType,
    size: asset.fileSize || undefined,
  };
  return [await normalizeAttachmentForUpload(file)];
}

function fileDataFromGalleryAsset(
  asset: ImagePicker.ImagePickerAsset,
  uniqueIndex: number
): FileData {
  const fileName = asset.fileName || (asset as any).filename || '';
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  const fallbackExt = fileExtension || 'jpg';
  const filename =
    fileName ||
    `photo_${Date.now()}_${uniqueIndex}.${fallbackExt}`;
  const mimeType = asset.mimeType || (fileExtension ? undefined : 'image/jpeg');

  return {
    uri: asset.uri,
    name: filename,
    mimeType,
    size: asset.fileSize || undefined,
  };
}

/**
 * Pick photo(s) from device gallery (multi-select when supported by the OS).
 */
export async function pickPhotoFromGallery(): Promise<FileData[]> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library permission', 'Photo library permission is required to select photos.');
      return [];
    }

    // Cross-version support for API (legacy MediaTypeOptions vs new MediaType)
    let mediaTypes: any;
    const MP: any = (ImagePicker as any).MediaType;
    if (MP && (MP.Images || MP.images || MP.image)) {
      mediaTypes = [MP.Images ?? MP.images ?? MP.image];
    } else if ((ImagePicker as any).MediaTypeOptions) {
      mediaTypes = (ImagePicker as any).MediaTypeOptions.Images;
    } else {
      mediaTypes = ['images'];
    }

    console.log('[chatAttachmentHelpers] Opening image library with mediaTypes:', mediaTypes);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.9,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) {
      console.log('[chatAttachmentHelpers] User canceled image selection');
      return [];
    }

    const assets = result.assets || [];
    if (assets.length === 0) {
      console.warn('[chatAttachmentHelpers] No assets returned from image picker');
      return [];
    }

    const files = await Promise.all(
      assets.map(async (asset, i) =>
        normalizeAttachmentForUpload(fileDataFromGalleryAsset(asset, i))
      )
    );
    return files;
  } catch (error) {
    console.error('[chatAttachmentHelpers] Error picking photo from gallery:', error);
    Alert.alert('Error', 'Failed to select photo from gallery. Please try again.');
    return [];
  }
}

/**
 * Upload files and send them as messages
 */
export async function handleUploadAndSend(params: {
  chatRoomId?: string;
  sendMessage: ChatSendMessageFn;
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { chatRoomId, sendMessage, setUploadQueue, setIsUploading } = params;
  if (!chatRoomId) return;
  const files = await pickFiles();
  if (files.length === 0) return;
  setIsUploading(true);
  setUploadQueue(
    files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      status: 'uploading' as const,
    })),
  );

  try {
    const uploaded = await uploadAttachmentFiles(files, (index, status) => {
      setUploadQueue((q) => q.map((item, i) => (i === index ? { ...item, status } : item)));
    });
    await sendUploadedAttachments(uploaded, sendMessage);
  } catch (error) {
    Alert.alert('Upload failed', formatUploadErrorMessage(error));
  }

  setTimeout(() => setUploadQueue([]), 1200);
  setIsUploading(false);
}

/**
 * Hook to handle file upload and send
 */
export function useUploadHandlers(
  chatRoomId: string | undefined,
  sendMessage: ChatSendMessageFn,
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>,
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>
) {
  const handler = useCallback(async () => {
    await handleUploadAndSend({ chatRoomId, sendMessage, setUploadQueue, setIsUploading });
  }, [chatRoomId, sendMessage, setUploadQueue, setIsUploading]);
  return handler;
}

/**
 * Upload photo from camera or gallery and send as message
 */
async function uploadPhotoAndSend(params: {
  files: FileData[];
  chatRoomId?: string;
  sendMessage: ChatSendMessageFn;
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { files, chatRoomId, sendMessage, setUploadQueue, setIsUploading } = params;
  
  console.log('[chatAttachmentHelpers] uploadPhotoAndSend called with:', {
    filesCount: files.length,
    chatRoomId: chatRoomId || 'missing',
    files: files.map(f => ({ name: f.name, uri: f.uri?.substring(0, 50) + '...', mimeType: f.mimeType, size: f.size })),
  });
  
  if (files.length === 0) {
    console.warn('[chatAttachmentHelpers] No files to upload');
    return;
  }
  
  if (!chatRoomId) {
    console.error('[chatAttachmentHelpers] chatRoomId is missing, cannot upload');
    Alert.alert('Error', 'Chat room ID is missing. Please try again.');
    return;
  }
  
  // Reuse upload flow
  const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
  if (!token) {
    console.error('[chatAttachmentHelpers] Access token not found, cannot upload');
    Alert.alert('Error', 'Authentication required. Please log in again.');
    return;
  }
  
  setIsUploading(true);
  setUploadQueue(
    files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      status: 'uploading' as const,
    })),
  );

  try {
    const uploaded = await uploadAttachmentFiles(files, (index, status) => {
      setUploadQueue((q) => q.map((item, i) => (i === index ? { ...item, status } : item)));
    });
    await sendUploadedAttachments(uploaded, sendMessage);
  } catch (error) {
    console.error('[chatAttachmentHelpers] Batch upload failed:', error);
    Alert.alert('Upload failed', formatUploadErrorMessage(error));
  }

  setTimeout(() => setUploadQueue([]), 1200);
  setIsUploading(false);
  console.log('[chatAttachmentHelpers] uploadPhotoAndSend completed');
}

/**
 * Attachment entrypoint with options (camera or files)
 */
export function useAttachmentHandler(
  chatRoomId: string | undefined,
  sendMessage: ChatSendMessageFn,
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>,
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>
) {
  const handlePickAndSendFiles = useUploadHandlers(chatRoomId, sendMessage, setUploadQueue, setIsUploading);
  const handler = useCallback(async () => {
    Alert.alert(
      'Attach',
      'Choose source',
      [
        {
          text: 'Take photo',
          onPress: async () => {
            const files = await capturePhoto();
            await uploadPhotoAndSend({ files, chatRoomId, sendMessage, setUploadQueue, setIsUploading });
          },
        },
        {
          text: 'Choose from gallery',
          onPress: async () => {
            const files = await pickPhotoFromGallery();
            await uploadPhotoAndSend({ files, chatRoomId, sendMessage, setUploadQueue, setIsUploading });
          },
        },
        {
          text: 'Pick files',
          onPress: () => handlePickAndSendFiles(),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [chatRoomId, handlePickAndSendFiles, sendMessage, setUploadQueue, setIsUploading]);
  return handler;
}

export function useAttachmentPicker(onFilesSelected: (files: FileData[]) => void) {
  const handler = useCallback(async () => {
    Alert.alert(
      'Attach',
      'Choose source',
      [
        {
          text: 'Take photo',
          onPress: async () => {
            const files = await capturePhoto();
            if (files.length > 0) onFilesSelected(files);
          },
        },
        {
          text: 'Choose from gallery',
          onPress: async () => {
            const files = await pickPhotoFromGallery();
            if (files.length > 0) onFilesSelected(files);
          },
        },
        {
          text: 'Pick files',
          onPress: async () => {
            const files = await pickFiles();
            if (files.length > 0) onFilesSelected(files);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [onFilesSelected]);

  return handler;
}

