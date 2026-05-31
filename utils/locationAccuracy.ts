import { Platform } from 'react-native';
import * as Location from 'expo-location';

/** Max GPS accuracy for one-shot fixes (Share location, status, immediate ping). */
export function bestLocationAccuracy(): Location.Accuracy {
  return Platform.OS === 'ios'
    ? Location.Accuracy.BestForNavigation
    : Location.Accuracy.Highest;
}

/** Ordered fallbacks when the best fix times out (never use Lowest — too imprecise). */
export const CURRENT_POSITION_ACCURACY_CHAIN: Location.Accuracy[] =
  Platform.OS === 'ios'
    ? [
        Location.Accuracy.BestForNavigation,
        Location.Accuracy.Highest,
        Location.Accuracy.High,
        Location.Accuracy.Balanced,
      ]
    : [
        Location.Accuracy.Highest,
        Location.Accuracy.High,
        Location.Accuracy.Balanced,
      ];

/**
 * Request current position starting from best accuracy; fall back only on failure.
 */
export async function getBestCurrentPositionAsync(): Promise<Location.LocationObject> {
  let lastError: unknown;
  for (const accuracy of CURRENT_POSITION_ACCURACY_CHAIN) {
    try {
      return await Location.getCurrentPositionAsync({ accuracy });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Cannot obtain current location');
}

export function formatGpsAccuracyLog(coords: Location.LocationObjectCoords): string {
  const acc =
    typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy)
      ? `±${Math.round(coords.accuracy)}m`
      : 'accuracy unknown';
  return `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)} (${acc})`;
}
