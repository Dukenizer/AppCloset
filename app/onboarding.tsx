import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { setSetting } from '@/data/artworkRepository';
import type { ProfileRole } from '@/domain/profile';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, spacing, type ColorTokens } from '@/ui/theme';

export default function OnboardingScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [busy, setBusy] = useState(false);

  const continueToVault = async (): Promise<void> => {
    if (!role) return;
    setBusy(true);
    try {
      await setSetting(database, 'profile_role', role);
      await setSetting(database, 'onboarding_complete', 'true');
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>YOUR WORK. YOUR DEVICE.</Text>
      <Text accessibilityRole="header" style={styles.title}>
        ArtCloset
      </Text>
      <Text style={styles.subtitle}>
        A private, offline-first vault shaped around the way you experience art.
      </Text>
      <View>
        <Text style={styles.question}>How will you use ArtCloset?</Text>
        <Text style={styles.hint}>You can change this later in Settings.</Text>
      </View>
      <View style={styles.roles}>
        <RoleCard
          title="I’m an artist"
          description="Document your practice, track availability, and present your portfolio."
          selected={role === 'artist'}
          onPress={() => setRole('artist')}
          styles={styles}
        />
        <RoleCard
          title="I’m a collector"
          description="Catalog your collection, provenance, locations, and exhibition history."
          selected={role === 'collector'}
          onPress={() => setRole('collector')}
          styles={styles}
        />
        <RoleCard
          title="I’m an artist and collector"
          description="Manage your own artistic practice and the works you collect in one private archive."
          selected={role === 'both'}
          onPress={() => setRole('both')}
          styles={styles}
        />
      </View>
      <Text style={styles.privacy}>Your catalog stays on this device unless you explicitly export or back it up.</Text>
      <Button
        label={busy ? 'Creating your vault…' : 'Continue'}
        disabled={!role || busy}
        onPress={() => void continueToVault()}
      />
    </ScrollView>
  );
}

type OnboardingStyles = ReturnType<typeof createStyles>;

function RoleCard({
  title,
  description,
  selected,
  onPress,
  styles,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  styles: OnboardingStyles;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, selected && styles.roleCardSelected, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]} />
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
      </View>
    </Pressable>
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
  question: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: '600' },
  hint: { color: colors.inkMuted, marginTop: spacing.xs },
  roles: { gap: spacing.sm },
  roleCard: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  roleCardSelected: { borderColor: colors.accent, borderWidth: 2 },
  pressed: { opacity: 0.78 },
  radio: {
    width: 20,
    height: 20,
    marginTop: 2,
    borderWidth: 2,
    borderColor: colors.inkMuted,
    borderRadius: 10,
  },
  radioSelected: { borderWidth: 6, borderColor: colors.accent },
  roleCopy: { flex: 1, gap: spacing.xs },
  roleTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  roleDescription: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  privacy: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
});
