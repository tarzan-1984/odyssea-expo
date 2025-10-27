/**
 * Unit tests for API functions
 * Testing business logic for authentication API calls
 */

// Mock the fetch globally 
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Mock the config module to provide test API URL
jest.mock('../config', () => ({
  config: {
    API_BASE_URL: 'https://test-api.example.com',
  },
}));

// Import after mocking
import { login, testServerConnection } from '../api';

describe('API Functions', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    mockFetch.mockClear();
  });

  describe('testServerConnection', () => {
    it('should return true when server responds with any status', async () => {
      // Arrange: Mock successful response (even 404 means server is reachable)
      mockFetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
      } as Response);

      // Act: Test server connection
      const result = await testServerConnection();
      
      // Assert: Should return true and make correct API call
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.example.com/',
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      );
    });

    it('should return false when network request fails', async () => {
      // Arrange: Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Act: Test server connection  
      const result = await testServerConnection();
      
      // Assert: Should return false when network fails
      expect(result).toBe(false);
    });

    it('should return true for successful 200 response', async () => {
      // Arrange: Mock successful response
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
      } as Response);

      // Act: Test server connection
      const result = await testServerConnection();
      
      // Assert: Should return true for successful response
      expect(result).toBe(true);
    });
  });

  describe('login', () => {
    const testEmail = 'test@example.com';
    const testPassword = 'password123';

    it('should throw error if server is not reachable', async () => {
      // Arrange: Mock server unreachable for testServerConnection
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Act & Assert: Should throw error when server is unreachable
      await expect(login(testEmail, testPassword)).rejects.toThrow(
        'Server is not reachable at https://test-api.example.com. Please check if the server is running and accessible.'
      );
    });

    it('should make login request when server is reachable', async () => {
      // Arrange: Mock server reachable for testServerConnection
      mockFetch
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
        } as Response)
        // Mock successful login response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map(),
          json: async () => ({
            success: true,
            token: 'test-token',
            user: { id: 1, email: testEmail }
          }),
        } as Response);

      // Act: Attempt login
      const result = await login(testEmail, testPassword);

      // Assert: Should make correct API calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(2, 
        'https://test-api.example.com/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            email: testEmail,
            password: testPassword,
          }),
        }
      );

      expect(result).toEqual({
        success: true,
        token: 'test-token',
        user: { id: 1, email: testEmail }
      });
    });

    it('should throw error for failed login attempt', async () => {
      // Arrange: Mock server reachable but login fails
      mockFetch
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
        } as Response)
        // Mock failed login response
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Map(),
          json: async () => ({
            error: 'Invalid credentials'
          }),
        } as Response);

      // Act & Assert: Should throw error for failed login
      await expect(login(testEmail, testPassword)).rejects.toThrow(
        'HTTP 401: Unauthorized'
      );
    });

    it('should handle network error during login', async () => {
      // Arrange: Mock server reachable but network fails during login
      mockFetch
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
        } as Response)
        // Mock network error during login
        .mockRejectedValueOnce(new Error('Network request failed'));

      // Act & Assert: Should throw network error
      await expect(login(testEmail, testPassword)).rejects.toThrow(
        'Network request failed'
      );
    });
  });
});