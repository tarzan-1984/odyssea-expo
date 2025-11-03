/**
 * Application configuration
 * Handles environment variables for Expo
 * 
 * In Expo, environment variables must be prefixed with EXPO_PUBLIC_
 * to be accessible in the app
 */

// Get API_BASE_URL from Expo environment variables
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const WS_URL = process.env.EXPO_PUBLIC_WS_URL;

// Validation
if (!API_BASE_URL) {
  console.warn('⚠️ API_BASE_URL is not defined! Please check your .env file');
  console.warn('Make sure you have EXPO_PUBLIC_API_BASE_URL in your .env file');
} else {
  console.log('✅ API configured:', API_BASE_URL);
}

if (!WS_URL) {
  console.warn('⚠️ WS_URL is not defined! Please check your .env file');
  console.warn('Make sure you have EXPO_PUBLIC_WS_URL in your .env file');
} else {
  console.log('✅ WebSocket configured:', WS_URL);
}

export { API_BASE_URL, WS_URL };

export const config = {
  API_BASE_URL,
  WS_URL,
  // Add other config values here as needed
} as const;
