import { secureStorage } from '@/utils/secureStorage';
import { API_BASE_URL } from '@/lib/config';

export type UserResponse = {
  data: {
    data: any;
  };
};

export interface ResetPasswordResponse {
  message: string;
}

/**
 * Get user from TMS API (for DRIVER role)
 */
export async function getUserById(userId: string): Promise<UserResponse> {
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_BACKEND_URL_TWO}/v1/driver?id=${userId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": `${process.env.EXPO_PUBLIC_TMS_API_KEY}`,
      },
    }
  );
  
  const data = await response.json();
  
  if (!data) {
    throw new Error( `Failed to fetch user`);
  }
  return data as UserResponse;
}

/**
 * Get user from our backend database (for non-DRIVER roles)
 */
export async function getUserFromBackend(userId: string): Promise<any> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/users/${userId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch user. Status: ${response.status}`);
  }

  const data = await response.json();
  
  // Backend wraps response in { data: {...} } format due to TransformInterceptor
  return data.data || data;
}

/**
 * Reset password for mobile app
 * Generates new password and sends it to user's email
 * @param email - User's email address
 * @returns Promise with response message
 * @throws Error if user doesn't exist or request fails
 */
export async function resetPasswordForMobile(email: string): Promise<ResetPasswordResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/auth/reset-password-mobile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      // If 404, return the error message from backend
      if (response.status === 404) {
        throw new Error(data.message || 'User with this email does not exist');
      }
      // For other errors, throw with backend message or default
      throw new Error(data.message || `Failed to reset password. Status: ${response.status}`);
    }

    return data as ResetPasswordResponse;
  } catch (error) {
    console.error('[resetPasswordForMobile] Error:', error);
    // Re-throw to let component handle it
    throw error;
  }
}


