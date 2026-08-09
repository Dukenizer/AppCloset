import { Platform } from 'react-native';

export type AppPlatform = 'android' | 'ios' | 'web';

export const appPlatform: AppPlatform =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

/** Primary ship target — full capture, crop, batch, and managed storage. */
export const isAndroid = appPlatform === 'android';

/** Held for a later release; basic flows may run, media tooling is not prioritized yet. */
export const isIos = appPlatform === 'ios';

export const isWeb = appPlatform === 'web';

export const supportsManagedImages = isAndroid || isIos;

/** Native freeform crop + rotate (expo-image-picker / UCrop). Android-only for v1. */
export const supportsNativeCrop = isAndroid;

/** Multi-select batch stub creation. Android-only for v1. */
export const supportsBatchUpload = isAndroid;

export const IOS_MEDIA_DEFERRED_COPY =
  'Crop, rotate, and batch upload are Android-first for now. iOS will catch up in a later release.';

export const NATIVE_APP_REQUIRED_COPY = isAndroid
  ? 'This feature requires the Android app.'
  : 'This feature requires the mobile app.';
