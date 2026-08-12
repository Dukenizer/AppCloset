import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/** Best-effort OTA check so VIP hash lists can refresh without a full native rebuild. */
export async function checkForArtClosetUpdate(): Promise<void> {
  if (Platform.OS === 'web' || __DEV__) return;
  try {
    if (!Updates.isEnabled) return;
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Apply on next cold start to avoid interrupting backup/redeem mid-flow.
    }
  } catch {
    // Offline or misconfigured — ignore.
  }
}
