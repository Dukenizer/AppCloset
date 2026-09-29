import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useUpdates } from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkForArtClosetUpdate, restartIntoUpdate, updatesSupported } from '@/services/updateCheck';

import { useTheme } from './ThemeProvider';
import { radii, spacing, type ColorTokens } from './theme';

/** Offers a restart once an OTA update has downloaded; re-checks when the app returns to the foreground. */
export function UpdateBanner(): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!updatesSupported()) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForArtClosetUpdate();
    });
    return () => subscription.remove();
  }, []);

  if (!isUpdatePending || dismissed) return null;

  const restart = async (): Promise<void> => {
    setRestarting(true);
    try {
      await restartIntoUpdate();
    } catch {
      setRestarting(false);
    }
  };

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { top: insets.top + spacing.sm }]}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>Update ready</Text>
        <Text style={styles.body}>Restart ArtCloset to get the latest version. Your artworks stay safe.</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restart later"
          disabled={restarting}
          hitSlop={8}
          onPress={() => setDismissed(true)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.later}>Later</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restart to update"
          disabled={restarting}
          hitSlop={8}
          onPress={() => void restart()}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.restart}>{restarting ? 'Restarting…' : 'Restart'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    banner: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      gap: spacing.sm,
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.surface,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    copy: { gap: 2 },
    title: { color: colors.ink, fontWeight: '700', fontSize: 15 },
    body: { color: colors.inkMuted, fontSize: 14, lineHeight: 19 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
    action: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    later: { color: colors.inkMuted, fontWeight: '700', fontSize: 14, textTransform: 'uppercase' },
    restart: { color: colors.accent, fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
    pressed: { opacity: 0.7 },
  });
