import * as ImagePicker from 'expo-image-picker';

import {
  IOS_MEDIA_DEFERRED_COPY,
  isWeb,
  supportsNativeCrop,
} from '@/platform/capabilities';

const imagePickerOptions = (allowsEditing: boolean): ImagePicker.ImagePickerOptions => ({
  mediaTypes: ['images'],
  allowsEditing,
  quality: 1,
});

/** Pick a single image; opens native crop/rotate on Android only. */
export async function pickAndCropImage(options?: {
  source?: 'library' | 'camera';
}): Promise<string | null> {
  if (isWeb) return null;

  const allowsEditing = supportsNativeCrop;
  const source = options?.source ?? 'library';

  if (source === 'library') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Photo library access is required to choose artwork images.');
    const result = await ImagePicker.launchImageLibraryAsync(imagePickerOptions(allowsEditing));
    if (result.canceled) return null;
    return result.assets[0]?.uri ?? null;
  }

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera access is required to photograph artwork.');
  const result = await ImagePicker.launchCameraAsync(imagePickerOptions(allowsEditing));
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

/** Multi-select from library — Android-only (batch queue handles per-item crop). */
export async function pickMultipleImages(): Promise<string[]> {
  if (isWeb || !supportsNativeCrop) {
    throw new Error(IOS_MEDIA_DEFERRED_COPY);
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library access is required to choose artwork images.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => asset.uri).filter(Boolean);
}

export { IOS_MEDIA_DEFERRED_COPY };
