import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

export type MessageTemplateScope = 'personal' | 'company';
export type MessageTemplateKind = 'personal' | 'company';
export type MessageTemplateGroupDto = 'Expedite' | 'HR' | 'Tracking';
export type AdminCompanyGroupFilter = 'all' | 'Expedite' | 'HR' | 'Tracking';

export interface MessageTemplateDto {
  id: number;
  externalId: string;
  type: MessageTemplateKind;
  group: MessageTemplateGroupDto | null;
  title: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplatesPageDto {
  items: MessageTemplateDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface UpsertMessageTemplatePayload {
  id?: number;
  type?: MessageTemplateKind;
  group?: MessageTemplateGroupDto;
  title?: string;
  content?: string;
}

class MessageTemplatesApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL || '') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const accessToken = await secureStorage.getItemAsync('accessToken');
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers as HeadersInit),
      },
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.message || json?.error || `HTTP ${response.status}`);
    }

    return (json?.data || json) as T;
  }

  async fetchPage(params: {
    scope: MessageTemplateScope;
    page: number;
    limit?: number;
    search?: string;
    companyGroup?: AdminCompanyGroupFilter;
  }): Promise<MessageTemplatesPageDto> {
    const qs = new URLSearchParams({
      scope: params.scope,
      page: String(params.page),
      limit: String(params.limit ?? 10),
    });
    if (params.search?.trim()) qs.set('search', params.search.trim());
    if (params.companyGroup && params.companyGroup !== 'all') {
      qs.set('companyGroup', params.companyGroup);
    }

    return this.request<MessageTemplatesPageDto>(`/v1/message-templates?${qs.toString()}`);
  }

  async upsert(payload: UpsertMessageTemplatePayload): Promise<MessageTemplateDto> {
    return this.request<MessageTemplateDto>('/v1/message-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async delete(id: number): Promise<{ id: number }> {
    return this.request<{ id: number }>(`/v1/message-templates/${id}`, {
      method: 'DELETE',
    });
  }
}

export const messageTemplatesApi = new MessageTemplatesApiClient();
