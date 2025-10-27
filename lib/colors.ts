/**
 * Color palette for Odyssea application
 * Based on design system and brand guidelines
 */

export const colors = {
  // Primary colors
  primary: {
    blue: '#292966',        // Main brand blue for buttons and active states
    lightBlue: '#5AC8FA',   // Light blue for profile and secondary elements
    green: '#70FFAE',
    violet: '#6066C5',
  },

  // Secondary colors
  secondary: {
  
  },

  // Neutral colors
  neutral: {
    black: '#000000',       // Main text color
    white: '#ffffff',       // Background and text on colored backgrounds
    darkGrey: '#8E8E93',    // Placeholder text and secondary text
    mediumGrey: '#C7C7CC',  // Disabled buttons and inactive elements
    lightGrey: '#E0E0E0',   // Borders and dividers
    veryLightGrey: '#F0F0F0', // Inactive elements and subtle backgrounds
    mapGrey: '#F5F5F5',     // Map background
    inputGrey: '#F8F8F8',   // Input field backgrounds
  },

  // Semantic colors
  semantic: {
    success: '#34C759',     // Success states
    error: '#FF3B30',       // Error states (if needed)
    warning: '#FF9500',     // Warning states (if needed)
    info: '#007AFF',        // Info states
  },

  // Overlay colors
  overlay: {
    modal: 'rgba(0, 0, 0, 0.5)', // Modal overlay
  },
} as const;

// Type for color keys
export type ColorKey = keyof typeof colors;
export type PrimaryColorKey = keyof typeof colors.primary;
export type SecondaryColorKey = keyof typeof colors.secondary;
export type NeutralColorKey = keyof typeof colors.neutral;
export type SemanticColorKey = keyof typeof colors.semantic;
