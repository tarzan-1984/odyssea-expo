import { Dimensions, PixelRatio } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Base dimensions (iPhone 12/13/14 - 390x844)
const baseWidth = 390;
const baseHeight = 844;

/**
 * Get responsive width based on screen width
 * @param size - size in base units (like rem)
 * @returns responsive width
 */
export const wp = (size: number): number => {
  return (screenWidth * size) / baseWidth;
};

/**
 * Get responsive height based on screen height
 * @param size - size in base units (like rem)
 * @returns responsive height
 */
export const hp = (size: number): number => {
  return (screenHeight * size) / baseHeight;
};

/**
 * Get responsive font size
 * @param size - font size in base units
 * @returns responsive font size
 */
export const fp = (size: number): number => {
  const scale = Math.min(screenWidth / baseWidth, screenHeight / baseHeight);
  const newSize = size * scale;
  
  // Ensure minimum font size for readability
  return Math.max(newSize, 12);
};

/**
 * Get responsive padding/margin (like rem)
 * @param size - size in base units
 * @returns responsive size
 */
export const rem = (size: number): number => {
  const scale = Math.min(screenWidth / baseWidth, screenHeight / baseHeight);
  return size * scale;
};

/**
 * Get responsive border radius
 * @param size - radius in base units
 * @returns responsive radius
 */
export const br = (size: number): number => {
  const scale = Math.min(screenWidth / baseWidth, screenHeight / baseHeight);
  return size * scale;
};

/**
 * Get responsive size with more aggressive scaling for small screens
 * @param size - size in base units
 * @returns responsive size
 */
export const remSmall = (size: number): number => {
  const scale = Math.min(screenWidth / baseWidth, screenHeight / baseHeight);
  // More aggressive scaling for small screens
  const adjustedScale = scale < 0.9 ? scale * 0.9 : scale;
  return size * adjustedScale;
};

// Screen dimensions
export const screenDimensions = {
  width: screenWidth,
  height: screenHeight,
  isSmallScreen: screenWidth < 375,
  isMediumScreen: screenWidth >= 375 && screenWidth < 414,
  isLargeScreen: screenWidth >= 414,
};