import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { secureStorage } from '@/utils/secureStorage';
import { uploadChatFilesBatch } from '@/app-api/upload';
import { normalizeUploadMimeType, formatUploadErrorMessage } from '@/utils/mimeTypeUpload';
import { CHAT_IMAGE_PICKER_FAST_OPTIONS } from '@/utils/chatImagePickerOptions';
import {
  beginImageAttachmentFlow,
  cancelImageAttachmentFlow,
  completeDeviceImagePrepareFlow,
  completeDevicePickerExportFlow,
} from '@/utils/chatImageFlowTiming';
import { prepareChatImageForUpload, prepareChatImagesForUpload } from '@/utils/chatImagePrepare';
import { toJpegFilename, logPickerImageResult } from '@/utils/heicUpload';

export interface FileData {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Original asset filename before JPEG rename (e.g. IMG_1234.HEIC). */
  originalName?: string;
  width?: number;
  height?: number;
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

export type AttachmentPickCallbacks = {
  onProcessingChange?: (processing: boolean) => void;
};

/** Lets React paint a processing overlay before a blocking native picker call. */
async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Normalize attachment metadata before upload (HEIC → JPEG on device, server batch fallback). */
export async function normalizeAttachmentForUpload(file: FileData): Promise<FileData> {
	return {
		...file,
		mimeType: normalizeUploadMimeType(file.name, file.mimeType),
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
      originalName: f.originalName,
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
export async function pickFiles(callbacks?: AttachmentPickCallbacks): Promise<FileData[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (result.canceled) return [];
    return (result.assets || []).map((a) => ({
      uri: a.uri,
      name: a.name || 'file',
      mimeType: a.mimeType || undefined,
      size: a.size || undefined,
    }));
  } finally {
    callbacks?.onProcessingChange?.(false);
  }
}

/**
 * Capture a photo using device camera and return as a single-file array.
 */
export async function capturePhoto(
  callbacks?: AttachmentPickCallbacks,
): Promise<FileData[]> {
  beginImageAttachmentFlow('camera');
  callbacks?.onProcessingChange?.(true);
  await yieldToUi();
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission', 'Camera permission is required to take photos.');
      cancelImageAttachmentFlow('canceled');
      return [];
    }
    const pickerStartedAt = Date.now();
    const result = await ImagePicker.launchCameraAsync({
      ...CHAT_IMAGE_PICKER_FAST_OPTIONS,
    });
    if (result.canceled) {
      cancelImageAttachmentFlow('canceled');
      return [];
    }
    const asset = result.assets?.[0];
    if (!asset) {
      cancelImageAttachmentFlow('empty');
      return [];
    }
    const pickerDurationMs = Date.now() - pickerStartedAt;
    const mimeType = asset.mimeType || 'image/jpeg';
    const rawName = asset.fileName || `photo_${Date.now()}.jpg`;
    const filename =
      mimeType === 'image/jpeg' && /\.(heic|heif)$/i.test(rawName)
        ? toJpegFilename(rawName)
        : rawName;
    const rawFile: FileData = {
      uri: asset.uri,
      name: filename,
      mimeType,
      size: asset.fileSize || undefined,
      originalName: rawName !== filename ? rawName : undefined,
    };

    completeDevicePickerExportFlow({
      fileCount: 1,
      fileNames: [rawFile.name],
      exportDurationMs: pickerDurationMs,
      includesGallerySelection: false,
    });

    const prepareStartedAt = Date.now();
    const prepared = await prepareChatImageForUpload({
      ...rawFile,
      width: asset.width,
      height: asset.height,
    });
    completeDeviceImagePrepareFlow({
      fileCount: 1,
      fileNames: [prepared.name],
      prepareDurationMs: Date.now() - prepareStartedAt,
      pickerDurationMs,
    });

    await logPickerImageResult({
      stage: 'Camera',
      originalFilename: rawName,
      originalMimeType: asset.mimeType,
      resultUri: prepared.uri,
      resultFilename: prepared.name,
      resultMimeType: prepared.mimeType,
      sizeBytes: prepared.size,
    });
    return [prepared];
  } catch {
    cancelImageAttachmentFlow('error');
    return [];
  } finally {
    callbacks?.onProcessingChange?.(false);
  }
}

function fileDataFromGalleryAsset(
  asset: ImagePicker.ImagePickerAsset,
  uniqueIndex: number
): FileData {
  const fileName = asset.fileName || (asset as any).filename || '';
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeType = asset.mimeType || (fileExtension ? undefined : 'image/jpeg');
  const isJpegMime = mimeType === 'image/jpeg' || mimeType === 'image/jpg';

  let filename =
    fileName ||
    `photo_${Date.now()}_${uniqueIndex}.${isJpegMime ? 'jpg' : fileExtension || 'jpg'}`;

  // Picker may transcode to JPEG while keeping a .heic filename from the asset.
  if (isJpegMime && /\.(heic|heif)$/i.test(filename)) {
    filename = toJpegFilename(filename);
  }

  return {
    uri: asset.uri,
    name: filename,
    mimeType,
    size: asset.fileSize || undefined,
    originalName:
      fileName && (fileName !== filename || /\.(heic|heif)$/i.test(fileName))
        ? fileName
        : undefined,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Pick photo(s) from device gallery (multi-select when supported by the OS).
 */
export async function pickPhotoFromGallery(
  callbacks?: AttachmentPickCallbacks,
): Promise<FileData[]> {
  beginImageAttachmentFlow('gallery');
  callbacks?.onProcessingChange?.(true);
  await yieldToUi();
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library permission', 'Photo library permission is required to select photos.');
      cancelImageAttachmentFlow('canceled');
      return [];
    }

    let mediaTypes: any;
    const MP: any = (ImagePicker as any).MediaType;
    if (MP && (MP.Images || MP.images || MP.image)) {
      mediaTypes = [MP.Images ?? MP.images ?? MP.image];
    } else if ((ImagePicker as any).MediaTypeOptions) {
      mediaTypes = (ImagePicker as any).MediaTypeOptions.Images;
    } else {
      mediaTypes = ['images'];
    }

    const pickerStartedAt = Date.now();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsMultipleSelection: true,
      selectionLimit: 20,
      ...CHAT_IMAGE_PICKER_FAST_OPTIONS,
    });

    if (result.canceled) {
      cancelImageAttachmentFlow('canceled');
      return [];
    }

    const assets = result.assets || [];
    if (assets.length === 0) {
      cancelImageAttachmentFlow('empty');
      return [];
    }

    const pickerDurationMs = Date.now() - pickerStartedAt;
    const rawFiles = assets.map((asset, i) => fileDataFromGalleryAsset(asset, i));

    completeDevicePickerExportFlow({
      fileCount: rawFiles.length,
      fileNames: rawFiles.map((f) => f.name),
      exportDurationMs: pickerDurationMs,
      includesGallerySelection: true,
    });

    const prepareStartedAt = Date.now();
    const files = await prepareChatImagesForUpload(rawFiles);
    const prepareDurationMs = Date.now() - prepareStartedAt;

    completeDeviceImagePrepareFlow({
      fileCount: files.length,
      fileNames: files.map((f) => f.name),
      prepareDurationMs,
      pickerDurationMs,
    });

    await Promise.all(
      assets.map((asset, i) => {
        const file = files[i];
        const originalFilename =
          asset.fileName || (asset as { filename?: string }).filename || file.name;
        return logPickerImageResult({
          stage: 'Gallery',
          index: i,
          originalFilename,
          originalMimeType: asset.mimeType,
          resultUri: file.uri,
          resultFilename: file.name,
          resultMimeType: file.mimeType,
          sizeBytes: file.size,
        });
      }),
    );

    return files;
  } catch (error) {
    console.error('[chatAttachmentHelpers] Error picking photo from gallery:', error);
    cancelImageAttachmentFlow('error');
    Alert.alert('Error', 'Failed to select photo from gallery. Please try again.');
    return [];
  } finally {
    callbacks?.onProcessingChange?.(false);
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

export function useAttachmentPicker(
  onFilesSelected: (files: FileData[]) => void,
  callbacks?: AttachmentPickCallbacks,
) {
  const handler = useCallback(async () => {
    Alert.alert(
      'Attach',
      'Choose source',
      [
        {
          text: 'Take photo',
          onPress: async () => {
            const files = await capturePhoto(callbacks);
            if (files.length > 0) onFilesSelected(files);
          },
        },
        {
          text: 'Choose from gallery',
          onPress: async () => {
            const files = await pickPhotoFromGallery(callbacks);
            if (files.length > 0) onFilesSelected(files);
          },
        },
        {
          text: 'Pick files',
          onPress: async () => {
            const files = await pickFiles(callbacks);
            if (files.length > 0) onFilesSelected(files);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [callbacks, onFilesSelected]);

  return handler;
}

