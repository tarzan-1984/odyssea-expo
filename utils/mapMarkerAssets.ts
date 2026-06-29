import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

export type MapMarkerImageUris = {
  pickup: string;
  delivery: string;
  driver: string;
};

const PICKUP_MODULE = require('@/assets/images/pickUp.png');
const DELIVERY_MODULE = require('@/assets/images/deliveryMarcer.png');
const DRIVER_MODULE = require('@/assets/images/tracking-driver-marker.png');

let cachedUris: MapMarkerImageUris | null = null;
let loadPromise: Promise<MapMarkerImageUris> | null = null;

async function moduleToDataUri(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();

  const fileUri = asset.localUri ?? asset.uri;
  if (!fileUri) {
    throw new Error('Map marker asset has no readable URI');
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return `data:image/png;base64,${base64}`;
}

/**
 * WebView cannot load React Native bundled asset URIs in release builds (file://).
 * Convert marker PNGs to data URIs once and reuse across map instances.
 */
export function loadMapMarkerImageUris(): Promise<MapMarkerImageUris> {
  if (cachedUris) {
    return Promise.resolve(cachedUris);
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const [pickup, delivery, driver] = await Promise.all([
        moduleToDataUri(PICKUP_MODULE),
        moduleToDataUri(DELIVERY_MODULE),
        moduleToDataUri(DRIVER_MODULE),
      ]);

      cachedUris = { pickup, delivery, driver };
      return cachedUris;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  return loadPromise;
}
