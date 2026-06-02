import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import Pdf from 'react-native-pdf';
import FileViewer from 'react-native-file-viewer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors, fonts, fp, rem } from '@/lib';
import { saveImageToPhotoLibrary } from '@/utils/saveImageToPhotos';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CloseIcon from '@/icons/CloseIcon';
import RotateCcwIcon from '@/icons/RotateCcwIcon';
import RotateCwIcon from '@/icons/RotateCwIcon';

interface FileViewerModalProps {
  visible: boolean;
  fileUri: string;
  fileName: string;
  originalUrl?: string; // Original URL from server (for PDF, can be used directly)
  onClose: () => void;
}

const SHARE_CACHE_DIR = `${FileSystem.cacheDirectory}chat-share-cache/`;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** expo-sharing requires a local file:// URI; remote https URLs must be downloaded first. */
async function resolveLocalFileUriForShare(
  fileUri: string,
  fileName: string,
  originalUrl?: string
): Promise<string> {
  if (fileUri.startsWith('file://')) {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) return fileUri;
  }

  const remoteUrl =
    fileUri.startsWith('http://') || fileUri.startsWith('https://')
      ? fileUri
      : originalUrl;

  if (!remoteUrl?.startsWith('http')) {
    throw new Error('File is not available locally and has no remote URL');
  }

  const dirInfo = await FileSystem.getInfoAsync(SHARE_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(SHARE_CACHE_DIR, { intermediates: true });
  }

  const localPath = `${SHARE_CACHE_DIR}${stableHash(remoteUrl)}-${sanitizeFileName(fileName)}`;
  const existing = await FileSystem.getInfoAsync(localPath);
  if (existing.exists) return localPath;

  const downloadResult = await FileSystem.downloadAsync(remoteUrl, localPath);
  if (downloadResult.status !== 200) {
    throw new Error(`Download failed with status ${downloadResult.status}`);
  }
  return downloadResult.uri;
}

export default function FileViewerModal({ visible, fileUri, fileName, originalUrl, onClose }: FileViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingFileAction, setPendingFileAction] = useState<'share' | 'download' | null>(null);
  const [imageRotationDeg, setImageRotationDeg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const loadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const ext = fileName.toLowerCase().split('.').pop() || '';
  const isPdf = ext === 'pdf';
  const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
  const isText = ['txt', 'text', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext);
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'].includes(ext);

  // Helper function to get MIME type
  const getMimeType = (extension: string): string => {
    const mimeTypes: { [key: string]: string } = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  };

  useEffect(() => {
    if (visible && fileUri) {
      console.log('[FileViewerModal] Opening file:', {
        fileName,
        fileUri: fileUri.substring(0, 100),
        originalUrl: originalUrl?.substring(0, 100),
        ext,
        isPdf,
        isDoc,
        isText,
        isImage,
      });
      
      setIsLoading(true);
      setError(null);
      setFileContent(null);
      setFileUrl(null);

      // For images, use the file URI directly
      if (isImage) {
        // For images, use the file URI directly (Image component handles file:// URIs)
        setFileUrl(fileUri);
        setIsLoading(false);
        } else if (isPdf) {
        // For PDF, use react-native-pdf to display inside modal
        if (fileUri && fileUri.startsWith('file://')) {
          // Local file is ready, use it directly
          console.log('[FileViewerModal] PDF file is ready, will display in modal:', fileUri);
          setFileUrl(fileUri);
          setIsLoading(false);
        } else if (originalUrl) {
          // Use remote URL directly (react-native-pdf supports both file:// and http://)
          console.log('[FileViewerModal] Using remote PDF URL:', originalUrl);
          setFileUrl(originalUrl);
          setIsLoading(false);
        } else {
          // No file and no URL
          console.error('[FileViewerModal] No file URI or original URL provided');
          setIsLoading(false);
          setError('Failed to load PDF. Please use Download to save the file.');
        }
      } else if (isDoc || isText) {
        // DOC/DOCX and TXT files should not be opened in this modal
        // They should be opened via system app from FilePreviewCard
        console.warn('[FileViewerModal] DOC/DOCX or TXT file opened in modal - this should not happen');
        setIsLoading(false);
        setError('This file type should be opened via system app. Please close and use Open or Share options.');
      } else {
        // For other files, show option to open in another app
        setIsLoading(false);
        setError('This file type cannot be previewed. Please use Share to open it in another app.');
      }
    }

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [visible, fileUri, originalUrl, isPdf, isDoc, isImage, isText]);

  useEffect(() => {
    if (!visible) {
      setPendingFileAction(null);
      setImageRotationDeg(0);
    }
  }, [visible]);

  useEffect(() => {
    setImageRotationDeg(0);
  }, [fileUri, fileName]);

  const shareLocalFile = async (localUri: string, dialogTitle: string) => {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert(
        'Sharing not available',
        'Sharing is not available on this device.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Hide loader before the native sheet opens (shareAsync resolves only after dismiss).
    setPendingFileAction(null);
    await Sharing.shareAsync(localUri, {
      mimeType: getMimeType(ext),
      dialogTitle,
    });
  };

  const openShareSheet = async (dialogTitle: string) => {
    const localUri = await resolveLocalFileUriForShare(fileUri, fileName, originalUrl);
    await shareLocalFile(localUri, dialogTitle);
  };

  const handleShare = async () => {
    if (pendingFileAction) return;
    try {
      setPendingFileAction('share');
      await openShareSheet(`Share ${fileName}`);
    } catch (shareError) {
      console.error('Failed to share file:', shareError);
      Alert.alert('Error', 'Failed to share file. Please try again.');
      setPendingFileAction(null);
    }
  };

  const saveImageToGallery = async () => {
    const localUri = await resolveLocalFileUriForShare(fileUri, fileName, originalUrl);
    const result = await saveImageToPhotoLibrary(localUri, fileName, getMimeType(ext));
    setPendingFileAction(null);

    if (result === 'saved') {
      Alert.alert('Saved', 'Image saved to your photo library.');
      return;
    }
    if (result === 'permission_denied') {
      Alert.alert(
        'Permission required',
        'Allow access to your photo library to save images.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (result === 'native_unavailable') {
      Alert.alert(
        'Native module missing',
        'Run in project folder: cd ios && pod install — then rebuild in Xcode (Product → Clean Build Folder, then Run).',
        [{ text: 'OK' }]
      );
      return;
    }
    Alert.alert('Error', 'Failed to save image. Please try again.');
  };

  const handleDownload = async () => {
    if (pendingFileAction) return;
    try {
      setPendingFileAction('download');
      if (isImage) {
        await saveImageToGallery();
      } else {
        await openShareSheet(`Save ${fileName}`);
      }
    } catch (downloadError) {
      console.error('Failed to download file:', downloadError);
      Alert.alert('Error', 'Failed to download file. Please try again.');
      setPendingFileAction(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header]}>
          <Text style={styles.title} numberOfLines={1}>
            {fileName}
          </Text>
          
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              onPress={handleDownload}
              style={styles.downloadButton}
              disabled={pendingFileAction !== null}
            >
              {pendingFileAction === 'download' ? (
                <ActivityIndicator size="small" color={colors.primary.blue} />
              ) : (
                <Text style={styles.downloadButtonText}>Download</Text>
              )}
            </TouchableOpacity>
            
            {!isText && (
              <TouchableOpacity
                onPress={handleShare}
                style={styles.shareButton}
                disabled={pendingFileAction !== null}
              >
                {pendingFileAction === 'share' ? (
                  <ActivityIndicator size="small" color={colors.primary.blue} />
                ) : (
                  <Text style={styles.shareButtonText}>Share</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <CloseIcon color={colors.primary.blue} width={20} height={20} />
          </TouchableOpacity>
        </View>

        {isImage && fileUrl && !isLoading && !error ? (
          <View style={styles.imageToolbar}>
            <TouchableOpacity
              style={styles.imageToolbarButton}
              activeOpacity={0.85}
              accessibilityLabel="Rotate image counter-clockwise"
              onPress={() => setImageRotationDeg((d) => ((d - 90) % 360 + 360) % 360)}
            >
              <RotateCcwIcon width={rem(16)} height={rem(16)} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.imageToolbarButton}
              activeOpacity={0.85}
              accessibilityLabel="Rotate image clockwise"
              onPress={() => setImageRotationDeg((d) => (d + 90) % 360)}
            >
              <RotateCwIcon width={rem(16)} height={rem(16)} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Content */}
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary.blue} />
              <Text style={styles.loadingText}>Loading file...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              {!isText && (
                <TouchableOpacity onPress={handleShare} style={styles.shareButtonLarge}>
                  <Text style={styles.shareButtonText}>Share File</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isPdf && fileUrl ? (
            // PDF displayed using react-native-pdf
            <Pdf
              source={{ uri: fileUrl, cache: true }}
              onLoadComplete={(numberOfPages) => {
                console.log('[FileViewerModal] PDF loaded successfully, pages:', numberOfPages);
                setIsLoading(false);
              }}
              onPageChanged={(page, numberOfPages) => {
                console.log('[FileViewerModal] PDF page changed:', page, 'of', numberOfPages);
              }}
              onError={(error) => {
                console.error('[FileViewerModal] PDF error:', error);
                setIsLoading(false);
                setError('Failed to load PDF. Please try using Download or Share.');
              }}
              onLoadProgress={(percent) => {
                console.log('[FileViewerModal] PDF loading progress:', percent);
                if (percent === 100) {
                  setIsLoading(false);
                }
              }}
              style={styles.pdf}
              enablePaging={true}
              horizontal={false}
              spacing={10}
              page={1}
              scale={1.0}
              minScale={0.5}
              maxScale={3.0}
              fitPolicy={0} // 0 = width, 1 = height, 2 = both
              enableRTL={false}
              enableAnnotationRendering={true}
              enableAntialiasing={true}
              singlePage={false}
              trustAllCerts={false}
            />
          ) : isImage && fileUrl ? (
            <ScrollView
              style={styles.imageContainer}
              contentContainerStyle={styles.imageContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              <View
                style={[
                  styles.imageRotatedWrap,
                  { transform: [{ rotate: `${imageRotationDeg}deg` }] },
                ]}
              >
                <Image
                  source={{ uri: fileUrl }}
                  style={styles.imagePreview}
                  resizeMode="contain"
                />
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    backgroundColor: colors.primary.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(12),
    paddingVertical: rem(20),
    gap: rem(10),
  },
  closeButton: {
    paddingVertical: rem(5),
    paddingHorizontal: rem(5),
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
  },
  downloadButton: {
    paddingVertical: rem(5),
    paddingHorizontal: rem(12),
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
  },
  downloadButtonText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  shareButton: {
    paddingVertical: rem(5),
    paddingHorizontal: rem(12),
    backgroundColor: colors.neutral.white,
    borderRadius: 20,
  },
  shareButtonText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  placeholder: {
    width: rem(60),
  },
  imageToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(10),
    paddingVertical: rem(12),
    paddingHorizontal: rem(16),
    backgroundColor: colors.neutral.black,
  },
  imageToolbarButton: {
    width: rem(32),
    height: rem(32),
    borderRadius: rem(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: rem(16),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  errorText: {
    fontSize: fp(16),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
    marginBottom: rem(24),
  },
  shareButtonLarge: {
    backgroundColor: colors.primary.blue,
    paddingHorizontal: rem(24),
    paddingVertical: rem(12),
    borderRadius: rem(8),
  },
  webView: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  imageContainer: {
    flex: 1,
    backgroundColor: colors.neutral.black,
  },
  imageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
  },
  imageRotatedWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    minHeight: 400,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    minHeight: 400,
  },
  textContainer: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  textContent: {
    padding: rem(16),
  },
  textContentText: {
    fontSize: fp(14),
    fontFamily: 'monospace', // Use monospace font like Next.js <pre> tag
    color: colors.neutral.black,
    lineHeight: rem(20),
    // React Native Text component automatically preserves line breaks (\n)
  },
  pdf: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.neutral.white,
  },
  pdfContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rem(24),
  },
  pdfMessage: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.black,
    textAlign: 'center',
    marginBottom: rem(12),
  },
  pdfSubMessage: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
});

