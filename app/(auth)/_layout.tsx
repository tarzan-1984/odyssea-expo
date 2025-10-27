import { Stack } from 'expo-router';

/**
 * Auth Stack Layout
 * Handles authentication flow screens with Expo Router
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="enter-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="verify-method" />
      <Stack.Screen name="send-code" />
      <Stack.Screen name="verify-code" />
      <Stack.Screen name="final-verify" />
    </Stack>
  );
}

