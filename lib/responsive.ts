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
 * On base device (390x844), returns exactly the same value as passed
 */
export const fp = (size: number): number => {
  // Use width-based scaling for font sizes (more consistent across devices)
  // For base device (390x844), screenWidth / baseWidth = 390 / 390 = 1.0
  const scale = screenWidth / baseWidth;
  const newSize = size * scale;
  
  // Return scaled size rounded to nearest pixel, capped to original size
  const rounded = PixelRatio.roundToNearestPixel(newSize);
  return Math.min(rounded, size);
};

/**
 * Get responsive padding/margin (like rem)
 * @param size - size in base units
 * @returns responsive size
 * On base device (390x844), returns exactly the same value as passed
 * Uses average of width and height scaling to account for both dimensions
 */
export const rem = (size: number): number => {
  // Calculate scale factors for width and height
  const widthScale = screenWidth / baseWidth;
  const heightScale = screenHeight / baseHeight;
  
  // Use average of both scales to account for both dimensions
  // For base device (390x844): (1.0 + 1.0) / 2 = 1.0
  const scale = (widthScale + heightScale) / 2;
  
  const newSize = size * scale;
  
  // Return scaled size rounded to nearest pixel, capped to original size
  const rounded = PixelRatio.roundToNearestPixel(newSize);
  return Math.min(rounded, size);
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