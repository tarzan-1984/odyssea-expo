import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, Image } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import { chatApi, ArchiveDay } from '@/app-api/chatApi';
import { Message } from '@/components/ChatListItem';
import FileIcon from '@/icons/FileIcon';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatRoomId: string;
}

interface FileMessage extends Message {
  fileUrl: string;
  fileName: string;
  fileSize: number;
}

export default function FilesModal({ isOpen, onClose, chatRoomId }: FilesModalProps) {
  const [files, setFiles] = useState<FileMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Archive-related state
  const [availableArchives, setAvailableArchives] = useState<ArchiveDay[]>([]);
  const [currentArchiveIndex, setCurrentArchiveIndex] = useState(0);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);
  const [isLoadingFromArchive, setIsLoadingFromArchive] = useState(false);

  // Load files from database API (only messages with fileUrl)
  const loadFilesFromAPI = useCallback(async (pageNum: number, isLoadMore: boolean = false) => {
    if (!chatRoomId) return { fileMessages: [], hasMore: false, total: 0 };

    try {
      // Load files directly from API (already filtered by fileUrl)
      const response = await chatApi.getFiles(chatRoomId, pageNum, 10);
      console.log(`📁 [FilesModal] API response:`, {
        messagesCount: response.messages.length,
        hasMore: response.hasMore,
        total: response.total
      });
      
      // Log first message structure for debugging
      if (response.messages.length > 0) {
        console.log(`📁 [FilesModal] First message structure:`, {
          id: response.messages[0].id,
          fileUrl: response.messages[0].fileUrl,
          fileName: response.messages[0].fileName,
          fileSize: response.messages[0].fileSize,
          hasAllFields: !!(response.messages[0].fileUrl && response.messages[0].fileName && response.messages[0].fileSize)
        });
      }
      
      const fileMessages = response.messages.filter(
        (msg) => msg.fileUrl && msg.fileName && msg.fileSize
      ) as FileMessage[];
      
      console.log(`📁 [FilesModal] Loaded ${fileMessages.length} files from API (page ${pageNum}) after filtering`);
      console.log(`📁 [FilesModal] Total files available: ${response.total}`);

      return { fileMessages, hasMore: response.hasMore, total: response.total };
    } catch (error) {
      console.error('Failed to load files from API:', error);
      return { fileMessages: [], hasMore: false, total: 0 };
    }
  }, [chatRoomId]);

  // Load files from archive
  const loadFilesFromArchive = useCallback(async (archive: ArchiveDay) => {
    if (!chatRoomId) return [];

    try {
      setIsLoadingFromArchive(true);
      
      const archiveFile = await chatApi.loadArchivedMessages(
        chatRoomId,
        archive.year,
        archive.month,
        archive.day
      );

      // Filter only messages with file attachments
      const fileMessages = archiveFile.messages.filter((msg) => 
        msg.fileUrl && msg.fileName && msg.fileSize
      ) as FileMessage[];

      // Sort by creation time (newest first)
      fileMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return fileMessages;
    } catch (error) {
      console.error('Failed to load files from archive:', error);
      return [];
    } finally {
      setIsLoadingFromArchive(false);
    }
  }, [chatRoomId]);

  // Load available archives
  const loadAvailableArchives = useCallback(async () => {
    if (!chatRoomId) return [];

    try {
      setIsLoadingArchives(true);
      const archives = await chatApi.getAvailableArchiveDays(chatRoomId);
      
      // Sort archives by date (newest first)
      archives.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      setAvailableArchives(archives);
      setCurrentArchiveIndex(0);
      return archives;
    } catch (error) {
      console.error('Failed to load available archives:', error);
      return [];
    } finally {
      setIsLoadingArchives(false);
    }
  }, [chatRoomId]);

  const loadMoreFiles = useCallback(async () => {
    if (!isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      
      try {
        // Try to load from database API first (if we still have pages)
        const apiResult = await loadFilesFromAPI(page + 1, true);
        
        if (apiResult.fileMessages.length > 0) {
          // We have files from database
          setFiles(prev => [...prev, ...apiResult.fileMessages]);
          setPage(prev => prev + 1);
          setHasMore(apiResult.hasMore || availableArchives.length > 0);
        } else {
          // No more files from database, try archives
          // Make sure archives are loaded
          let archivesToUse = availableArchives;
          if (archivesToUse.length === 0) {
            const loadedArchives = await loadAvailableArchives();
            if (loadedArchives.length === 0) {
              // No archives available, no more files
              setHasMore(false);
              return;
            }
            archivesToUse = loadedArchives;
          }
          
          if (currentArchiveIndex < archivesToUse.length) {
            const archive = archivesToUse[currentArchiveIndex];
            const archiveFiles = await loadFilesFromArchive(archive);
            
            if (archiveFiles.length > 0) {
              setFiles(prev => [...prev, ...archiveFiles]);
            }
            
            const nextArchiveIndex = currentArchiveIndex + 1;
            setCurrentArchiveIndex(nextArchiveIndex);
            setHasMore(nextArchiveIndex < archivesToUse.length);
          } else {
            // No more files anywhere
            setHasMore(false);
          }
        }
      } catch (error) {
        console.error('Failed to load more files:', error);
        setHasMore(false);
      } finally {
        setIsLoadingMore(false);
      }
    }
  }, [page, isLoadingMore, hasMore, loadFilesFromAPI, availableArchives, currentArchiveIndex, loadFilesFromArchive, loadAvailableArchives]);

  // Handle scroll to load more
  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 100;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
      loadMoreFiles();
    }
  }, [loadMoreFiles]);

  // Load initial files when modal opens
  useEffect(() => {
    if (isOpen && chatRoomId) {
      console.log(`📁 [FilesModal] Opening files modal for chat room: ${chatRoomId}`);
      
      setPage(1);
      setFiles([]);
      setHasMore(true);
      setCurrentArchiveIndex(0);
      setAvailableArchives([]);
      
      // Load files from database first
      const initializeFiles = async () => {
        console.log(`📁 [FilesModal] Initializing files for chat room: ${chatRoomId}`);
        setIsInitialLoading(true);
        
        try {
          // Load files from database API
          const apiResult = await loadFilesFromAPI(1, false);
          console.log(`📁 [FilesModal] Initial load result:`, {
            filesFound: apiResult.fileMessages.length,
            hasMore: apiResult.hasMore,
            total: apiResult.total
          });
          
          console.log(`📁 [FilesModal] Setting files state with ${apiResult.fileMessages.length} files`);
          setFiles(apiResult.fileMessages);
          setHasMore(apiResult.hasMore);
          
          // Load archives in background for future pagination
          loadAvailableArchives();
        } catch (error) {
          console.error(`📁 [FilesModal] Error initializing files:`, error);
        } finally {
          setIsInitialLoading(false);
          console.log(`📁 [FilesModal] Initial loading completed`);
        }
      };
      
      initializeFiles();
    }
  }, [isOpen, chatRoomId, loadAvailableArchives, loadFilesFromAPI]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setPage(1);
      setHasMore(true);
      setCurrentArchiveIndex(0);
      setAvailableArchives([]);
    }
  }, [isOpen]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };


  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Files</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Files List */}
          <ScrollView
            style={styles.filesList}
            contentContainerStyle={styles.filesListContent}
            onScroll={handleScroll}
            scrollEventThrottle={400}
            showsVerticalScrollIndicator={true}
          >
            {isInitialLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary.blue} />
                <Text style={styles.loadingText}>Loading files...</Text>
              </View>
            ) : files.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No files found</Text>
              </View>
            ) : (
              files.map((file, index) => {
                console.log(`📁 [FilesModal] Rendering file ${index}:`, {
                  id: file.id,
                  fileName: file.fileName,
                  fileUrl: file.fileUrl,
                  fileSize: file.fileSize
                });
                
                const name = file.fileName || 'Attachment';
                const ext = name.toLowerCase().split('.').pop() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                
                // Helper function to determine MIME type
                const getMimeType = (extension: string): string => {
                  const mimeTypes: { [key: string]: string } = {
                    pdf: 'application/pdf',
                    doc: 'application/msword',
                    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    xls: 'application/vnd.ms-excel',
                    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    txt: 'text/plain',
                    zip: 'application/zip',
                    rar: 'application/x-rar-compressed',
                  };
                  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
                };
                
                // Download handler
                const handleDownload = async () => {
                  try {
                    const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const localFileName = sanitizedName || 'file';
                    const fileUri = `${FileSystem.documentDirectory}${localFileName}`;
                    
                    const downloadResult = await FileSystem.downloadAsync(file.fileUrl, fileUri);
                    
                    if (downloadResult.status === 200) {
                      const isAvailable = await Sharing.isAvailableAsync();
                      if (isAvailable) {
                        await Sharing.shareAsync(downloadResult.uri, {
                          mimeType: isImage ? 'image/jpeg' : getMimeType(ext),
                          dialogTitle: `Save ${name}`,
                        });
                      }
                    }
                  } catch (error) {
                    console.error('Failed to download file:', error);
                  }
                };
                
                // For images - show only image preview (same as in chat FilePreviewCard)
                if (isImage) {
                  return (
                    <TouchableOpacity
                      key={`${file.id}-${index}`}
                      onPress={handleDownload}
                      activeOpacity={0.9}
                      style={styles.imageCard}
                    >
                      <Image
                        source={{ uri: file.fileUrl }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  );
                }
                
                // For other files - show card with icon, name, size and date (same as in chat FilePreviewCard)
                return (
                  <TouchableOpacity
                    key={`${file.id}-${index}`}
                    onPress={handleDownload}
                    activeOpacity={0.7}
                    style={styles.fileCard}
                  >
                    <View style={styles.fileIconContainer}>
                      <FileIcon width={rem(40)} height={rem(40)} color={colors.primary.blue} />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.fileSize}>
                        {Math.round((file.fileSize || 0) / 1024)}KB • {formatDate(file.createdAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Loading More Indicator */}
            {(isLoadingMore || isLoadingFromArchive) && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary.blue} />
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.closeFooterButton}>
              <Text style={styles.closeFooterButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: rem(600),
    height: SCREEN_HEIGHT * 0.8,
    backgroundColor: colors.neutral.white,
    borderRadius: rem(12),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: rem(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerTitle: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  closeButton: {
    padding: rem(4),
  },
  closeButtonText: {
    fontSize: fp(15),
    color: colors.primary.blue,
  },
  filesList: {
    flex: 1,
    minHeight: 0, // Important for ScrollView to work properly
  },
  filesListContent: {
    padding: rem(12),
  },
  loadingContainer: {
    paddingVertical: rem(40),
    alignItems: 'center',
    gap: rem(12),
  },
  loadingText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    marginTop: rem(12),
  },
  emptyContainer: {
    paddingVertical: rem(40),
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  // Card for images (same as FilePreviewCard)
  imageCard: {
    width: rem(260),
    borderRadius: rem(10),
    overflow: 'hidden',
    marginBottom: rem(12),
    alignSelf: 'flex-start',
  },
  previewImage: {
    width: '100%',
    height: rem(180),
    borderRadius: rem(8),
  },
  // Card for files (not images) - same as FilePreviewCard
  fileCard: {
    width: rem(260),
    flexDirection: 'row',
    alignItems: 'center',
    padding: rem(12),
    borderRadius: rem(10),
    marginBottom: rem(12),
    gap: rem(12),
    backgroundColor: 'rgba(96, 102, 197, 0.08)',
    alignSelf: 'flex-start',
  },
  fileIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: fp(14),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
    marginBottom: rem(4),
  },
  fileSize: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: 'rgba(41, 41, 102, 0.6)',
  },
  loadingMoreContainer: {
    paddingVertical: rem(16),
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: rem(16),
    borderTopWidth: 1,
    borderTopColor: colors.primary.lightBlue,
  },
  closeFooterButton: {
    paddingHorizontal: rem(16),
    paddingVertical: rem(8),
    borderRadius: rem(8),
    backgroundColor: colors.primary.blue,
  },
  closeFooterButtonText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.white,
  },
});

