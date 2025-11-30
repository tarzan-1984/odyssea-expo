import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import { ChatRoom, User, Message } from '@/components/ChatListItem';

export interface UsersPagination {
  current_page: number;
  has_next_page: boolean;
  has_prev_page: boolean;
  per_page: number;
  total_count: number;
  total_pages: number;
}

export interface UsersResponse {
  users: User[];
  pagination: UsersPagination;
}

/**
 * Archive-related types
 */
export interface ArchiveDay {
  year: number;
  month: number;
  day: number;
  messageCount: number;
  createdAt: string;
}

export interface ArchiveMessage {
  id: string;
  content: string;
  senderId: string;
  chatRoomId: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface ArchiveFile {
  chatRoomId: string;
  year: number;
  month: number;
  messages: ArchiveMessage[];
  totalCount: number;
  createdAt: string;
}

/**
 * Chat API client for mobile application
 * Handles communication with backend API for chat rooms
 */

class ChatApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL || '') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Get access token from secure storage
    const accessToken = await secureStorage.getItemAsync('accessToken');

    if (!accessToken) {
      throw new Error('No access token available');
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers as HeadersInit),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Backend returns data in { data: [...] } format or direct array
    return (data.data || data || []) as T;
  }

  /**
   * Get all chat rooms for the authenticated user
   */
  async getChatRooms(): Promise<ChatRoom[]> {
    try {
      const response = await this.request<ChatRoom[]>('/v1/chat-rooms');
      return response || [];
    } catch (error) {
      console.error('❌ [ChatAPI] Failed to get chat rooms:', error);
      throw error;
    }
  }

  /**
   * Get a specific chat room by ID
   */
  async getChatRoom(chatRoomId: string): Promise<ChatRoom> {
    return this.request<ChatRoom>(`/v1/chat-rooms/${chatRoomId}`);
  }

  /**
   * Get messages for a specific chat room with pagination
   * Mirrors Next.js chatApi.getMessages implementation
   */
  async getMessages(
    chatRoomId: string,
    page: number = 1,
    limit: number = 50,
    options?: {
      afterCreatedAt?: string;
    }
  ): Promise<{
    messages: Message[];
    hasMore: boolean;
    total: number;
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (options?.afterCreatedAt) {
      params.append('afterCreatedAt', options.afterCreatedAt);
    }

    const response = await this.request<{
      messages: Message[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        hasMore: boolean;
      };
    }>(`/v1/messages/chat-room/${chatRoomId}?${params}`);

    return {
      messages: response.messages || [],
      hasMore: response.pagination?.hasMore || false,
      total: response.pagination?.total || 0,
    };
  }

  /**
   * Get files (messages with fileUrl) from chat room
   * Mirrors Next.js chatApi.getFiles implementation
   */
  async getFiles(
    chatRoomId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    messages: Message[];
    hasMore: boolean;
    total: number;
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await this.request<{
      messages: Message[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        hasMore: boolean;
      };
    }>(`/v1/messages/chat-room/${chatRoomId}/files?${params}`);

    return {
      messages: response.messages || [],
      hasMore: response.pagination?.hasMore || false,
      total: response.pagination?.total || 0,
    };
  }

  /**
   * Create a chat room (DIRECT/GROUP/LOAD)
   */
  async createChatRoom(data: {
    name?: string;
    type: 'DIRECT' | 'GROUP' | 'LOAD';
    loadId?: string;
    participantIds: string[];
  }): Promise<ChatRoom> {
    return this.request<ChatRoom>(`/v1/chat-rooms`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get user list (contacts) with optional search and paging
   * Mirrors Next.js route logic that proxies to GET /v1/users
   */
  async getUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;   // optional filter
    status?: string; // optional filter
    sort?: any;      // optional sort payload
  }): Promise<UsersResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.search) query.append('search', params.search);
    if (params?.role) query.append('role', params.role);
    if (params?.status) query.append('status', params.status);
    if (params?.sort) query.append('sort', JSON.stringify(params.sort));

    const qs = query.toString();
    const endpoint = `/v1/users${qs ? `?${qs}` : ''}`;
    // Raw response has shape: { users: [...], pagination: {...}, path, timestamp }
    const raw: any = await this.request<any>(endpoint, { method: 'GET' });
    const users = raw?.users ?? [];
    const pagination = raw?.pagination ?? {
      current_page: 1,
      has_next_page: false,
      has_prev_page: false,
      per_page: users.length,
      total_count: users.length,
      total_pages: 1,
    };
    return { users, pagination } as UsersResponse;
  }

  /**
   * Toggle mute status for a chat room
   * Mirrors Next.js chatApi.toggleMuteChatRoom
   */
  async toggleMuteChatRoom(chatRoomId: string): Promise<{ chatRoomId: string; userId: string; mute: boolean }> {
    return this.request<{ chatRoomId: string; userId: string; mute: boolean }>(`/v1/chat-rooms/${chatRoomId}/mute`, {
      method: 'PUT',
    });
  }

  /**
   * Toggle pin status for a chat room
   * Mirrors Next.js chatApi.togglePinChatRoom
   */
  async togglePinChatRoom(chatRoomId: string): Promise<{ chatRoomId: string; userId: string; pin: boolean }> {
    return this.request<{ chatRoomId: string; userId: string; pin: boolean }>(`/v1/chat-rooms/${chatRoomId}/pin`, {
      method: 'PUT',
    });
  }

  /**
   * Mute/unmute multiple chat rooms
   * Mirrors Next.js chatApi.muteChatRooms
   */
  async muteChatRooms(chatRoomIds: string[], action: 'mute' | 'unmute'): Promise<{ userId: string; mutedCount: number; chatRoomIds: string[] }> {
    return this.request<{ userId: string; mutedCount: number; chatRoomIds: string[] }>('/v1/chat-rooms/mute', {
      method: 'PUT',
      body: JSON.stringify({ chatRoomIds, action }),
    });
  }

  /**
   * Mark a specific message as read
   * Mirrors Next.js chatApi.markMessageAsRead
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    return this.request<void>(`/v1/messages/${messageId}/read`, {
      method: 'PATCH',
    });
  }

  /**
   * Mark all messages in a chat room as read
   * Mirrors Next.js chatApi.markChatRoomAsRead
   */
  async markChatRoomAsRead(chatRoomId: string): Promise<void> {
    return this.request<void>(`/v1/chat-rooms/${chatRoomId}/read`, {
      method: 'PATCH',
    });
  }

  /**
   * Delete or hide a chat room
   * For DIRECT chats: hides the chat for the user (marks as hidden in DB)
   * For GROUP chats: if user is admin, deletes the chat; if not admin, user leaves the chat
   * Returns: { deleted: boolean; hidden?: boolean; left?: boolean }
   * Mirrors Next.js chatApi.deleteChatRoom
   */
  async deleteChatRoom(chatRoomId: string): Promise<{ deleted: boolean; hidden?: boolean; left?: boolean }> {
    return this.request<{ deleted: boolean; hidden?: boolean; left?: boolean }>(`/v1/chat-rooms/${chatRoomId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get available archive days for a chat room
   * Mirrors Next.js messagesArchiveApi.getAvailableArchiveDays
   */
  async getAvailableArchiveDays(chatRoomId: string): Promise<ArchiveDay[]> {
    try {
      const apiData = await this.request<{
        success: boolean;
        data: {
          success: boolean;
          data: {
            availableDays: ArchiveDay[];
          };
        };
      }>(`/v1/messages/archive/chat-rooms/${chatRoomId}/days`);
     
      // Handle nested response structure from backend
      if (apiData && typeof apiData === 'object' && 'data' in apiData) {
        const nestedData = (apiData as any).data;
        if (nestedData && nestedData.data && nestedData.data.availableDays) {
          return nestedData.data.availableDays;
        }
        if (nestedData && nestedData.availableDays) {
          return nestedData.availableDays;
        }
      }

      // Fallback: try direct access
      if (Array.isArray(apiData)) {
        return apiData;
      }

      throw new Error('Invalid response structure for getAvailableArchiveDays');
    } catch (error) {
      console.error('❌ [ChatAPI] Failed to get available archive days:', error);
      throw error;
    }
  }

  /**
   * Load archived messages for a specific day
   * Mirrors Next.js messagesArchiveApi.loadArchivedMessages
   */
  async loadArchivedMessages(
    chatRoomId: string,
    year: number,
    month: number,
    day: number
  ): Promise<ArchiveFile> {
    try {
      const response = await this.request<{
        success: boolean;
        data: {
          messages: ArchiveMessage[];
          year: number;
          month: number;
          totalCount: number;
          createdAt: string;
        };
      }>(`/v1/messages/archive/chat-rooms/${chatRoomId}/${year}/${month}/${day}`);
      
      // Handle response structure from backend
      // Expected structure: { success: true, data: { messages: [], year, month, totalCount, createdAt } }
      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as any).data;
        
        // Check if data has messages array (direct structure)
        if (data && typeof data === 'object' && 'messages' in data) {
          const archiveFile: ArchiveFile = {
            chatRoomId,
            year: data.year || year,
            month: data.month || month,
            messages: data.messages || [],
            totalCount: data.totalCount || 0,
            createdAt: data.createdAt || new Date().toISOString(),
          };
          return archiveFile;
        }
        
        // Check if data has nested data structure (Next.js API route wrapper)
        if (data && typeof data === 'object' && 'data' in data) {
          const nestedData = data.data;
          if (nestedData && typeof nestedData === 'object' && 'messages' in nestedData) {
            const archiveFile: ArchiveFile = {
              chatRoomId,
              year: nestedData.year || year,
              month: nestedData.month || month,
              messages: nestedData.messages || [],
              totalCount: nestedData.totalCount || 0,
              createdAt: nestedData.createdAt || new Date().toISOString(),
            };
            return archiveFile;
          }
        }
      }

      // Fallback: try direct access (response is ArchiveFile)
      if (response && typeof response === 'object' && 'messages' in response) {
        const archiveFile = response as any;
        return {
          chatRoomId,
          year: archiveFile.year || year,
          month: archiveFile.month || month,
          messages: archiveFile.messages || [],
          totalCount: archiveFile.totalCount || 0,
          createdAt: archiveFile.createdAt || new Date().toISOString(),
        };
      }

      throw new Error('Invalid response structure for loadArchivedMessages');
    } catch (error) {
      throw error;
    }
  }
}

// Create singleton instance
export const chatApi = new ChatApiClient();

