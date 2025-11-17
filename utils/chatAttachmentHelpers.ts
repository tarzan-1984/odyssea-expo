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
 * Upload photo from camera and send as message
 */
async function uploadPhotoAndSend(params: {
  files: FileData[];
  chatRoomId?: string;
  sendMessage: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number }) => Promise<void>;
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { files, chatRoomId, sendMessage, setUploadQueue, setIsUploading } = params;
  if (files.length === 0) return;
  // Reuse upload flow
  const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
  setIsUploading(true);
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
    } catch {
      setUploadQueue((q) => {
        const idx = q.findIndex((x) => x.name === f.name && x.status === 'uploading');
        if (idx === -1) return q;
        const copy = [...q];
        copy[idx] = { ...copy[idx], status: 'error' };
        return copy;
      });
    }
  }
  setTimeout(() => setUploadQueue([]), 1200);
  setIsUploading(false);
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

