import { API_BASE_URL } from '@/lib/config';

export interface CheckEmailResponse {
  data: {
    message: string;
    redirectUrl: string;
  };
  timestamp: string;
  path: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  data?: {
    data?: {
      accessToken: string;
      refreshToken: string;
      user: any;
      message?: string;
    };
  };
  error?: string;
}

export interface OtpVerificationResponse {
  success: boolean;
  message?: string;
  data?: {
    data?: {
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        [key: string]: any;
      };
    };
  };
  error?: string;
}

class AuthApiService {
  private baseUrl: string;

  constructor() {
    if (!API_BASE_URL) {
      throw new Error('API_BASE_URL is not defined in environment variables');
    }
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Check if email exists and handle password generation/sending
   * @param email - User's email address
   * @returns Promise with check result
   */
  async checkEmailAndGeneratePassword(email: string): Promise<CheckEmailResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/auth/login_email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('Auth API Error:', error);
      throw new Error(
        error instanceof Error 
          ? error.message 
          : 'Network error occurred while checking email'
      );
    }
  }

  /**
   * Login with email and password
   * @param email - User's email
   * @param password - User's password
   * @returns Promise with login result
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/auth/login_password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, isMobile: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP error! status: ${response.status}`,
        };
      }

      return {
        success: true,
        message: data.message || 'OTP code sent to your email',
        data: data,
      };
    } catch (error) {
      console.error('❌ [AuthAPI] Login error:', error);
      return {
        success: false,
        error: error instanceof Error 
          ? error.message 
          : 'Network error occurred during login',
      };
    }
  }

  /**
   * Verify OTP code
   * @param email - User's email
   * @param otpCode - OTP code
   * @returns Promise with verification result
   */
  async verifyOtp(email: string, otpCode: string): Promise<OtpVerificationResponse> {
    try {
      
      const response = await fetch(`${this.baseUrl}/v1/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP error! status: ${response.status}`,
        };
      }

      return {
        success: true,
        message: data.message || 'OTP verified successfully',
        data: data,
      };
    } catch (error) {
      console.error('❌ [AuthAPI] OTP Verification error:', error);
      return {
        success: false,
        error: error instanceof Error 
          ? error.message 
          : 'Network error occurred during OTP verification',
      };
    }
  }
}

export const authApi = new AuthApiService();
