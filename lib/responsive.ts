import { Dimensions, PixelRatio, Platform } from 'react-native';

// Use 'screen' to get physical screen dimensions (includes system bars)
// This gives us the actual physical size of the screen, not just the available window
// On iOS, screen and window dimensions are usually the same
// On Android, screen dimensions include system bars, window dimensions don't
const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

// Base dimensions (iPhone 14 - physical screen dimensions from Dimensions.get('screen'))
// iPhone 14: 6.1" display, 1179x2556 physical pixels, ~460 PPI
// Actual physical dimensions confirmed from device: 390x844 (from Dimensions.get('screen'))
// On iPhone 14, screen and window dimensions are the same (390x844)
// Using Dimensions.get('screen') ensures accurate comparison across devices
// On Android devices (like Redmi Note 11), screen dimensions will be larger than window dimensions
// due to system bars, which correctly reflects the larger physical screen size
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
 * On base device (iPhone 14 - physical dimensions 390x844 from Dimensions.get('screen')), 
 * returns exactly the same value as passed
 * On larger screens (like Redmi Note 11): font size decreases to maintain visual proportions
 * On smaller screens: font size decreases slightly with soft coefficient
 * 
 * Problem: Without fp(), fontSize: 17 on iPhone 14 occupies ~28% of screen (normal),
 * but on Redmi Note 11 (larger physical screen) it occupies ~50% (too large).
 * 
 * Solution: Use iPhone 14 as base device with physical dimensions from Dimensions.get('screen').
 * On larger screens (Redmi), scale > 1.0, so font size will be reduced (enters scale > 1.0 condition).
 * This ensures text maintains similar visual proportion (~28% of screen) across devices.
 * 
 * Note: Using Dimensions.get('screen') to get physical screen dimensions (includes system bars).
 * Base dimensions (390x844) are confirmed from iPhone 14 console logs.
 * On Android, screen dimensions include system bars, so Redmi Note 11 will have larger values.
 * 
 * This function accounts for physical screen size differences to maintain consistent visual proportions.
 */
export const fp = (size: number): number => {
  // Calculate scale factors for width and height
  const widthScale = screenWidth / baseWidth;
  const heightScale = screenHeight / baseHeight;
  
  // Use average of both scales to account for both dimensions
  // For base device (iPhone 14 - 390x844): (1.0 + 1.0) / 2 = 1.0
  // For Redmi Note 11 (physical screen dimensions from Dimensions.get('screen')):
  // Screen dimensions will be larger than 390x844 due to system bars being included
  // This correctly reflects the larger physical screen size (6.43" vs 6.1")
  let scale = (widthScale + heightScale) / 2;
  
  // Apply inverse scaling to maintain visual proportions across different screen sizes
  // Problem: On larger screens (Redmi), same fontSize looks huge (50% of screen)
  // Solution: Decrease font size on larger screens to maintain same visual proportion
  //
  // CONDITION LOGIC:
  // - If screen is SMALLER than base (iPhone 14): scale < 1.0 → enters first condition
  //   Font size decreases slightly to maintain proportions
  // - If screen is LARGER than base: scale > 1.0 → enters second condition
  //   Font size decreases more aggressively to prevent oversized text
  // - If screen equals base (iPhone 14): scale = 1.0 → skips both conditions, keeps scale = 1.0
  //
  if (scale < 1.0) {
    // Smaller screens: softer decrease to prevent text from being too small
    // Formula: adjustedScale = scale * 0.6 + 0.4
    // Example: if scale = 0.95 (5% smaller), adjustedScale = 0.95 * 0.6 + 0.4 = 0.97 (only 3% smaller)
    scale = scale * 0.6 + 0.4;
  } else if (scale > 1.0) {
    // Larger screens: decrease font size MORE aggressively to maintain visual proportions
    // Problem: On Redmi (scale ≈ 1.02), text occupies 50% instead of 28% (needs ~44% reduction)
    // Solution: Use more aggressive inverse scaling
    // Formula: invertedScale = 1 / (scale * coefficient1 + coefficient2)
    // Use coefficient 0.5 + 0.5 to make reduction more noticeable
    // Example: if scale = 1.02 (2% larger screen), invertedScale = 1 / (1.02 * 0.5 + 0.5) = 1 / 1.01 ≈ 0.99 (1% smaller)
    // For more aggressive: use scale * 0.4 + 0.6 for even softer base, or adjust coefficients
    // More aggressive approach: scale = 1 / (scale * 0.6 + 0.4)
    // This ensures text on larger screens is reduced enough to maintain proportions
    scale = 1 / (scale * 0.4 + 0.8);
  }
  // If scale === 1.0 (base device), keep it as is
  
  const newSize = size * scale;
  
  // Round to nearest pixel
  const rounded = PixelRatio.roundToNearestPixel(newSize);
  
  // Cap to original size: never exceed the original size to prevent oversized fonts
  // On smaller screens, font decreases with softer coefficient
  // On larger screens, font decreases to maintain visual proportions
  return Math.min(rounded, size);
};

/**
 * Get responsive padding/margin (like rem)
 * @param size - size in base units
 * @returns responsive size
 * On base device (iPhone 14 - 390x844), returns exactly the same value as passed
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