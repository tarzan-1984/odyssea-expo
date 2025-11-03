import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';
import { ChatRoom, User } from '@/components/ChatListItem';

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
}

// Create singleton instance
export const chatApi = new ChatApiClient();

