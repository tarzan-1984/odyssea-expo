// Authentication related types
export interface User {
  id: string;
  email: string;
  name: string;
  isVerified: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface VerificationMethod {
  type: 'call' | 'sms' | 'email';
  contact: string;
}

export interface VerificationCode {
  code: string;
  method: VerificationMethod;
}
