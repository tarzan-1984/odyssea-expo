/**
 * Theme configuration for Odyssea application
 * Centralized theme management with colors, typography, and spacing
 */

import { colors } from './colors';
import { fp, rem } from "@/lib/responsive";

// Define borderRadius first
const borderRadiusVar = {
  sm6: rem(6),
  sm: rem(8),
  sm10: rem(10),
  md: rem(12),
  lg: rem(16),
  xl: rem(20),
  full: 9999,
};


const fontsVar = {
  '700': 'Mulish-Bold',
  '400': 'Mulish-Regular',
  '600': 'Mulish-SemiBold',
  '500': 'Mulish-Medium',
  '300': 'Mulish-Light',
};

export const theme = {
  colors,
  
  fonts : fontsVar,
  
  // Typography
  typography: {
    // Headers
    h1: {
      fontSize: fp(36),
      fontWeight: 'bold' as const,
      fontFamily: 'Mulish-Bold',
      color: colors.primary.blue,
      letterSpacing: 2,
    },
    h2: {
      fontSize: fp(28),
      fontWeight: 'bold' as const,
      fontFamily: 'Mulish-Bold',
      color: colors.primary.blue,
      letterSpacing: 1.5,
    },
    h3: {
      fontSize: fp(24),
      fontWeight: 'bold' as const,
      fontFamily: 'Mulish-Bold',
      color: colors.neutral.black,
    },
    
    // Body text
    body: {
      fontSize: fp(16),
      fontWeight: '500' as const,
      fontFamily: 'Mulish-Medium',
      color: colors.neutral.black,
    },
    bodySecondary: {
      fontSize: 16,
      fontWeight: '500' as const,
      fontFamily: 'Mulish-Medium',
      color: colors.neutral.darkGrey,
    },
    
    buttonGreen: {
      backgroundColor: colors.primary.green,
      borderRadius: borderRadiusVar.sm10,
      width: '100%',
      height: rem(54),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rem(20),
    },
    
    // Buttons
    button: {
      fontSize: fp(16),
      fontFamily: fontsVar["500"],
      color: colors.primary.blue,
    },
    buttonSecondary: {
      fontSize: fp(16),
      fontWeight: '500' as const,
      fontFamily: 'Mulish-Medium',
      color: colors.primary.blue,
    },
    
    // Inputs
    input: {
      fontSize: fp(16),
      fontWeight: '500' as const,
      fontFamily: 'Mulish-Medium',
      color: colors.neutral.black,
    },
    placeholder: {
      fontSize: fp(16),
      fontWeight: '500' as const,
      fontFamily: 'Mulish-Medium',
      color: colors.neutral.darkGrey,
    },
  },
  
  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  
  // Shadows
  shadows: {
    sm: {
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      elevation: 2,
    },
    md: {
      boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
      elevation: 4,
    },
    lg: {
      boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.3)',
      elevation: 8,
    },
  },
  
  // Border radius
  borderRadius: borderRadiusVar,
} as const;



// Export individual parts for convenience
export const { typography, spacing, borderRadius, shadows, fonts } = theme;
