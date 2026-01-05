import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { secureStorage } from '@/utils/secureStorage';
import { uploadFileViaPresign } from '@/app-api/upload';

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
  status: 'uploading' | 'done' | 'error';
}

/**
 * Pick files with DocumentPicker, upload via presigned URL and send as messages.
 * For images, thumbnails will display automatically via fileUrl in message.
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
  // Derive filename and mime
  const isJpg = (asset.type || 'image') === 'image';
  const filename =
    asset.fileName ||
    `photo_${Date.now()}.${isJpg ? 'jpg' : 'bin'}`;
  const mimeType = asset.mimeType || (isJpg ? 'image/jpeg' : 'application/octet-stream');
  return [
    {
      uri: asset.uri,
      name: filename,
      mimeType,
      size: asset.fileSize || undefined,
    },
  ];
}

/**
 * Pick a photo from device gallery and return as a single-file array.
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
      // New API: use MediaType enum
      mediaTypes = [MP.Images ?? MP.images ?? MP.image];
    } else if ((ImagePicker as any).MediaTypeOptions) {
      // Legacy API: use MediaTypeOptions
      mediaTypes = (ImagePicker as any).MediaTypeOptions.Images;
    } else {
      // Fallback: string array
      mediaTypes = ['images'];
    }

    console.log('[chatAttachmentHelpers] Opening image library with mediaTypes:', mediaTypes);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsMultipleSelection: false,
      quality: 0.9,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) {
      console.log('[chatAttachmentHelpers] User canceled image selection');
      return [];
    }

    const asset = result.assets?.[0];
    if (!asset) {
      console.warn('[chatAttachmentHelpers] No asset returned from image picker');
      return [];
    }

    console.log('[chatAttachmentHelpers] Selected image:', {
      uri: asset.uri?.substring(0, 50) + '...',
      fileName: asset.fileName,
      filename: asset.filename,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      type: asset.type,
    });

    // Derive filename and mime type
    const fileName = asset.fileName || asset.filename || '';
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Map common image extensions to mime types (must match backend allowed types)
    const extensionToMime: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'heic': 'image/heic',
      'heif': 'image/heif',
      'bmp': 'image/bmp',
      'tiff': 'image/tiff',
    };
    
    // List of allowed MIME types on backend (must match s3.service.ts)
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/bmp',
      'image/tiff',
    ];
    
    // Determine mime type: prefer asset.mimeType if it's allowed, otherwise use extension
    let mimeType = asset.mimeType;
    if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
      // Use extension-based mime type if asset.mimeType is missing or not allowed
      mimeType = extensionToMime[fileExtension] || 'image/jpeg';
      console.log('[chatAttachmentHelpers] Using extension-based mimeType:', mimeType, 'for extension:', fileExtension);
    }
    
    // Generate filename if not provided
    const filename = fileName || 
      `photo_${Date.now()}.${fileExtension || (mimeType.includes('jpeg') ? 'jpg' : 'bin')}`;
    
    console.log('[chatAttachmentHelpers] Processed file info:', {
      filename,
      mimeType,
      fileExtension,
      originalFileName: fileName,
    });

    return [
      {
        uri: asset.uri,
        name: filename,
        mimeType,
        size: asset.fileSize || undefined,
      },
    ];
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
  sendMessage: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number }) => Promise<void>;
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { chatRoomId, sendMessage, setUploadQueue, setIsUploading } = params;
  if (!chatRoomId) return;
  const files = await pickFiles();
  if (files.length === 0) return;
  setIsUploading(true);
  // Load token
  const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
  for (const f of files) {
    setUploadQueue((q) => [...q, { name: f.name, mimeType: f.mimeType, size: f.size, status: 'uploading' }]);
    try {
      const fileUrl = await uploadFileViaPresign({
        fileUri: f.uri,
        filename: f.name,
        mimeType: f.mimeType,
        accessToken: token || '',
      });
      await sendMessage('', { fileUrl, fileName: f.name, fileSize: f.size || 0 });
      setUploadQueue((q) => {
        const idx = q.findIndex((x) => x.name === f.name && x.status === 'uploading');
        if (idx === -1) return q;
        const copy = [...q];
        copy[idx] = { ...copy[idx], status: 'done' };
        return copy;
      });
    } catch (e) {
      setUploadQueue((q) => {
        const idx = q.findIndex((x) => x.name === f.name && x.status === 'uploading');
        if (idx === -1) return q;
        const copy = [...q];
        copy[idx] = { ...copy[idx], status: 'error' };
        return copy;
      });
    }
  }
  // Auto-clear items that are done
  setTimeout(() => setUploadQueue([]), 1200);
  setIsUploading(false);
}

/**
 * Hook to handle file upload and send
 */
export function useUploadHandlers(
  chatRoomId: string | undefined,
  sendMessage: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number }) => Promise<void>,
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
  sendMessage: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number }) => Promise<void>;
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
  
  for (const f of files) {
    console.log('[chatAttachmentHelpers] Uploading file:', f.name);
    setUploadQueue((q) => [...q, { name: f.name, mimeType: f.mimeType, size: f.size, status: 'uploading' }]);
    
    try {
      console.log('[chatAttachmentHelpers] Getting presigned URL for:', f.name);
      const fileUrl = await uploadFileViaPresign({
        fileUri: f.uri,
        filename: f.name,
        mimeType: f.mimeType,
        accessToken: token,
      });
      console.log('[chatAttachmentHelpers] File uploaded successfully, URL:', fileUrl?.substring(0, 50) + '...');
      
      console.log('[chatAttachmentHelpers] Sending message with file attachment');
      await sendMessage('', { fileUrl, fileName: f.name, fileSize: f.size || 0 });
      console.log('[chatAttachmentHelpers] Message sent successfully');
      
      setUploadQueue((q) => {
        const idx = q.findIndex((x) => x.name === f.name && x.status === 'uploading');
        if (idx === -1) return q;
        const copy = [...q];
        copy[idx] = { ...copy[idx], status: 'done' };
        return copy;
      });
    } catch (error) {
      console.error('[chatAttachmentHelpers] Error uploading file:', f.name, error);
      if (error instanceof Error) {
        console.error('[chatAttachmentHelpers] Error message:', error.message);
        console.error('[chatAttachmentHelpers] Error stack:', error.stack);
      }
      
      setUploadQueue((q) => {
        const idx = q.findIndex((x) => x.name === f.name && x.status === 'uploading');
        if (idx === -1) return q;
        const copy = [...q];
        copy[idx] = { ...copy[idx], status: 'error' };
        return copy;
      });
      
      Alert.alert('Upload failed', `Failed to upload ${f.name}. Please try again.`);
    }
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
  sendMessage: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number }) => Promise<void>,
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

