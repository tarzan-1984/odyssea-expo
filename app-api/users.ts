import { secureStorage } from '@/utils/secureStorage';
import { API_BASE_URL } from '@/lib/config';

export type UserResponse = {
  data: {
    data: any;
  };
};

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


