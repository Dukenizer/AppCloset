import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getUserProfile, saveUserProfile, setSetting } from '@/data/artworkRepository';
import { Button, Field } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, spacing, type ColorTokens } from '@/ui/theme';

export default function OnboardingScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const [artistName, setArtistName] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);

  const continueToVault = async (): Promise<void> => {
    setBusy(true);
    try {
      const profile = await getUserProfile(database);
      await saveUserProfile(database, {
        ...profile,
        artistName: artistName.trim(),
        defaultCurrency: defaultCurrency.trim().toUpperCase() || 'USD',
      });
      await setSetting(database, 'onboarding_complete', 'true');
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>YOUR WORK. YOUR DEVICE.</Text>
      <Text accessibilityRole="header" style={styles.title}>
        ArtCloset
      </Text>
      <Text style={styles.subtitle}>
        A private, offline-first vault for artworks you make, collect, or keep for inspiration.
      </Text>
      <Field
        label="Your name (optional)"
        value={artistName}
        onChangeText={setArtistName}
        help="Used when you choose “As me” on artwork entries. You can add or edit this anytime in Profile."
        autoCapitalize="words"
        maxLength={120}
      />
      <Field
        label="Default currency"
        value={defaultCurrency}
        onChangeText={(value) => setDefaultCurrency(value.toUpperCase())}
        help="Used for artwork prices across your catalog. You can change this anytime in Profile."
        autoCapitalize="characters"
        maxLength={3}
      />
      <Text style={styles.privacy}>Your catalog stays on this device unless you explicitly export or back it up.</Text>
      <Button
        label={busy ? 'Creating your vault…' : 'Continue'}
        disabled={busy}
        onPress={() => void continueToVault()}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: { color: colors.accent, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 52, fontWeight: '600' },
  subtitle: { color: colors.inkMuted, fontSize: 20, lineHeight: 29 },
  privacy: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
});
