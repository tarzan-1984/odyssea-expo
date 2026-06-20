import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

export interface SendCustomPushPayload {
  message: string;
  userId?: string | null;
  externalId?: string | null;
  platform?: 'all' | 'ios' | 'android' | null;
}

export interface SendCustomPushResponse {
  success: boolean;
  error?: string;
}

export async function sendCustomPushNotification(
  payload: SendCustomPushPayload
): Promise<SendCustomPushResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/notifications/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      (typeof data?.error === 'string' ? data.error : null) ??
      (typeof data?.message === 'string' ? data.message : null) ??
      `Failed to send push notification. Status: ${response.status}`;

    return { success: false, error: errorMsg };
  }

  return { success: true };
}
