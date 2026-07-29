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
import {
  prepareChatImageForUpload,
  prepareChatImageForUploadOrFallback,
  prepareChatImagesForUploadWithMeta,
} from '@/utils/chatImagePrepare';
import { toJpegFilename, logPickerImageResult, logPickerAssetSelected, needsDeviceJpegConversion } from '@/utils/heicUpload';
import { ensureMediaLibraryAccessForPicker } from '@/utils/mediaLibraryPickerAccess';
import {
  createClientDiagFlowId,
  formatPhotoFlowErrorMessage,
  reportClientDiag,
  reportClientError,
} from '@/utils/reportClientError';

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

function uriScheme(uri?: string): string {
  if (!uri) return 'missing';
  const idx = uri.indexOf(':');
  return idx > 0 ? uri.slice(0, idx) : 'unknown';
}

function summarizeFilesForDiag(files: FileData[]): Record<string, unknown> {
  return {
    fileCount: files.length,
    files: files.slice(0, 10).map((f) => ({
      name: f.name,
      originalName: f.originalName,
      mimeType: f.mimeType ?? null,
      size: f.size ?? null,
      scheme: uriScheme(f.uri),
      width: f.width ?? null,
      height: f.height ?? null,
    })),
  };
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
  options?: { flowId?: string },
): Promise<{ fileUrl: string; fileName: string; fileSize: number }[]> {
  if (files.length === 0) return [];

  const flowId = options?.flowId ?? createClientDiagFlowId('up');
  const feature = 'chat_photo_upload';

  await reportClientDiag({
    feature,
    stage: 'upload_batch_start',
    message: `uploadAttachmentFiles start (${files.length})`,
    flowId,
    details: summarizeFilesForDiag(files),
  });

  const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
  if (!token) {
    await reportClientError({
      feature,
      stage: 'missing_token',
      message: 'Authentication required',
      flowId,
      details: summarizeFilesForDiag(files),
    });
    throw new Error('Authentication required');
  }

  const normalized = await Promise.all(
    files.map(async (f) => {
      const withMime = await normalizeAttachmentForUpload(f);
      if (needsDeviceJpegConversion(withMime.name, withMime.mimeType)) {
        try {
          return await prepareChatImageForUpload(withMime);
        } catch (error) {
          console.warn('[chatAttachmentHelpers] Device JPEG prepare failed, using original file:', error);
          await reportClientError({
            feature: 'chat_photo_prepare_fallback',
            stage: 'prepare',
            message: formatPhotoFlowErrorMessage(error),
            error,
            flowId,
            details: {
              filename: withMime.name,
              mimeType: withMime.mimeType,
              uriScheme: uriScheme(withMime.uri),
            },
          });
        }
      }
      return withMime;
    }),
  );

  await reportClientDiag({
    feature,
    stage: 'presign_start',
    message: 'Calling uploadChatFilesBatch (presign + S3)',
    flowId,
    details: summarizeFilesForDiag(normalized),
  });

  normalized.forEach((_, index) => onProgress?.(index, 'uploading'));

  try {
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

    await reportClientDiag({
      feature,
      stage: 'upload_batch_done',
      message: `uploadAttachmentFiles done (${uploaded.length})`,
      flowId,
      details: {
        uploadedCount: uploaded.length,
        fileNames: uploaded.map((u) => u.fileName).slice(0, 10),
      },
    });

    return uploaded.map((item, index) => ({
      fileUrl: item.fileUrl,
      fileName: item.fileName,
      fileSize: item.fileSize || files[index].size || 0,
    }));
  } catch (error) {
    await reportClientError({
      feature,
      stage: 'upload_batch',
      message: formatUploadErrorMessage(error),
      error,
      flowId,
      details: summarizeFilesForDiag(normalized),
    });
    throw error;
  }
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
  options?: { flowId?: string },
): Promise<FileData[]> {
  const flowId = options?.flowId ?? createClientDiagFlowId('cam');
  beginImageAttachmentFlow('camera');
  callbacks?.onProcessingChange?.(true);
  await yieldToUi();

  // Land on backend before native picker so hangs are visible as start-without-finish.
  await reportClientDiag({
    feature: 'chat_photo_camera',
    stage: 'start',
    message: 'Camera flow started',
    flowId,
  });

  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      await reportClientDiag({
        feature: 'chat_photo_camera',
        stage: 'permission_denied',
        message: `Camera permission status=${status}`,
        level: 'warn',
        flowId,
        details: { status },
      });
      Alert.alert('Camera permission', 'Camera permission is required to take photos.');
      cancelImageAttachmentFlow('canceled');
      return [];
    }

    await reportClientDiag({
      feature: 'chat_photo_camera',
      stage: 'picker_launch',
      message: 'Launching camera picker',
      flowId,
    });

    const pickerStartedAt = Date.now();
    const result = await ImagePicker.launchCameraAsync({
      ...CHAT_IMAGE_PICKER_FAST_OPTIONS,
    });
    if (result.canceled) {
      await reportClientDiag({
        feature: 'chat_photo_camera',
        stage: 'canceled',
        message: 'Camera picker canceled by user',
        flowId,
        details: { pickerDurationMs: Date.now() - pickerStartedAt },
      });
      cancelImageAttachmentFlow('canceled');
      return [];
    }
    const asset = result.assets?.[0];
    if (!asset) {
      await reportClientDiag({
        feature: 'chat_photo_camera',
        stage: 'empty',
        message: 'Camera picker returned no assets',
        level: 'warn',
        flowId,
        details: { pickerDurationMs: Date.now() - pickerStartedAt },
      });
      cancelImageAttachmentFlow('empty');
      return [];
    }
    const pickerDurationMs = Date.now() - pickerStartedAt;
    const mimeType = asset.mimeType || 'image/jpeg';
    const rawName = asset.fileName || `photo_${Date.now()}.jpg`;
    const filename =
      mimeType === 'image/jpeg' && /\.(heic|heif|dng)$/i.test(rawName)
        ? toJpegFilename(rawName)
        : rawName;
    const rawFile: FileData = {
      uri: asset.uri,
      name: filename,
      mimeType,
      size: asset.fileSize || undefined,
      originalName: rawName !== filename ? rawName : undefined,
      width: asset.width,
      height: asset.height,
    };

    await reportClientDiag({
      feature: 'chat_photo_camera',
      stage: 'picked',
      message: 'Camera asset selected',
      flowId,
      details: {
        pickerDurationMs,
        ...summarizeFilesForDiag([rawFile]),
      },
    });

    await logPickerAssetSelected({
      stage: 'Camera',
      uri: asset.uri,
      filename,
      mimeType,
      originalFilename: rawName,
      sizeBytes: asset.fileSize || undefined,
      width: asset.width,
      height: asset.height,
    });

    completeDevicePickerExportFlow({
      fileCount: 1,
      fileNames: [rawFile.name],
      exportDurationMs: pickerDurationMs,
      includesGallerySelection: false,
    });

    await reportClientDiag({
      feature: 'chat_photo_camera',
      stage: 'prepare_start',
      message: 'Preparing camera photo for upload',
      flowId,
      details: summarizeFilesForDiag([rawFile]),
    });

    const prepareStartedAt = Date.now();
    const preparedResult = await prepareChatImageForUploadOrFallback({
      ...rawFile,
      width: asset.width,
      height: asset.height,
    });
    const prepared = preparedResult.file;
    const prepareDurationMs = Date.now() - prepareStartedAt;

    if (preparedResult.usedFallback) {
      await reportClientError({
        feature: 'chat_photo_prepare_fallback',
        stage: 'prepare',
        message: preparedResult.error || 'Camera prepare failed, using original',
        flowId,
        details: summarizeFilesForDiag([prepared]),
      });
    }

    completeDeviceImagePrepareFlow({
      fileCount: 1,
      fileNames: [prepared.name],
      prepareDurationMs,
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

    await reportClientDiag({
      feature: 'chat_photo_camera',
      stage: 'prepare_done',
      message: preparedResult.usedFallback
        ? 'Camera photo prepare used fallback original'
        : 'Camera photo prepared',
      flowId,
      details: {
        pickerDurationMs,
        prepareDurationMs,
        usedFallback: preparedResult.usedFallback,
        ...summarizeFilesForDiag([prepared]),
      },
    });
    return [prepared];
  } catch (error) {
    cancelImageAttachmentFlow('error');
    console.error('[chatAttachmentHelpers] capturePhoto failed:', error);
    await reportClientError({
      feature: 'chat_photo_camera',
      stage: 'capture_or_prepare',
      message: formatPhotoFlowErrorMessage(error),
      error,
      flowId,
    });
    Alert.alert('Photo failed', formatPhotoFlowErrorMessage(error));
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

  // Picker may transcode to JPEG while keeping a raw-image filename from the asset.
  if (isJpegMime && /\.(heic|heif|dng)$/i.test(filename)) {
    filename = toJpegFilename(filename);
  }

  return {
    uri: asset.uri,
    name: filename,
    mimeType,
    size: asset.fileSize || undefined,
    originalName:
      fileName && (fileName !== filename || /\.(heic|heif|dng)$/i.test(fileName))
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
  options?: { flowId?: string },
): Promise<FileData[]> {
  const flowId = options?.flowId ?? createClientDiagFlowId('gal');
  beginImageAttachmentFlow('gallery');
  callbacks?.onProcessingChange?.(true);
  await yieldToUi();

  await reportClientDiag({
    feature: 'chat_photo_gallery',
    stage: 'start',
    message: 'Gallery flow started',
    flowId,
  });

  try {
    const hasAccess = await ensureMediaLibraryAccessForPicker();
    if (!hasAccess) {
      await reportClientDiag({
        feature: 'chat_photo_gallery',
        stage: 'permission_denied',
        message: 'Photo library permission denied',
        level: 'warn',
        flowId,
      });
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

    await reportClientDiag({
      feature: 'chat_photo_gallery',
      stage: 'picker_launch',
      message: 'Launching gallery picker',
      flowId,
    });

    const pickerStartedAt = Date.now();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsMultipleSelection: true,
      selectionLimit: 20,
      ...CHAT_IMAGE_PICKER_FAST_OPTIONS,
    });

    if (result.canceled) {
      await reportClientDiag({
        feature: 'chat_photo_gallery',
        stage: 'canceled',
        message: 'Gallery picker canceled by user',
        flowId,
        details: { pickerDurationMs: Date.now() - pickerStartedAt },
      });
      cancelImageAttachmentFlow('canceled');
      return [];
    }

    const assets = result.assets || [];
    if (assets.length === 0) {
      await reportClientDiag({
        feature: 'chat_photo_gallery',
        stage: 'empty',
        message: 'Gallery picker returned no assets',
        level: 'warn',
        flowId,
        details: { pickerDurationMs: Date.now() - pickerStartedAt },
      });
      cancelImageAttachmentFlow('empty');
      return [];
    }

    const pickerDurationMs = Date.now() - pickerStartedAt;
    const rawFiles = assets.map((asset, i) => fileDataFromGalleryAsset(asset, i));

    await reportClientDiag({
      feature: 'chat_photo_gallery',
      stage: 'picked',
      message: `Gallery selected ${rawFiles.length} photo(s)`,
      flowId,
      details: {
        pickerDurationMs,
        ...summarizeFilesForDiag(rawFiles),
      },
    });

    await Promise.all(
      rawFiles.map((file, i) =>
        logPickerAssetSelected({
          stage: 'Gallery',
          index: i,
          uri: file.uri,
          filename: file.name,
          mimeType: file.mimeType,
          originalFilename: file.originalName,
          sizeBytes: file.size,
          width: file.width,
          height: file.height,
        }),
      ),
    );

    completeDevicePickerExportFlow({
      fileCount: rawFiles.length,
      fileNames: rawFiles.map((f) => f.name),
      exportDurationMs: pickerDurationMs,
      includesGallerySelection: true,
    });

    await reportClientDiag({
      feature: 'chat_photo_gallery',
      stage: 'prepare_start',
      message: 'Preparing gallery photos for upload',
      flowId,
      details: summarizeFilesForDiag(rawFiles),
    });

    const prepareStartedAt = Date.now();
    const { files, fallbacks } = await prepareChatImagesForUploadWithMeta(rawFiles);
    const prepareDurationMs = Date.now() - prepareStartedAt;

    if (fallbacks.length > 0) {
      await reportClientError({
        feature: 'chat_photo_prepare_fallback',
        stage: 'prepare',
        message: `${fallbacks.length} gallery photo(s) used prepare fallback`,
        flowId,
        details: {
          fallbacks: fallbacks.slice(0, 10),
          ...summarizeFilesForDiag(files),
        },
      });
    }

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

    await reportClientDiag({
      feature: 'chat_photo_gallery',
      stage: 'prepare_done',
      message: `Gallery photos prepared (${files.length}, fallbacks=${fallbacks.length})`,
      flowId,
      details: {
        pickerDurationMs,
        prepareDurationMs,
        fallbackCount: fallbacks.length,
        ...summarizeFilesForDiag(files),
      },
    });

    return files;
  } catch (error) {
    console.error('[chatAttachmentHelpers] Error picking photo from gallery:', error);
    cancelImageAttachmentFlow('error');
    await reportClientError({
      feature: 'chat_photo_gallery',
      stage: 'pick_or_prepare',
      message: formatPhotoFlowErrorMessage(error),
      error,
      flowId,
    });
    Alert.alert('Photo failed', formatPhotoFlowErrorMessage(error));
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
    console.error('[chatAttachmentHelpers] File upload failed:', error);
    await reportClientError({
      feature: 'chat_file_upload',
      stage: 'upload',
      message: formatUploadErrorMessage(error),
      error,
      flowId: createClientDiagFlowId('file'),
      details: {
        fileCount: files.length,
        fileNames: files.map((f) => f.name).slice(0, 10),
        chatRoomId,
      },
    });
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
  flowId?: string;
  source?: 'camera' | 'gallery';
}) {
  const {
    files,
    chatRoomId,
    sendMessage,
    setUploadQueue,
    setIsUploading,
    source = 'gallery',
  } = params;
  const flowId = params.flowId ?? createClientDiagFlowId('up');
  const feature = 'chat_photo_upload';

  console.log('[chatAttachmentHelpers] uploadPhotoAndSend called with:', {
    filesCount: files.length,
    chatRoomId: chatRoomId || 'missing',
    flowId,
    source,
    files: files.map((f) => ({
      name: f.name,
      uri: f.uri?.substring(0, 50) + '...',
      mimeType: f.mimeType,
      size: f.size,
    })),
  });

  if (files.length === 0) {
    await reportClientDiag({
      feature,
      stage: 'skipped_no_files',
      message: `Upload skipped: no files after ${source}`,
      level: 'warn',
      flowId,
      details: { source, chatRoomId: chatRoomId ?? null },
    });
    console.warn('[chatAttachmentHelpers] No files to upload');
    return;
  }

  if (!chatRoomId) {
    console.error('[chatAttachmentHelpers] chatRoomId is missing, cannot upload');
    await reportClientError({
      feature,
      stage: 'missing_chat_room',
      message: 'Chat room ID is missing',
      flowId,
      details: { source, ...summarizeFilesForDiag(files) },
    });
    Alert.alert('Error', 'Chat room ID is missing. Please try again.');
    return;
  }

  const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
  if (!token) {
    console.error('[chatAttachmentHelpers] Access token not found, cannot upload');
    await reportClientError({
      feature,
      stage: 'missing_token',
      message: 'Access token not found',
      flowId,
      details: { source, chatRoomId, ...summarizeFilesForDiag(files) },
    });
    Alert.alert('Error', 'Authentication required. Please log in again.');
    return;
  }

  await reportClientDiag({
    feature,
    stage: 'upload_start',
    message: `Uploading ${files.length} photo(s) to chat`,
    flowId,
    details: { source, chatRoomId, ...summarizeFilesForDiag(files) },
  });

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
    await reportClientDiag({
      feature,
      stage: 'upload_done',
      message: `Uploaded and sent ${uploaded.length} photo(s)`,
      flowId,
      details: {
        source,
        chatRoomId,
        uploadedCount: uploaded.length,
        fileNames: uploaded.map((u) => u.fileName).slice(0, 10),
      },
    });
  } catch (error) {
    console.error('[chatAttachmentHelpers] Batch upload failed:', error);
    await reportClientError({
      feature,
      stage: 'upload',
      message: formatUploadErrorMessage(error),
      error,
      flowId,
      details: {
        source,
        fileCount: files.length,
        fileNames: files.map((f) => f.name).slice(0, 10),
        mimeTypes: files.map((f) => f.mimeType).slice(0, 10),
        chatRoomId,
      },
    });
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
            const flowId = createClientDiagFlowId('cam');
            await reportClientDiag({
              feature: 'chat_attach',
              stage: 'source_camera',
              message: 'User chose Take photo',
              flowId,
              details: { chatRoomId: chatRoomId ?? null },
            });
            const files = await capturePhoto(undefined, { flowId });
            await uploadPhotoAndSend({
              files,
              chatRoomId,
              sendMessage,
              setUploadQueue,
              setIsUploading,
              flowId,
              source: 'camera',
            });
          },
        },
        {
          text: 'Choose from gallery',
          onPress: async () => {
            const flowId = createClientDiagFlowId('gal');
            await reportClientDiag({
              feature: 'chat_attach',
              stage: 'source_gallery',
              message: 'User chose Choose from gallery',
              flowId,
              details: { chatRoomId: chatRoomId ?? null },
            });
            const files = await pickPhotoFromGallery(undefined, { flowId });
            await uploadPhotoAndSend({
              files,
              chatRoomId,
              sendMessage,
              setUploadQueue,
              setIsUploading,
              flowId,
              source: 'gallery',
            });
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
            const flowId = createClientDiagFlowId('cam');
            await reportClientDiag({
              feature: 'chat_attach',
              stage: 'source_camera',
              message: 'User chose Take photo (picker)',
              flowId,
            });
            const files = await capturePhoto(callbacks, { flowId });
            if (files.length > 0) onFilesSelected(files);
            else {
              await reportClientDiag({
                feature: 'chat_attach',
                stage: 'picker_no_files',
                message: 'Camera returned no files to parent picker',
                level: 'warn',
                flowId,
              });
            }
          },
        },
        {
          text: 'Choose from gallery',
          onPress: async () => {
            const flowId = createClientDiagFlowId('gal');
            await reportClientDiag({
              feature: 'chat_attach',
              stage: 'source_gallery',
              message: 'User chose Choose from gallery (picker)',
              flowId,
            });
            const files = await pickPhotoFromGallery(callbacks, { flowId });
            if (files.length > 0) onFilesSelected(files);
            else {
              await reportClientDiag({
                feature: 'chat_attach',
                stage: 'picker_no_files',
                message: 'Gallery returned no files to parent picker',
                level: 'warn',
                flowId,
              });
            }
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

