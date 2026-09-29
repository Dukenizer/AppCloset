import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/** Foreground re-checks are throttled so switching apps doesn't hit the network every time. */
export const UPDATE_RECHECK_INTERVAL_MS = 60 * 60 * 1000;

let lastCheckAt = 0;

export const updatesSupported = (): boolean =>
  Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;

/**
 * Best-effort OTA check + download. The downloaded bundle applies on the next cold start,
 * or immediately when the user taps Restart on the update banner.
 */
export async function checkForArtClosetUpdate(options: { force?: boolean } = {}): Promise<void> {
  if (!updatesSupported()) return;
  const now = Date.now();
  if (!options.force && now - lastCheckAt < UPDATE_RECHECK_INTERVAL_MS) return;
  lastCheckAt = now;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
    }
  } catch {
    // Offline or misconfigured — ignore.
  }
}

export async function restartIntoUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
