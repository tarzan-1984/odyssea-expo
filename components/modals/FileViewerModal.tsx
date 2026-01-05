import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import FileViewer from 'react-native-file-viewer';
import { colors, fonts, fp, rem } from '@/lib';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CloseIcon from '@/icons/CloseIcon';

interface FileViewerModalProps {
  visible: boolean;
  fileUri: string;
  fileName: string;
  originalUrl?: string; // Original URL from server (for PDF, can be used directly)
  onClose: () => void;
}

export default function FileViewerModal({ visible, fileUri, fileName, originalUrl, onClose }: FileViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const ext = fileName.toLowerCase().split('.').pop() || '';
  const isPdf = ext === 'pdf';
  const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
  const isText = ['txt', 'text', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext);
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'].includes(ext);

  // Open file with system app (for PDF and DOC files)
  // react-native-file-viewer works on both Android and iOS
  // Opens file directly in system app without share sheet
  const openWithSystemApp = useCallback(async () => {
    try {
      setIsLoading(true);
      await FileViewer.open(fileUri);
      setIsLoading(false);
      onClose(); // Close modal after opening file
    } catch (error) {
      console.error('[FileViewerModal] Failed to open file with system app:', error);
      setIsLoading(false);
      setError('Failed to open file. Please try using Share.');
    }
  }, [fileUri, onClose]);

  useEffect(() => {
    if (visible && fileUri) {
      setIsLoading(true);
      setError(null);
      setFileContent(null);
      setFileUrl(null);

      // For PDF and DOC files, open with system app immediately
      if (isPdf || isDoc) {
        openWithSystemApp();
        return;
      }

      // For images, use the file URI directly
      if (isImage) {
        // For images, use the file URI directly (Image component handles file:// URIs)
        setFileUrl(fileUri);
        setIsLoading(false);
      } else if (isText) {
        // For text files, read the content
        FileSystem.readAsStringAsync(fileUri)
          .then((content) => {
            setFileContent(content);
            setIsLoading(false);
          })
          .catch((err) => {
            console.error('[FileViewerModal] Failed to read text file:', err);
            setError('Failed to load file content');
            setIsLoading(false);
          });
      } else {
        // For other files, show option to open in another app
        setIsLoading(false);
        setError('This file type cannot be previewed. Please use Share to open it in another app.');
      }
    }
  }, [visible, fileUri, originalUrl, isPdf, isDoc, isImage, isText, openWithSystemApp]);

  const handleShare = async () => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: `Share ${fileName}`,
        });
      } else {
        Alert.alert(
          'Sharing not available',
          'Sharing is not available on this device.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Failed to share file:', error);
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
          
          {!isText && (
            <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <CloseIcon color={colors.primary.blue} width={20} height={20} />
          </TouchableOpacity>
        </View>

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
          ) : isImage && fileUrl ? (
            <ScrollView 
              style={styles.imageContainer} 
              contentContainerStyle={styles.imageContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              <Image
                source={{ uri: fileUrl }}
                style={styles.imagePreview}
                resizeMode="contain"
              />
            </ScrollView>
          ) : isText && fileContent ? (
            <ScrollView style={styles.textContainer} contentContainerStyle={styles.textContent}>
              <Text style={styles.textContentText} selectable>
                {fileContent}
              </Text>
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
  shareButton: {
    paddingVertical: rem(5),
    paddingHorizontal: rem(12),
    backgroundColor: colors.neutral.white,
    borderRadius: 20
  },
  shareButtonText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
  },
  placeholder: {
    width: rem(60),
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
    fontFamily: fonts['400'],
    color: colors.neutral.black,
    lineHeight: rem(20),
  },
});

