import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fonts, fp, rem } from '@/lib';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface FilePreviewProps {
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  messageId?: string;
}

export default function FilePreview({ fileUrl, fileName, fileSize }: FilePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const fileExtension = fileName.toLowerCase().split('.').pop();

  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension || '');
  const isPdf = fileExtension === 'pdf';
  const isText = fileExtension === 'txt';

  const handleDownload = async () => {
    try {
      // File name already contains extension, use it as is
      // Clean name from invalid characters for file system
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const localFileName = sanitizedName || 'file';
      
      // Path for saving file
      const fileUri = `${FileSystem.documentDirectory}${localFileName}`;
      
      // Download file
      const downloadResult = await FileSystem.downloadAsync(fileUrl, fileUri);
      
      if (downloadResult.status === 200) {
        // Check if Sharing API is available
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          // Open dialog for saving/opening file
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/octet-stream',
            dialogTitle: `Save ${fileName}`,
          });
        } else {
          // If Sharing is not available, show success message
          Alert.alert(
            'Downloaded',
            `File "${fileName}" has been downloaded successfully.`,
            [{ text: 'OK' }]
          );
        }
      } else {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }
    } catch (error) {
      console.error('Failed to download file:', error);
      Alert.alert(
        'Error',
        'Failed to download file. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const renderPreview = () => {
    if (isLoading && !error) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary.blue} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (isImage) {
      return (
        <Image
          source={{ uri: fileUrl }}
          style={styles.imagePreview}
          resizeMode="contain"
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setError('Failed to load image preview');
          }}
        />
      );
    }

    if (isPdf) {
      return (
        <WebView
          source={{ uri: fileUrl }}
          style={styles.webView}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setError('Failed to load PDF preview');
          }}
          startInLoadingState={true}
          scalesPageToFit={true}
        />
      );
    }

    if (isText) {
      // For text files, we'll show a placeholder since loading text content
      // requires additional fetch logic
      return (
        <View style={styles.textPreviewContainer}>
          <Text style={styles.textPreviewPlaceholder}>
            Text file preview not available. Tap download to view.
          </Text>
        </View>
      );
    }

    // For other file types, show placeholder
    return (
      <View style={styles.placeholderContainer}>
        <Text style={styles.placeholderText}>Preview not available</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Preview Content */}
      <View style={styles.previewContent}>
        {renderPreview()}
      </View>

      {/* Download Button */}
      <TouchableOpacity onPress={handleDownload} style={styles.downloadButton}>
        <Text style={styles.downloadButtonText}>Download</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: rem(400),
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: rem(8),
    overflow: 'hidden',
  },
  previewContent: {
    minHeight: rem(200),
    maxHeight: rem(300),
    backgroundColor: 'rgba(96, 102, 197, 0.05)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: rem(200),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: rem(200),
    padding: rem(16),
  },
  errorText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: '#EF4444',
    textAlign: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    minHeight: rem(200),
    maxHeight: rem(300),
  },
  webView: {
    width: '100%',
    height: rem(300),
  },
  textPreviewContainer: {
    padding: rem(16),
    minHeight: rem(200),
    justifyContent: 'center',
    alignItems: 'center',
  },
  textPreviewPlaceholder: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: rem(200),
    padding: rem(16),
  },
  placeholderText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  downloadButton: {
    backgroundColor: colors.primary.blue,
    paddingVertical: rem(12),
    paddingHorizontal: rem(16),
    alignItems: 'center',
  },
  downloadButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['500'],
    color: colors.neutral.white,
  },
});

