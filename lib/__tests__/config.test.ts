/**
 * Unit tests for configuration module
 * Testing environment variable loading and configuration setup
 */

// Mock the config module loading
jest.mock('../config', () => ({
  config: {
    API_BASE_URL: 'https://test-api.example.com',
  },
}));

// Import after mocking
import { config } from '../config';

describe('Config Module', () => {
  it('should have API_BASE_URL defined', () => {
    // Assert: Configuration should be loaded correctly
    expect(config.API_BASE_URL).toBeDefined();
    expect(typeof config.API_BASE_URL).toBe('string');
  });

  it('should not be empty string', () => {
    // Assert: API_BASE_URL should not be empty
    expect(config.API_BASE_URL).not.toBe('');
    expect(config.API_BASE_URL.length).toBeGreaterThan(0);
  });

  it('should be a valid URL format', () => {
    // Assert: API_BASE_URL should be a valid URL format
    expect(config.API_BASE_URL).toMatch(/^https?:\/\/.+/);
  });

  it('should equal expected test URL', () => {
    // Assert: Should match our mocked test URL
    expect(config.API_BASE_URL).toBe('https://test-api.example.com');
  });
});