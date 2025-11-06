import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
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
import ReadCheckIcon from '@/icons/ReadCheckIcon';
import UnreadCheckIcon from '@/icons/UnreadCheckIcon';
import EmojiPicker from '@/components/EmojiPicker';

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
  
  // Message input state
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Use useChatRoom hook for loading chat room and messages with caching (same logic as Next.js)
  const {
    chatRoom,
    messages,
    isLoadingChatRoom,
    isLoadingMessages,
    error,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    isSendingMessage,
  } = useChatRoom(chatRoomId);
  
  // Get WebSocket connection status
  const { isConnected } = useWebSocket();

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

  // Format time for message timestamp
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
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


  return (
    <View style={styles.screenWrap}>
      <View style={{ height: insets.top, backgroundColor: colors.primary.violet }} />
      
      <View style={styles.container}>
        {/* Header with back button and chat name */}
        <View style={styles.header}>
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
            extraData={messages.map(msg => `${msg.id}-${msg.isRead}-${msg.readBy?.length || 0}`).join(',')}
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
              
              return (
                <View
                  style={[
                    styles.messageWrapper,
                    isSender ? styles.messageWrapperRight : styles.messageWrapperLeft,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isSender ? styles.messageBubbleSender : styles.messageBubbleOther,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isSender ? styles.messageTextSender : styles.messageTextOther,
                      ]}
                    >
                      {message.content}
                    </Text>
                  </View>
                  
                  {/* message time and read status */}
                  <View
                    style={[
                      styles.messageTimeContainer,
                      isSender ? styles.messageTimeContainerRight : styles.messageTimeContainerLeft,
                    ]}
                  >
                    {isSender && (
                      <View style={styles.readStatusIcon}>
                        {message.isRead ? (
                          <ReadCheckIcon width={rem(14)} height={rem(14)} color="rgba(41, 41, 102, 0.7)" />
                        ) : (
                          <UnreadCheckIcon width={rem(14)} height={rem(14)} color="rgba(41, 41, 102, 0.7)" />
                        )}
                      </View>
                    )}
                    <Text
                      style={[
                        styles.messageTime,
                        isSender ? styles.messageTimeRight : styles.messageTimeLeft,
                      ]}
                    >
                      {formatTime(message.createdAt)}
                    </Text>
                  </View>
                </View>
              );
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
      </View>
      <View style={styles.sendSection}>
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
            // TODO: Open file picker
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
          onChangeText={setMessageText}
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
      
      <EmojiPicker
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelect={(emoji) => {
          setMessageText(prev => prev + emoji);
        }}
      />
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
  content: {
    flex: 1,
  },
  screenTitle: {
    color: colors.neutral.white,
    fontFamily: fonts["700"],
    fontSize: fp(18),
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
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
    width: '100%',
    position: 'relative',
    zIndex: 20,
    gap: rem(12),
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
  messageWrapper: {
    marginBottom: rem(15),
    maxWidth: '75%',
  },
  messageWrapperRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageWrapperLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: rem(15),
    paddingVertical: rem(15),
    borderRadius: rem(10),
    marginBottom: rem(6),
    boxShadow: '0px 0px 20px 0px rgba(96, 102, 197, 0.06)',
  },
  messageBubbleSender: {
    backgroundColor: colors.primary.blue,
    borderBottomRightRadius: 0,
  },
  messageBubbleOther: {
    backgroundColor: colors.neutral.white,
    borderBottomLeftRadius: 0,
  },
  messageText: {
    fontSize: fp(15),
    fontFamily: fonts['400'],
    letterSpacing: 0,
  },
  messageTextSender: {
    color: colors.neutral.white,
  },
  messageTextOther: {
    color: colors.primary.blue,
  },
  messageTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(4),
  },
  messageTimeContainerRight: {
    justifyContent: 'flex-end',
  },
  messageTimeContainerLeft: {
    justifyContent: 'flex-start',
  },
  readStatusIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageTime: {
    fontSize: fp(10),
    fontFamily: fonts['400'],
    color: 'rgba(41, 41, 102, 0.7)',
  },
  messageTimeRight: {
    textAlign: 'right',
  },
  messageTimeLeft: {
    textAlign: 'left',
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
});


