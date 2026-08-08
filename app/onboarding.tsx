import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { setSetting } from '@/data/artworkRepository';
import { Button } from '@/ui/components';
import { colors, fonts, spacing } from '@/ui/theme';

export default function OnboardingScreen(): React.JSX.Element {
  const database = useSQLiteContext();

  const continueToVault = async (): Promise<void> => {
    await setSetting(database, 'onboarding_complete', 'true');
    router.replace('/(tabs)/index');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>YOUR WORK. YOUR DEVICE.</Text>
      <Text accessibilityRole="header" style={styles.title}>
        ArtCloset
      </Text>
      <Text style={styles.subtitle}>
        A private, offline-first vault for documenting, presenting, and sharing your artwork.
      </Text>
      <View style={styles.points}>
        <Text style={styles.point}>• Your catalog works without an account or internet.</Text>
        <Text style={styles.point}>• Images and metadata remain on this device by default.</Text>
        <Text style={styles.point}>• Nothing is uploaded unless you explicitly start a backup.</Text>
      </View>
      <Button label="Create my vault" onPress={() => void continueToVault()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  eyebrow: { color: colors.accent, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 52, fontWeight: '600' },
  subtitle: { color: colors.inkMuted, fontSize: 20, lineHeight: 29 },
  points: { gap: spacing.md },
  point: { color: colors.ink, fontSize: 16, lineHeight: 24 },
});
