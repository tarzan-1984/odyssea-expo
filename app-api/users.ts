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

export interface ChangePasswordResponse {
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
/** User row from GET /v1/users/external/:externalId (DB lookup by TMS external id). */
export type BackendUserByExternalId = {
  id: string;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

/**
 * Find app user in our DB by `externalId` (e.g. TMS user id from load meta `dispatcher_initials`).
 */
export async function getUserByExternalIdFromBackend(
  externalId: string,
): Promise<BackendUserByExternalId | null> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const trimmed = String(externalId ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(
    `${API_BASE_URL}/v1/users/external/${encodeURIComponent(trimmed)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch user by external id. Status: ${response.status}`,
    );
  }

  const data = await response.json();
  return (data.data || data) as BackendUserByExternalId;
}

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

/** Driver profile slice from GET /users/:id/driver-status (mobile sync). */
export type DriverProfileFromApi = {
  driverStatus: string | null;
  zip: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  statusDate: string | null;
  isAutoupdate: boolean | null;
  deactivateAccount: boolean;
};

/**
 * Get driver profile fields from backend (DRIVER role only).
 */
export async function getDriverStatus(userId: string): Promise<DriverProfileFromApi> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/users/${userId}/driver-status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch driver status. Status: ${response.status}`);
  }

  const data = await response.json();

  // Backend wraps response in { data: {...} } format due to TransformInterceptor
  const raw = data.data || data;
  return {
    driverStatus: raw.driverStatus ?? null,
    zip: raw.zip ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    location: raw.location ?? null,
    statusDate: raw.statusDate ?? null,
    isAutoupdate:
      typeof raw.isAutoupdate === 'boolean' ? raw.isAutoupdate : null,
    deactivateAccount:
      typeof raw.deactivateAccount === 'boolean'
        ? raw.deactivateAccount
        : false,
  };
}

/**
 * Update user in our backend database
 * @param userId - User ID
 * @param updateData - Data to update (driverStatus, zip, city, state, location, etc.)
 * @returns Promise with updated user data
 * @throws Error if update fails
 */
export async function updateUser(userId: string, updateData: {
  driverStatus?: string;
  zip?: string;
  city?: string;
  state?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  statusDate?: string;
}): Promise<any> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    let errorMessage = `Failed to update user. Status: ${response.status}`;
    let errorDetails: any = null;
    
    try {
      // Clone response to read it without consuming the stream
      const responseClone = response.clone();
      const errorData = await responseClone.json();
      errorDetails = errorData;
      
      
      // Backend may wrap error in { message: ... } or { data: { message: ... } }
      if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (errorData?.data?.message) {
        errorMessage = errorData.data.message;
      } else if (Array.isArray(errorData?.message)) {
        // Validation errors are often arrays
        errorMessage = errorData.message.join(', ');
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData) {
        // Try to stringify the whole error object
        errorMessage = JSON.stringify(errorData);
      }
    } catch (parseError) {
      // If JSON parsing fails, try to get text response
      try {
        const responseClone = response.clone();
        const textResponse = await responseClone.text();
        console.error('[updateUser] Error response text:', textResponse);
        if (textResponse) {
          errorMessage = textResponse;
        }
      } catch (textError) {
        console.error('[updateUser] Failed to read error response:', textError);
      }
    }
    
    const error = new Error(errorMessage);
    // Attach error details for better debugging
    (error as any).details = errorDetails;
    (error as any).status = response.status;
    throw error;
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

/**
 * Change password for currently authenticated user (self-service).
 * Backend validates that the user can change only their own password (or admin).
 */
export async function changePasswordForMobile(userId: string, newPassword: string): Promise<ChangePasswordResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${API_BASE_URL}/v1/users/${userId}/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ newPassword }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Failed to change password. Status: ${response.status}`);
  }

  // Backend wraps response in { data: {...} } format due to TransformInterceptor
  return (data.data || data) as ChangePasswordResponse;
}


