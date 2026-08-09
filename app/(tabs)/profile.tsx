import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getUserProfile, saveUserProfile } from '@/data/artworkRepository';
import { isValidCurrencyCode, profileArtistName, type UserProfile } from '@/domain/profile';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, Field } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, spacing, type ColorTokens } from '@/ui/theme';

const useStyles = (): ReturnType<typeof createStyles> => {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
};

export default function ProfileScreen(): React.JSX.Element {
  const styles = useStyles();
  const database = useSQLiteContext();
  const { refresh } = useArtworks();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');

  const load = useCallback(async (): Promise<void> => {
    setProfile(await getUserProfile(database));
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async (): Promise<void> => {
    if (!profile || busy) return;
    if (!isValidCurrencyCode(profile.defaultCurrency)) {
      setMessageTone('error');
      setMessage('Enter a valid three-letter currency code (e.g. USD).');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveUserProfile(database, profile);
      await refresh();
      setMessageTone('success');
      setMessage('Profile saved.');
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  const displayName = profile ? profileArtistName(profile) : '';

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.pageTitle}>
        Profile
      </Text>
      <Text style={styles.lead}>
        Your name fills the artist field when you choose “As me” on each artwork. Everything stays on this device.
      </Text>

      {profile && (
        <Card>
          <View style={styles.cardBody}>
            <Field
              label="Your name"
              value={profile.artistName}
              onChangeText={(value) => setProfile((current) => (current ? { ...current, artistName: value } : current))}
              help="Used as the artist on your own works when you tap “As me” while adding or editing artwork."
              autoCapitalize="words"
              maxLength={120}
            />
            {displayName ? (
              <Text style={styles.previewLabel}>
                Preview: <Text style={styles.previewValue}>{displayName}</Text>
              </Text>
            ) : (
              <Text style={styles.previewHint}>Add your name so “As me” works on new artwork entries.</Text>
            )}
            <Field
              label="Studio name (optional)"
              value={profile.studioName}
              onChangeText={(value) => setProfile((current) => (current ? { ...current, studioName: value } : current))}
              help="Optional label for your practice — separate from the artist name on each piece."
              autoCapitalize="words"
              maxLength={120}
            />
            <Field
              label="Bio (optional)"
              value={profile.artistBio}
              onChangeText={(value) => setProfile((current) => (current ? { ...current, artistBio: value } : current))}
              multiline
              maxLength={2000}
            />
            <Field
              label="Default currency"
              value={profile.defaultCurrency}
              onChangeText={(value) =>
                setProfile((current) => (current ? { ...current, defaultCurrency: value.toUpperCase() } : current))
              }
              autoCapitalize="characters"
              maxLength={3}
              help="Used for all artwork prices. Set it here — not on each artwork entry."
            />
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[styles.message, messageTone === 'error' ? styles.messageError : styles.messageSuccess]}
              >
                {message}
              </Text>
            ) : null}
            <Button label={busy ? 'Saving…' : 'Save profile'} disabled={busy} onPress={() => void save()} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
    pageTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, fontWeight: '600' },
    lead: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
    cardBody: { padding: spacing.md, gap: spacing.md },
    previewLabel: { color: colors.inkMuted, fontSize: 14 },
    previewValue: { color: colors.ink, fontWeight: '700' },
    previewHint: { color: colors.inkMuted, fontSize: 14, fontStyle: 'italic' },
    message: { fontSize: 15, fontWeight: '700' },
    messageSuccess: { color: colors.success },
    messageError: { color: colors.danger },
  });
