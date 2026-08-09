import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getSetting } from '@/data/artworkRepository';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

export default function IndexScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void getSetting(database, 'onboarding_complete')
      .then((onboardingValue) => {
        if (active) {
          setOnboardingComplete(onboardingValue === 'true');
          setSettingsLoaded(true);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to open app settings.');
      });
    return () => {
      active = false;
    };
  }, [database, retryCount]);

  if (error) {
    return (
      <View accessibilityRole="alert" style={styles.loading}>
        <Text style={styles.title}>Unable to open ArtCloset</Text>
        <Text selectable style={styles.error}>
          {error}
        </Text>
        <Button label="Try again" onPress={() => setRetryCount((count) => count + 1)} />
      </View>
    );
  }

  if (!settingsLoaded || onboardingComplete === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return <Redirect href={onboardingComplete ? '/(tabs)' : '/onboarding'} />;
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  error: { color: colors.danger, textAlign: 'center' },
});
