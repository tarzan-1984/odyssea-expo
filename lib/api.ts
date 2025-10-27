import { config } from './config';

/**
 * Get API base URL with fallback
 */
const getApiBaseUrl = (): string => {
  return config.API_BASE_URL;
};

/**
 * Test server connectivity
 */
export const testServerConnection = async (): Promise<boolean> => {
  const baseUrl = getApiBaseUrl();
  const testUrl = `${baseUrl}/`; // Try root endpoint
  
  try {
    console.log('Testing server connection to:', testUrl);
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    console.log('Server test response status:', response.status);
    // Server is reachable if we get any response (even 404)
    return response.status !== undefined;
  } catch (error) {
    console.log('Server test failed:', error);
    return false;
  }
};

/**
 * Simple API function for email validation
 */
export const login = async (email: string, password: string) => {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/v1/auth/login`;
  
  console.log('=== LOGIN DEBUG INFO ===');
  console.log('API_BASE_URL from config:', config.API_BASE_URL);
  console.log('Final base URL:', baseUrl);
  console.log('Full login URL:', url);
  console.log('Email:', email);
  console.log('Password length:', password.length);
  console.log('========================');
  
  // Test server connection first
  console.log('Testing server connection...');
  const isServerReachable = await testServerConnection();
  if (!isServerReachable) {
    throw new Error(`Server is not reachable at ${baseUrl}. Please check if the server is running and accessible.`);
  }
  
  try {
    console.log('Starting login request...');
    
    const requestBody = JSON.stringify({ 
      email,
      password
    });
    
    console.log('Request body:', requestBody);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: requestBody,
    });

    console.log('Response received:');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers:', response.headers ? Object.fromEntries(response.headers.entries()) : 'No headers');

    // Check if response is ok before parsing JSON
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        console.log('Error response data:', errorData);
        errorMessage = errorData.message || errorMessage;
      } catch (parseError) {
        console.warn('Could not parse error response:', parseError);
        // Try to get response as text
        try {
          const errorText = await response.text();
          console.log('Error response text:', errorText);
          errorMessage = errorText || errorMessage;
        } catch (textError) {
          console.warn('Could not get error response as text:', textError);
        }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Login successful:', data);
    return data;
    
  } catch (error) {
    console.error('=== API ERROR DETAILS ===');
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);
    console.error('Error message:', (error as Error)?.message);
    console.error('Error stack:', (error as Error)?.stack);
    console.error('========================');
    
    // Provide more specific error messages
    if (error instanceof TypeError && error.message === 'Network request failed') {
      throw new Error(`Network connection failed. Please check:
1. Backend server is running at ${baseUrl}
2. CORS is properly configured on the server
3. Network connectivity is working
4. URL is accessible from your device/simulator
5. Server supports HTTPS (onrender.com should work)
6. Check if the endpoint /v1/auth/login exists on the server`);
    }
    
    throw error;
  }
};
