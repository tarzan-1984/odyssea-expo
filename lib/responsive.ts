import { Dimensions, PixelRatio, Platform } from 'react-native';

// Base dimensions (iPhone 14 — logical size used as design reference, ~390×844)
const baseWidth = 390;
const baseHeight = 844;
/** Height/width for iPhone 14 — used to correct font scale when aspect ratio differs (e.g. tall Android phones). */
const baseAspectRatio = baseHeight / baseWidth;

/**
 * Metrics for scaling: read on each call so rotation / late layout are reflected.
 * On Android, `screen` includes system bars and inflates height vs the visible app area — that skewed
 * fp/rem toward "larger than iPhone" on devices like Redmi. Prefer `window` on Android.
 * On iOS, `screen` matches the design baseline for iPhone 14 (same as window in typical cases).
 */
function getMetrics(): { width: number; height: number } {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  if (Platform.OS === 'android') {
    return { width: window.width, height: window.height };
  }
  return { width: screen.width, height: screen.height };
}

/**
 * Get responsive width based on screen width
 * @param size - size in base units (like rem)
 * @returns responsive width
 */
export const wp = (size: number): number => {
  const { width } = getMetrics();
  return (width * size) / baseWidth;
};

/**
 * Get responsive height based on screen height
 * @param size - size in base units (like rem)
 * @returns responsive height
 */
export const hp = (size: number): number => {
  const { height } = getMetrics();
  return (height * size) / baseHeight;
};

/**
 * Responsive font size — design baseline iPhone 14 (390×844).
 * Uses window metrics on Android; width-weighted scale + aspect-ratio tweak vs iPhone 14
 * so tall/narrow devices do not get oversized type.
 */
export const fp = (size: number): number => {
  const { width: w, height: h } = getMetrics();
  const widthScale = w / baseWidth;
  const heightScale = h / baseHeight;

  // Weight width more than height: line length and perceived type scale follow width first
  // (tall phones no longer get an oversized fp from height alone).
  // Slightly more weight on width so tall phones do not inflate type
  const layoutScale = widthScale * 0.7 + heightScale * 0.3;
  let scale = layoutScale;

  if (scale < 1.0) {
    scale = scale * 0.6 + 0.4;
  } else if (scale > 1.0) {
    scale = 1 / (scale * 0.2 + 0.5);
  }

  const aspect = h / w;
  const aspectVsBase = aspect / baseAspectRatio;
  // Taller than iPhone 14: reduce more aggressively (e.g. Redmi-class aspect)
  let aspectMod = 1;
  if (aspectVsBase > 1.005) {
    aspectMod = Math.pow(baseAspectRatio / aspect, 0.72);
  } else if (aspectVsBase < 0.985) {
    aspectMod = Math.pow(aspect / baseAspectRatio, 0.22);
  }

  // At same logical dp, Android often renders body text a bit larger than iOS
  const platformMod = Platform.OS === 'android' ? 0.93 : 1;

  // One rounding pass at the end so small multipliers (e.g. 0.96) are not erased by round(min(round(...))).
  let out = size * scale * aspectMod * platformMod;
  out = Math.min(out, size);

  // Logical size above iPhone 14 baseline: shrink vs design cap (after cap so it always applies).
  if (layoutScale > 1.002) {
    const excess = Math.min(layoutScale - 1, 0.24);
    const mod = 1 - excess * 0.62;
    out *= mod;
  } else if (Platform.OS === 'android' && aspectVsBase > 1.003) {
    // Tall narrow Android (e.g. Redmi ~360×800): multiplier must cross pixel steps after roundToNearestPixel.
    out *= 0.86;
  }

  const rounded = PixelRatio.roundToNearestPixel(out);
  return Math.max(1, rounded);
};

/**
 * Get responsive padding/margin (like rem) — same width/height weights as fp, without aspect modifier.
 */
export const rem = (size: number): number => {
  const { width: w, height: h } = getMetrics();
  const widthScale = w / baseWidth;
  const heightScale = h / baseHeight;
  const scale = widthScale * 0.7 + heightScale * 0.3;

  const newSize = size * scale;
  const rounded = PixelRatio.roundToNearestPixel(newSize);
  return Math.min(rounded, size);
};

/**
 * Get responsive border radius
 * @param size - radius in base units
 * @returns responsive radius
 */
export const br = (size: number): number => {
  const { width, height } = getMetrics();
  const scale = Math.min(width / baseWidth, height / baseHeight);
  return size * scale;
};

/**
 * Get responsive size with more aggressive scaling for small screens
 * @param size - size in base units
 * @returns responsive size
 */
export const remSmall = (size: number): number => {
  const { width, height } = getMetrics();
  const scale = Math.min(width / baseWidth, height / baseHeight);
  const adjustedScale = scale < 0.9 ? scale * 0.9 : scale;
  return size * adjustedScale;
};

function getScreenDimensionsSnapshot() {
  const { width, height } = getMetrics();
  return {
    width,
    height,
    isSmallScreen: width < 375,
    isMediumScreen: width >= 375 && width < 414,
    isLargeScreen: width >= 414,
  };
}

/** Current window/screen metrics (updates when read — prefer over caching at module load). */
export const screenDimensions = {
  get width() {
    return getScreenDimensionsSnapshot().width;
  },
  get height() {
    return getScreenDimensionsSnapshot().height;
  },
  get isSmallScreen() {
    return getScreenDimensionsSnapshot().isSmallScreen;
  },
  get isMediumScreen() {
    return getScreenDimensionsSnapshot().isMediumScreen;
  },
  get isLargeScreen() {
    return getScreenDimensionsSnapshot().isLargeScreen;
  },
};