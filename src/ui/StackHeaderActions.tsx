import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '@/ui/ThemeProvider';
import { spacing } from '@/ui/theme';

export const goHome = (): void => {
  router.replace('/(tabs)/' as never);
};

export const goBackOrHome = (): void => {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  goHome();
};

export function HeaderHomeButton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Home"
      onPress={goHome}
      hitSlop={12}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={[styles.label, { color: colors.accent }]}>Home</Text>
    </Pressable>
  );
}

export function HeaderBackButton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={goBackOrHome}
      hitSlop={12}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={[styles.label, { color: colors.accent }]}>Back</Text>
    </Pressable>
  );
}

/** Use when the native stack back chevron is hidden or unreliable. */
export function HeaderNavCluster(): React.JSX.Element {
  return (
    <View style={styles.cluster}>
      <HeaderBackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  label: { fontSize: 16, fontWeight: '800' },
  cluster: { flexDirection: 'row', alignItems: 'center' },
});
