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
const COMPANY = process.env.EXPO_PUBLIC_COMPANY;

// Optional: MapTiler Cloud key for detailed map tiles (see utils/mapTileLayer.ts)
const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

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

if (MAPTILER_API_KEY) {
  console.log('✅ MapTiler tiles: key configured');
}

export { API_BASE_URL, WS_URL, MAPTILER_API_KEY };
export { COMPANY };

export const config = {
  API_BASE_URL,
  WS_URL,
  COMPANY,
} as const;
