import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Keyboard, Animated, Easing } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fonts, fp, rem } from '@/lib';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatRoom, Message } from '@/components/ChatListItem';
import { useAuth } from '@/context/AuthContext';
import { useChatRoom } from '@/hooks/useChatRoom';
import { useWebSocket } from '@/context/WebSocketContext';
import ArrowLeft from '@/icons/ArrowLeft';
import SmileIcon from '@/icons/SmileIcon';
import AttachmentIcon from '@/icons/AttachmentIcon';
import SendIcon from '@/icons/SendIcon';
import EmojiPicker from '@/components/EmojiPicker';
import MessageItem from '@/components/MessageItem';
import ChatHeaderDropdown from '@/components/ChatHeaderDropdown';
import { setActiveChatRoomId } from '@/services/ActiveChatService';
import { useAttachmentHandler } from '@/utils/chatAttachmentHelpers';

/**
 * Chat Room Screen
 * Displays a specific chat room with messages and participants
 * Uses the same logic as Next.js ChatBox component for loading messages
 */
export default function ChatRoomScreen() {
  const { chatRoomId } = useLocalSearchParams<{ chatRoomId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [sendSectionHeight, setSendSectionHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [flexToggle, setFlexToggle] = useState(false);
  
  // Message input state
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{name: string; mimeType?: string; size?: number; status: 'uploading'|'done'|'error'}>>([]);
  
  // Use useChatRoom hook for loading chat room and messages with caching (same logic as Next.js)
  const {
    chatRoom,
    messages,
    isLoadingChatRoom,
    isLoadingMessages,
    error,
    loadMoreMessages,
    sendMessage,
    isSendingMessage,
  } = useChatRoom(chatRoomId);
  const handleAttachmentPress = useAttachmentHandler(chatRoomId, sendMessage, setUploadQueue, setIsUploading);
  
  // Get WebSocket connection status
  const { isConnected, sendTyping, typingByRoom } = useWebSocket();

  // Get chat room display name
  const getChatDisplayName = (): string => {
    if (!chatRoom) {
      return 'Loading...';
    }

    // For DIRECT chats, show the other participant's name
    if (chatRoom.type === 'DIRECT' && chatRoom.participants.length === 2) {
      const otherParticipant = chatRoom.participants.find(
        p => p.user.id !== authState.user?.id
      );
      if (otherParticipant) {
        const name = `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}`;
        // Add unit if available
        if (otherParticipant.user.unit) {
          return `${name} (Unit ${otherParticipant.user.unit})`;
        }
        return name;
      }
    }

    // For GROUP/LOAD chats, use the chat name if available
    if (chatRoom.name) {
      return chatRoom.name;
    }

    // Fallback for group chats
    if (chatRoom.type === 'GROUP' || chatRoom.type === 'LOAD') {
      const participantNames = chatRoom.participants
        .slice(0, 2)
        .map(p => p.user.firstName)
        .join(', ');
      return participantNames + (chatRoom.participants.length > 2 ? '...' : '');
    }

    return 'Unknown Chat';
  };

  // Format date for date separator
  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if same day
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

    // Check if yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // Format as "DD MMM YYYY"
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Check if date has changed between messages
  const shouldShowDateSeparator = (currentMessage: Message, previousMessage?: Message): boolean => {
    if (!previousMessage) return true;
    
    const currentDate = new Date(currentMessage.createdAt).toDateString();
    const previousDate = new Date(previousMessage.createdAt).toDateString();
    
    return currentDate !== previousDate;
  };

  // Group messages with date separators
  const messagesWithSeparators = useMemo(() => {
    // Ensure messages are sorted by date (oldest first) before processing
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    const result: Array<{ type: 'message' | 'date'; data: Message | string }> = [];
    
    sortedMessages.forEach((message, index) => {
      const previousMessage = index > 0 ? sortedMessages[index - 1] : undefined;
      
      if (shouldShowDateSeparator(message, previousMessage)) {
        result.push({
          type: 'date',
          data: formatDate(message.createdAt),
        });
      }
      
      result.push({
        type: 'message',
        data: message,
      });
    });
    
    return result;
  }, [messages]);

  // Prepare data for FlatList (inverted list needs reversed order)
  // When using inverted FlatList, we reverse the order so newest messages appear at bottom
  // In inverted list: last item of array appears at visual bottom, first item at visual top
  const flatListData = useMemo(() => {
    // Simply reverse the array - inverted FlatList will handle the visual display
    // The last element (newest message) will appear at visual bottom
    return [...messagesWithSeparators].reverse();
  }, [messagesWithSeparators]);

  // Ref for FlatList to enable scrolling
  const flatListRef = useRef<FlatList>(null);
  const previousMessagesLengthRef = useRef(0);
  const isUserScrolledUpRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const hasScrolledToBottomRef = useRef(false);

  // Reset scroll flags when chat room changes
  useEffect(() => {
    if (chatRoomId) {
      isInitialLoadRef.current = true;
      hasScrolledToBottomRef.current = false;
      isUserScrolledUpRef.current = false;
      previousMessagesLengthRef.current = 0;
    }
  }, [chatRoomId]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (messages.length > 0 && isInitialLoadRef.current && !isLoadingMessages) {
      isInitialLoadRef.current = false;
      hasScrolledToBottomRef.current = false; // Mark that we need to scroll
    }
  }, [messages.length, isLoadingMessages]);

  // Handle scroll to bottom when content size changes (for initial load)
  const handleContentSizeChange = useCallback(() => {
    if (!hasScrolledToBottomRef.current && flatListData.length > 0 && !isLoadingMessages) {
      // Use requestAnimationFrame to ensure the list is fully rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (flatListRef.current && !hasScrolledToBottomRef.current) {
            hasScrolledToBottomRef.current = true;
            // In inverted FlatList:
            // - First element (index 0) is displayed at visual bottom (newest messages)
            // - Last element (index length-1) is displayed at visual top (oldest messages)
            // So we need to scroll to index 0 to show newest messages at bottom
            try {
              // Find first non-date item index (in case first item is a date separator)
              const firstMessageIndex = flatListData.findIndex(item => item.type === 'message');
              const scrollIndex = firstMessageIndex >= 0 ? firstMessageIndex : 0;
              flatListRef.current.scrollToIndex({ index: scrollIndex, animated: false, viewPosition: 0 });
            } catch (e) {
              // Fallback: try scrollToOffset with 0
              try {
                flatListRef.current.scrollToOffset({ offset: 0, animated: false });
              } catch (err) {
                console.warn('Failed to scroll to bottom:', err);
              }
            }
          }
        }, 150);
      });
    }
  }, [flatListData.length, isLoadingMessages, flatListData]);

  // Auto-scroll to bottom when new messages arrive (if user is at bottom)
  useEffect(() => {
    if (messages.length > previousMessagesLengthRef.current && !isInitialLoadRef.current) {
      // New message(s) added
      if (!isUserScrolledUpRef.current) {
        // User is at bottom, scroll to show new message
        // In inverted FlatList, index 0 means visual bottom (newest messages)
        setTimeout(() => {
          if (flatListData.length > 0) {
            try {
              // Find first non-date item index (in case first item is a date separator)
              const firstMessageIndex = flatListData.findIndex(item => item.type === 'message');
              const scrollIndex = firstMessageIndex >= 0 ? firstMessageIndex : 0;
              flatListRef.current?.scrollToIndex({ index: scrollIndex, animated: true, viewPosition: 0 });
            } catch (e) {
              // Fallback: try scrollToOffset with 0
              try {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              } catch (err) {
                console.warn('Failed to scroll to new message:', err);
              }
            }
          }
        }, 100);
      }
    }
    previousMessagesLengthRef.current = messages.length;
  }, [messages.length, flatListData.length, flatListData]);

  // Track keyboard state
  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      setIsKeyboardOpen(true);
      if (Platform.OS === 'android') {
        // Use requestAnimationFrame for smooth transition
        requestAnimationFrame(() => {
          setFlexToggle(false);
        });
      }
    });
    
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setIsKeyboardOpen(false);
      if (Platform.OS === 'android') {
        // Add small delay for smooth transition after keyboard closes
        hideTimeout = setTimeout(() => {
          requestAnimationFrame(() => {
            setFlexToggle(true);
          });
        }, 150);
      }
    });
    
    return () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Track active chat room for notification suppression
  useEffect(() => {
    if (chatRoomId) {
      setActiveChatRoomId(chatRoomId as string);
      return () => setActiveChatRoomId(null);
    }
    return () => {};
  }, [chatRoomId]);

  // Animated typing dots (mimics Next.js bouncing dots)
  const TypingDots: React.FC = () => {
    const d1 = useRef(new Animated.Value(0)).current;
    const d2 = useRef(new Animated.Value(0)).current;
    const d3 = useRef(new Animated.Value(0)).current;
  
    useEffect(() => {
      const makeAnim = (value: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: -4,
              duration: 300,
              delay,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: 300,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ).start();
  
      makeAnim(d1, 0);
      makeAnim(d2, 100);
      makeAnim(d3, 200);
    }, [d1, d2, d3]);
  
    return (
      <View style={styles.typingDots}>
        <Animated.View style={[styles.dot, { transform: [{ translateY: d1 }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ translateY: d2 }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ translateY: d3 }] }]} />
      </View>
    );
  };
  
  return (
    <View style={[styles.screenWrap]}>
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      <KeyboardAvoidingView
        style={
          flexToggle
            ? { flexGrow: 1 }
            : { flex: 1 }
        }
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled={!flexToggle}
      >
        <View style={styles.container}>
          {/* Header with back button and chat name */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <ArrowLeft width={rem(10.46)} height={rem(19)} color={colors.neutral.white} />
              </TouchableOpacity>
              
              {isLoadingChatRoom ? (
                <ActivityIndicator size="small" color={colors.neutral.white} />
              ) : error ? (
                <Text style={styles.screenTitle}>Error</Text>
              ) : (
                <Text style={styles.screenTitle}>
                  {getChatDisplayName()}
                </Text>
              )}
            </View>
            
            <ChatHeaderDropdown
              chatRoom={chatRoom || null}
              chatRoomType={chatRoom?.type}
              onFilesPress={() => {
                // TODO: Implement files functionality
                console.log('Files pressed for chat room:', chatRoomId);
              }}
            />
          </View>
        
          {isLoadingMessages && messages.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary.violet} />
              <Text style={styles.loadingText}>Loading messages...</Text>
            </View>
          ) : error && messages.length === 0 ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={flatListData}
              inverted
              style={styles.content}
              contentContainerStyle={styles.messagesContainer}
              extraData={messages.map(msg => `${msg.id}-${msg.isRead ? 'read' : 'unread'}-${(msg.readBy || []).join(',')}`).join('|')}
              keyExtractor={(item, index) => {
                if (item.type === 'date') {
                  return `date-${index}`;
                }
                return (item.data as Message).id;
              }}
              onScroll={(event) => {
                // Track if user has scrolled up (away from bottom)
                // In inverted FlatList:
                // - contentOffset.y === 0 means at visual bottom (newest messages)
                // - contentOffset.y > 0 means scrolled up (older messages)
                const { contentOffset } = event.nativeEvent;
                // If user scrolled more than 100px from bottom, they're looking at older messages
                isUserScrolledUpRef.current = contentOffset.y > 100;
                // Mark that user has manually scrolled to bottom
                if (contentOffset.y <= 10) { // Small threshold for "at bottom"
                  hasScrolledToBottomRef.current = true;
                }
              }}
              scrollEventThrottle={400}
              onContentSizeChange={handleContentSizeChange}
              onScrollToIndexFailed={(info) => {
                // If scrollToIndex fails, try scrollToOffset as fallback
                setTimeout(() => {
                  try {
                    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                  } catch (e) {
                    console.warn('Failed to scroll after index failure:', e);
                  }
                }, 100);
              }}
              renderItem={({ item }) => {
                if (item.type === 'date') {
                  const dateString = item.data as string;
                  return (
                    <View style={styles.dateSeparator}>
                      <View style={styles.dateSeparatorLine} />
                      <Text style={styles.dateSeparatorText}>{dateString}</Text>
                    </View>
                  );
                }
                
                const message = item.data as Message;
                const isSender = message.senderId === authState.user?.id;
                
                return <MessageItem message={message} isSender={isSender} />;
              }}
              onEndReached={() => {
                // In inverted list, onEndReached fires when scrolling to top
                // Load more messages when scrolling to top (which is "end" in inverted list)
                // Note: We call loadMoreMessages even when hasMoreMessages is false,
                // because it will try to load from archive if database is exhausted
                if (!isLoadingMessages) {
                  loadMoreMessages();
                }
              }}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                // In inverted list, ListHeaderComponent appears at the top (where old messages load)
                isLoadingMessages && messages.length > 0 ? (
                  <View style={{ paddingVertical: rem(10) }}>
                    <ActivityIndicator size="small" color={colors.primary.violet} />
                  </View>
                ) : null
              }
              maintainVisibleContentPosition={{
                minIndexForVisible: 0,
              }}
            />
          )}
        
        <View
          style={[
            styles.sendSection,
            //!isKeyboardOpen ? { paddingBottom: insets.bottom } : null,
          ]}
          onLayout={(e) => setSendSectionHeight(e.nativeEvent.layout.height)}
        >
          {/* Upload queue preview */}
          {uploadQueue.length > 0 && (
            <View style={styles.uploadRow}>
              {uploadQueue.map((f, idx) => (
                <View key={`${f.name}-${idx}`} style={styles.uploadChip}>
                  <Text style={styles.uploadChipText} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={styles.uploadChipStatus}>
                    {f.status === 'uploading' ? 'Uploading…' : f.status === 'done' ? 'Sent' : 'Error'}
                  </Text>
                </View>
              ))}
            </View>
          )}
          
          <TouchableOpacity
            style={styles.smileButton}
            onPress={() => {
              setShowEmojiPicker(!showEmojiPicker);
            }}
            activeOpacity={0.7}
          >
            <SmileIcon width={rem(28)} height={rem(28)} color={colors.primary.greyIcon} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.attachmentButton}
            onPress={() => {
              handleAttachmentPress().catch(() => {});
            }}
            activeOpacity={0.7}
          >
            <AttachmentIcon width={rem(28)} height={rem(28)} color={colors.primary.greyIcon} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message"
            placeholderTextColor={colors.neutral.darkGrey}
            value={messageText}
            onChangeText={(t) => {
              setMessageText(t);
              if (chatRoomId) {
                sendTyping(chatRoomId as string, t.trim().length > 0);
              }
            }}
            multiline
            editable={!isSendingMessage}
          />
          
          <TouchableOpacity
            style={styles.sendButton}
            onPress={async () => {
              if (messageText.trim() && !isSendingMessage && chatRoomId) {
                try {
                  await sendMessage(messageText.trim());
                  setMessageText('');
                  // Stop typing indicator after send
                  sendTyping(chatRoomId as string, false);
                } catch (error) {
                  console.error('Failed to send message:', error);
                  // Show error to user (you can add a toast notification here if needed)
                  // For now, we just log it
                }
              }
            }}
            activeOpacity={0.7}
            disabled={!messageText.trim() || isSendingMessage || !chatRoomId || !isConnected}
          >
            <SendIcon width={rem(28)} height={rem(28)} color={colors.primary.greyIcon} opacity={messageText.trim() ? 1 : 0.5} />
          </TouchableOpacity>
        </View>
        
        {/* Typing indicator (absolute above input bar) */}
        {chatRoomId ? (() => {
          const roomTyping = typingByRoom[chatRoomId as string] || {};
          const entries = Object.entries(roomTyping).filter(
            ([userId, data]) => data.isTyping && userId !== authState.user?.id
          );
          if (entries.length === 0) return null;
          const names = entries.map(([_, d]) => d.firstName || 'User').slice(0, 2);
          const text =
            entries.length === 1
              ? `${names[0]} is typing...`
              : entries.length === 2
              ? `${names[0]} and ${names[1]} are typing...`
              : `${names[0]} and ${entries.length - 1} others are typing...`;
          return (
            <View
              pointerEvents="none"
              style={[styles.typingOverlay, { bottom: sendSectionHeight + rem(6) }]}
            >
              <View style={styles.typingRow}>
                <TypingDots />
                <Text style={styles.typingText}>{text}</Text>
              </View>
            </View>
          );
        })() : null}
        
        <EmojiPicker
          isOpen={showEmojiPicker}
          onClose={() => setShowEmojiPicker(false)}
          onEmojiSelect={(emoji) => {
            setMessageText(prev => prev + emoji);
          }}
        />
      </View>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  sendSection: {
    boxShadow: '0px 0px 40px 0px rgba(41, 41, 102, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopRightRadius: rem(15),
    borderTopLeftRadius: rem(15),
    paddingHorizontal: rem(14),
    paddingVertical: rem(24),
    flexDirection: 'row',
    alignItems: "center",
    gap: rem(10),
  },
  smileButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageInput: {
    flex: 1,
    minHeight: rem(36),
    maxHeight: rem(120),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    borderRadius: rem(15),
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.31)',
    textAlignVertical: 'center',
    includeFontPadding: false, // Remove extra padding on Android
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadRow: {
    position: 'absolute',
    left: rem(14),
    right: rem(14),
    bottom: '100%',
    paddingBottom: rem(8),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8),
  },
  uploadChip: {
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    borderColor: 'rgba(96, 102, 197, 0.31)',
    borderWidth: 1,
    borderRadius: rem(12),
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    maxWidth: '80%',
  },
  uploadChipText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  uploadChipStatus: {
    fontSize: fp(10),
    color: colors.neutral.darkGrey,
  },
  content: {
    flex: 1,
  },
  screenTitle: {
    color: colors.neutral.white,
    fontFamily: fonts["700"],
    fontSize: fp(14),
    textTransform: 'capitalize',
  },
  screenWrap: {
    flex: 1,
    position: "relative",
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(247, 248, 255, 1)',
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(20),
    flex: 1,
  },
  backButton: {
    padding: rem(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: rem(100),
  },
  loadingText: {
    marginTop: rem(12),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: rem(100),
    paddingHorizontal: rem(20),
  },
  errorText: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.semantic.error,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: rem(100),
  },
  emptyText: {
    fontSize: fp(16),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  messagesContainer: {
    paddingHorizontal: rem(15),
    paddingTop: rem(34),
    paddingBottom: rem(15),
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: rem(25),
    gap: rem(5),
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(41, 41, 102, 0.15)',
  },
  dateSeparatorText: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: 'rgba(41, 41, 102, 0.52)',
  },
  typingWrap: {
    display: 'none',
  },
  typingOverlay: {
    position: 'absolute',
    left: rem(16),
    right: rem(16),
    zIndex: 25,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: rem(8),
    paddingHorizontal: rem(12),
    paddingVertical: rem(6),
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: rem(12),
    boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(3),
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8E8E93',
  },
  typingText: {
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: '#8E8E93',
  },
});


