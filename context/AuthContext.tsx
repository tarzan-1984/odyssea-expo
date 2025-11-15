import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { secureStorage } from '@/utils/secureStorage';
import { authApi, CheckEmailResponse, LoginResponse, OtpVerificationResponse } from '@/services/authApi';
import { registerForPushNotificationsAsync, registerPushTokenToBackend } from '@/services/NotificationsService';

// User interface
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  [key: string]: any;
}

// Auth state interface
export interface AuthState {
  isLoading: boolean;
  error: string | null;
  userEmail: string | null;
  password: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  userLocation: {
    latitude: number;
    longitude: number;
  } | null;
  userZipCode: string | null;
  lastLocationUpdate: Date | null;
}

// Context value interface
export interface AuthContextValue {
  authState: AuthState;
  checkEmailAndGeneratePassword: (email: string) => Promise<CheckEmailResponse>;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verifyOtp: (email: string, otpCode: string) => Promise<OtpVerificationResponse>;
  resendOtp: () => Promise<LoginResponse>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
  resetAuthState: () => void;
  updateUserLocation: (latitude: number, longitude: number, zipCode: string) => Promise<void>;
  clearUserLocation: () => Promise<void>;
  updateUserAvatar: (avatarUrl: string) => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Provider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: false,
    error: null,
    userEmail: null,
    password: null,
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    userLocation: null,
    userZipCode: null,
    lastLocationUpdate: null,
  });

  const checkEmailAndGeneratePassword = useCallback(async (email: string): Promise<CheckEmailResponse> => {
    setAuthState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      userEmail: email,
    }));

    try {
      const result = await authApi.checkEmailAndGeneratePassword(email);
      
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      throw error;
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResponse> => {
    setAuthState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const result = await authApi.login(email, password);
      
      // Log OTP response
      if (result.success) {
        console.log('✅ [AuthContext] OTP Response:', result.message || 'OTP code sent successfully');
      }
      
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: result.success ? null : result.error || null,
        // Save email and password for resend OTP functionality
        userEmail: result.success ? email : prev.userEmail,
        password: result.success ? password : prev.password,
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, otpCode: string): Promise<OtpVerificationResponse> => {
    console.log('🔐 [AuthContext] Verifying OTP for email:', email);
    
    setAuthState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const result = await authApi.verifyOtp(email, otpCode);
      
      // Log full response for debugging
      console.log('📦 [AuthContext] Full OTP Verification Response:', JSON.stringify(result, null, 2));
      
      if (result.success && result.data?.data) {
        const { accessToken, refreshToken, user } = result.data.data;
        
        console.log('✅ [AuthContext] OTP verified successfully!');
        console.log('👤 [AuthContext] User data:', JSON.stringify(user, null, 2));
        console.log('🔑 [AuthContext] Access token received:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');
        console.log('🔄 [AuthContext] Refresh token received:', refreshToken ? `${refreshToken.substring(0, 20)}...` : 'null');
        
        // Save tokens to secure storage
        try {
          await secureStorage.setItemAsync('accessToken', accessToken);
          await secureStorage.setItemAsync('refreshToken', refreshToken);
          await secureStorage.setItemAsync('user', JSON.stringify(user));
          console.log('💾 [AuthContext] Tokens and user saved');
        } catch (storeError) {
          console.error('❌ [AuthContext] Failed to save:', storeError);
        }
        
        // Update state
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          password: null, // Clear password after successful auth
          error: null,
        }));

        // Register push token after successful authentication
        try {
          console.log('[AuthContext] Registering push token after login...');
          
          // Check if token already exists
          const existingToken = await secureStorage.getItemAsync("expoPushToken").catch(() => null);
          let pushToken = existingToken;

          // Get new token if doesn't exist
          if (!pushToken) {
            pushToken = await registerForPushNotificationsAsync();
            if (pushToken) {
              // Save token to secureStorage
              await secureStorage.setItemAsync("expoPushToken", pushToken).catch(() => {});
              console.log('[AuthContext] ✅ Push token saved to secureStorage');
            }
          } else {
            console.log('[AuthContext] Push token already exists in secureStorage');
          }

          // Register token on backend
          if (pushToken) {
            await registerPushTokenToBackend(pushToken, accessToken);
          } else {
            console.warn('[AuthContext] Failed to get push token, will retry on app start');
          }
        } catch (pushError) {
          console.error('[AuthContext] Error registering push token after login:', pushError);
          // Don't fail authentication if push token registration fails
        }
      } else {
        console.warn('⚠️ [AuthContext] OTP verification failed:', result.error || 'Unknown error');
        
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'OTP verification failed',
        }));
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OTP verification failed';
      console.error('❌ [AuthContext] OTP verification error:', errorMessage);
      
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  const resendOtp = useCallback(async (): Promise<LoginResponse> => {
    if (!authState.userEmail || !authState.password) {
      const errorMsg = 'Email or password not found. Please login again.';
      
      setAuthState(prev => ({
        ...prev,
        error: errorMsg,
      }));
      
      return {
        success: false,
        error: errorMsg,
      };
    }

    // Reuse the login method to resend OTP (will log OTP response)
    return await login(authState.userEmail, authState.password);
  }, [authState.userEmail, authState.password, login]);

  const loadStoredAuth = useCallback(async () => {
    console.log('🔄 [AuthContext] Loading stored auth...');
    
    try {
      // Load from secure storage
      const accessToken = await secureStorage.getItemAsync('accessToken');
      const refreshToken = await secureStorage.getItemAsync('refreshToken');
      const userJson = await secureStorage.getItemAsync('user');
      const locationJson = await secureStorage.getItemAsync('userLocation');
      
      let userLocation = null;
      let userZipCode = null;
      let lastLocationUpdate = null;
      
      // Load location data if available
      if (locationJson) {
        try {
          const locationData = JSON.parse(locationJson);
          userLocation = { latitude: locationData.latitude, longitude: locationData.longitude };
          userZipCode = locationData.zipCode || null;
          
          // Parse last update time if available
          if (locationData.lastUpdate) {
            lastLocationUpdate = new Date(locationData.lastUpdate);
          }
          
          console.log('📍 [AuthContext] Found stored location data');
        } catch (locError) {
          console.warn('⚠️ [AuthContext] Failed to parse location data:', locError);
        }
      }
      
      if (accessToken && refreshToken && userJson) {
        const user = JSON.parse(userJson);
        
        console.log('✅ [AuthContext] Found stored auth data');
        console.log('👤 [AuthContext] User:', user.email);
        console.log('🔑 [AuthContext] Access token:', accessToken.substring(0, 20) + '...');
        
        setAuthState({
          isLoading: false,
          error: null,
          userEmail: user.email,
          password: null,
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          userLocation,
          userZipCode,
          lastLocationUpdate,
        });
        
        console.log('✅ [AuthContext] Auth state restored');
      } else {
        console.log('ℹ️ [AuthContext] No stored auth data found');
      }
    } catch (error) {
      console.error('❌ [AuthContext] Failed to load stored auth:', error);
    }
  }, []);

  const updateUserLocation = useCallback(async (latitude: number, longitude: number, zipCode: string) => {
    console.log('📍 [AuthContext] Updating user location:', { latitude, longitude, zipCode });
    
    const now = new Date();
    const locationData = { 
      latitude, 
      longitude, 
      zipCode,
      lastUpdate: now.toISOString() // Save as ISO string for JSON serialization
    };
    
    // Save to secure storage
    try {
      await secureStorage.setItemAsync('userLocation', JSON.stringify(locationData));
      console.log('💾 [AuthContext] Location saved to storage');
    } catch (error) {
      console.error('❌ [AuthContext] Failed to save location:', error);
    }
    
    // Update state
    setAuthState(prev => ({
      ...prev,
      userLocation: { latitude, longitude },
      userZipCode: zipCode,
      lastLocationUpdate: now,
    }));
  }, []);

  const clearUserLocation = useCallback(async () => {
    console.log('🗑️ [AuthContext] Clearing user location');
    
    // Clear from secure storage
    try {
      await secureStorage.deleteItemAsync('userLocation');
      console.log('💾 [AuthContext] Location cleared from storage');
    } catch (error) {
      console.error('❌ [AuthContext] Failed to clear location:', error);
    }
    
    // Update state
    setAuthState(prev => ({
      ...prev,
      userLocation: null,
      userZipCode: null,
      lastLocationUpdate: null,
    }));
  }, []);

  const updateUserAvatar = useCallback(async (avatarUrl: string) => {
    if (!authState.user) return;
    const updatedUser = { ...authState.user, profilePhoto: avatarUrl, avatar: avatarUrl } as User;

    try {
      await secureStorage.setItemAsync('user', JSON.stringify(updatedUser));
      console.log('💾 [AuthContext] Avatar saved to storage');
    } catch (error) {
      console.error('❌ [AuthContext] Failed to save avatar:', error);
    }

    setAuthState(prev => ({
      ...prev,
      user: updatedUser,
    }));
  }, [authState.user]);

  const resetAuthState = useCallback(async () => {
    console.log('🔄 [AuthContext] Resetting auth state and clearing all app data');
    
    try {
      // Clear secure storage (user data, tokens, location, push token)
      await secureStorage.deleteItemAsync('accessToken');
      await secureStorage.deleteItemAsync('refreshToken');
      await secureStorage.deleteItemAsync('user');
      await secureStorage.deleteItemAsync('userLocation');
      await secureStorage.deleteItemAsync('expoPushToken');
      console.log('💾 [AuthContext] Cleared secure storage (including push token)');
      
      // Clear chat messages cache
      const { messagesCacheService } = await import('@/services/MessagesCacheService');
      await messagesCacheService.clearAllMessages();
      console.log('💾 [AuthContext] Cleared messages cache');
      
      // Clear chat rooms cache
      const { chatCacheService } = await import('@/services/ChatCacheService');
      await chatCacheService.clearCache();
      console.log('💾 [AuthContext] Cleared chat rooms cache');
      
      // Clear chat store (Zustand in-memory state)
      const { useChatStore } = await import('@/stores/chatStore');
      useChatStore.getState().reset();
      console.log('💾 [AuthContext] Cleared chat store (in-memory state)');
      
      // Clear app settings and pending location updates
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem('@odyssea_app_settings');
      await AsyncStorage.removeItem('@pending_location_update');
      await AsyncStorage.removeItem('@location_last_update');
      console.log('💾 [AuthContext] Cleared app settings and pending location updates');
      
      // Disconnect WebSocket if connected
      const { eventBus, AppEvents } = await import('@/services/EventBus');
      eventBus.emit(AppEvents.WebSocketDisconnect);
      console.log('💾 [AuthContext] Disconnected WebSocket');
      
      console.log('✅ [AuthContext] All app data cleared successfully');
    } catch (error) {
      console.error('❌ [AuthContext] Failed to clear some data:', error);
      // Continue with state reset even if some cleanup failed
    }
    
    // Reset auth state
    setAuthState({
      isLoading: false,
      error: null,
      userEmail: null,
      password: null,
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      userLocation: null,
      userZipCode: null,
      lastLocationUpdate: null,
    });
  }, []);

  const value: AuthContextValue = {
    authState,
    checkEmailAndGeneratePassword,
    login,
    verifyOtp,
    resendOtp,
    loadStoredAuth,
    clearError,
    resetAuthState,
    updateUserLocation,
    clearUserLocation,
    updateUserAvatar,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};
