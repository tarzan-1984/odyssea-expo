import { useState, useCallback, useEffect, useRef } from 'react';
import { chatApi } from '@/app-api/chatApi';
import { messagesCacheService } from '@/services/MessagesCacheService';
import { Message } from '@/components/ChatListItem';

interface UseChatMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  currentPage: number;
  loadMessages: (chatRoomId: string, page?: number, limit?: number) => Promise<void>;
  loadMoreMessages: (chatRoomId: string) => Promise<void>;
  addMessage: (message: Message) => Promise<void>;
  updateMessage: (messageId: string, chatRoomId: string, updates: Partial<Message>) => Promise<void>;
}

/**
 * Helper function to merge cached messages with real-time updates
 * Similar to mergeMessagesWithUpdates in Next.js useChatSync
 */
const mergeMessagesWithUpdates = (
  cachedMessages: Message[],
  realTimeMessages: Message[]
): Message[] => {
  const messageMap = new Map<string, Message>();

  // First, add all cached messages
  cachedMessages.forEach(msg => {
    messageMap.set(msg.id, msg);
  });

  // Then, update with real-time messages (these are more recent)
  realTimeMessages.forEach(msg => {
    messageMap.set(msg.id, msg);
  });

  // Convert back to array and sort by creation time
  const merged = Array.from(messageMap.values());
  merged.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return merged;
};

/**
 * Hook for managing chat messages with caching
 * Implements the same logic as useChatSync.loadMessages in Next.js application
 */
export const useChatMessages = (): UseChatMessagesReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const realTimeMessagesRef = useRef<Message[]>([]);

  /**
   * Load messages for a specific chat room
   * Same logic as in Next.js useChatSync.loadMessages
   */
  const loadMessages = useCallback(
    async (chatRoomId: string, page: number = 1, limit: number = 50) => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if we have cached messages first
        const hasCachedMessages = await messagesCacheService.hasMessages(chatRoomId);

        if (hasCachedMessages) {
          // Load from cache for immediate display
          const cachedMessages = await messagesCacheService.getMessages(
            chatRoomId,
            limit,
            (page - 1) * limit
          );
          
          if (cachedMessages.length > 0) {
            // Merge cached messages with any real-time updates
            const mergedMessages = mergeMessagesWithUpdates(
              cachedMessages,
              realTimeMessagesRef.current
            );
            setMessages(mergedMessages);
            setIsLoading(false);

            // Set initial pagination state for cached messages
            setCurrentPage(page);
            setHasMore(cachedMessages.length >= limit); // Assume there might be more if we got full page

            // Check if cache is fresh for this specific chat room (less than 5 minutes old for messages)
            const isCacheFresh = await messagesCacheService.isMessagesCacheFresh(chatRoomId, 5);

            // Only update from API if cache is not fresh
            if (!isCacheFresh) {
              try {
                const response = await chatApi.getMessages(chatRoomId, page, limit);
                
                // Only update if we got different data
                if (
                  response.messages.length !== cachedMessages.length ||
                  response.messages.some(
                    (msg, index) => msg.id !== cachedMessages[index]?.id
                  )
                ) {
                  // Merge API messages with real-time updates
                  const mergedApiMessages = mergeMessagesWithUpdates(
                    response.messages,
                    realTimeMessagesRef.current
                  );
                  setMessages(mergedApiMessages);
                  setCurrentPage(page);
                  setHasMore(response.hasMore);
                  await messagesCacheService.saveMessages(chatRoomId, response.messages);
                }
              } catch (apiError) {
                console.warn('⚠️ [useChatMessages] Background API update failed:', apiError);
              }
            }

            // Chat room loaded successfully
            return;
          }
        }

        // If no cached data, load from API
        try {
          const response = await chatApi.getMessages(chatRoomId, page, limit);
          
          // Merge API messages with any real-time updates
          const mergedMessages = mergeMessagesWithUpdates(
            response.messages,
            realTimeMessagesRef.current
          );
          setMessages(mergedMessages);
          await messagesCacheService.saveMessages(chatRoomId, response.messages);

          // Update pagination state
          setCurrentPage(page);
          setHasMore(response.hasMore);
        } catch (apiError) {
          console.warn('❌ [useChatMessages] API unavailable, no cached data available:', apiError);
          setError('Failed to load messages');
          setMessages([]);
        }

        // Chat room loaded successfully
      } catch (error) {
        console.error('❌ [useChatMessages] Failed to load messages:', error);
        setError('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Load more messages (pagination)
   * Similar to loadMoreMessages in Next.js useChatSync
   */
  const loadMoreMessages = useCallback(
    async (chatRoomId: string) => {
      if (isLoading || !hasMore) return;

      try {
        setIsLoading(true);
        const nextPage = currentPage + 1;
        const response = await chatApi.getMessages(chatRoomId, nextPage, 50);

        // Prepend new messages to existing ones (older messages go to top)
        setMessages(prev => {
          const merged = mergeMessagesWithUpdates(
            [...response.messages, ...prev],
            realTimeMessagesRef.current
          );
          return merged;
        });

        // Update cache with new messages
        const allMessages = [...response.messages, ...messages];
        await messagesCacheService.saveMessages(chatRoomId, allMessages);

        setCurrentPage(nextPage);
        setHasMore(response.hasMore);
      } catch (error) {
        console.error('❌ [useChatMessages] Failed to load more messages:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, hasMore, currentPage, messages]
  );

  /**
   * Add a new message (for real-time updates)
   */
  const addMessage = useCallback(async (message: Message) => {
    // Add to real-time messages ref
    realTimeMessagesRef.current = [...realTimeMessagesRef.current, message];

    // Update state
    setMessages(prev => {
      // Check if message already exists
      if (prev.some(m => m.id === message.id)) {
        return prev;
      }
      
      const updated = [...prev, message];
      updated.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      return updated;
    });

    // Save to cache asynchronously
    await messagesCacheService.addMessage(message);
  }, []);

  /**
   * Update a message (for real-time updates)
   */
  const updateMessage = useCallback(
    async (messageId: string, chatRoomId: string, updates: Partial<Message>) => {
      // Update in real-time messages ref
      realTimeMessagesRef.current = realTimeMessagesRef.current.map(msg =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );

      // Update state
      setMessages(prev =>
        prev.map(msg => (msg.id === messageId ? { ...msg, ...updates } : msg))
      );

      // Update cache asynchronously
      await messagesCacheService.updateMessage(messageId, chatRoomId, updates);
    },
    []
  );

  return {
    messages,
    isLoading,
    error,
    hasMore,
    currentPage,
    loadMessages,
    loadMoreMessages,
    addMessage,
    updateMessage,
  };
};

