import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getSetting, getUserProfile, saveUserProfile, setSetting } from '@/data/artworkRepository';
import { isValidCurrencyCode, PROFILE_SETTING_KEYS, profileArtistName, type UserProfile } from '@/domain/profile';
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
  const [profileSaved, setProfileSaved] = useState(false);
  const [editing, setEditing] = useState(true);
  const editingRef = useRef(true);
  const didInitRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    const [nextProfile, savedFlag] = await Promise.all([
      getUserProfile(database),
      getSetting(database, PROFILE_SETTING_KEYS.profileSaved),
    ]);
    const saved = savedFlag === '1';
    setProfile(nextProfile);
    setProfileSaved(saved);
    if (!didInitRef.current) {
      didInitRef.current = true;
      editingRef.current = !saved;
      setEditing(!saved);
    }
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const fieldsLocked = profileSaved && !editing;

  const save = async (): Promise<void> => {
    if (!profile || busy || fieldsLocked) return;
    if (!isValidCurrencyCode(profile.defaultCurrency)) {
      setMessageTone('error');
      setMessage('Enter a valid three-letter currency code (e.g. USD).');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveUserProfile(database, profile);
      await setSetting(database, PROFILE_SETTING_KEYS.profileSaved, '1');
      await refresh();
      editingRef.current = false;
      setProfileSaved(true);
      setEditing(false);
      setMessageTone('success');
      setMessage('Profile saved. Fields are locked — tap Edit profile to change them.');
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (): void => {
    editingRef.current = true;
    setEditing(true);
    setMessage(null);
  };

  const displayName = profile ? profileArtistName(profile) : '';
  const patch = (key: keyof UserProfile, value: string): void => {
    if (fieldsLocked) return;
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={styles.pageTitle}>
          Profile
        </Text>
        <Text style={styles.lead}>
          {fieldsLocked
            ? 'Profile is locked. Tap Edit profile to change your details.'
            : 'Your name fills the artist field when you choose “As me” on each artwork. Everything stays on this device.'}
        </Text>

        <Button label="Digital calling card" onPress={() => router.push('/calling-card' as Href)} />

        {profile && (
          <Card>
            <View style={styles.cardBody}>
              <Field
                label="Your name"
                value={profile.artistName}
                onChangeText={(value) => patch('artistName', value)}
                help={fieldsLocked ? undefined : 'Used as the artist on your own works when you tap “As me” while adding or editing artwork.'}
                autoCapitalize="words"
                maxLength={120}
                editable={!fieldsLocked}
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
                onChangeText={(value) => patch('studioName', value)}
                help={fieldsLocked ? undefined : 'Optional label for your practice — separate from the artist name on each piece.'}
                autoCapitalize="words"
                maxLength={120}
                editable={!fieldsLocked}
              />
              <Field
                label="Location (optional)"
                value={profile.location}
                onChangeText={(value) => patch('location', value)}
                help={fieldsLocked ? undefined : 'Shown on your digital calling card (e.g. Pasig, Philippines).'}
                autoCapitalize="words"
                maxLength={120}
                editable={!fieldsLocked}
              />
              <Field
                label="Specialty / medium (optional)"
                value={profile.specialtyMedium}
                onChangeText={(value) => patch('specialtyMedium', value)}
                help={fieldsLocked ? undefined : 'One line on your calling card — e.g. "Acrylic, Watercolor · Textured Art".'}
                maxLength={80}
                editable={!fieldsLocked}
              />
              <Field
                label="Bio (optional)"
                value={profile.artistBio}
                onChangeText={(value) => patch('artistBio', value)}
                help={fieldsLocked ? undefined : 'Kept on your profile — not shown on the calling card.'}
                multiline
                maxLength={2000}
                editable={!fieldsLocked}
              />
              <Field
                label="Contact email (optional)"
                value={profile.contactEmail}
                onChangeText={(value) => patch('contactEmail', value)}
                help={fieldsLocked ? undefined : 'Shown on your digital calling card.'}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={120}
                editable={!fieldsLocked}
              />
              <Field
                label="Contact phone (optional)"
                value={profile.contactPhone}
                onChangeText={(value) => patch('contactPhone', value)}
                help={fieldsLocked ? undefined : 'Shown on your digital calling card.'}
                keyboardType="phone-pad"
                maxLength={40}
                editable={!fieldsLocked}
              />
              <Field
                label="Facebook (optional)"
                value={profile.socialFacebook}
                onChangeText={(value) => patch('socialFacebook', value)}
                help={fieldsLocked ? undefined : 'Shown on the calling card only when filled.'}
                autoCapitalize="none"
                maxLength={160}
                editable={!fieldsLocked}
              />
              <Field
                label="Instagram (optional)"
                value={profile.socialInstagram}
                onChangeText={(value) => patch('socialInstagram', value)}
                help={fieldsLocked ? undefined : 'Handle or URL for your calling card (e.g. @studio).'}
                autoCapitalize="none"
                maxLength={120}
                editable={!fieldsLocked}
              />
              <Field
                label="Threads (optional)"
                value={profile.socialThreads}
                onChangeText={(value) => patch('socialThreads', value)}
                help={fieldsLocked ? undefined : 'Handle or URL for your calling card.'}
                autoCapitalize="none"
                maxLength={120}
                editable={!fieldsLocked}
              />
              <Field
                label="Website (optional)"
                value={profile.websiteUrl}
                onChangeText={(value) => patch('websiteUrl', value)}
                help={fieldsLocked ? undefined : 'Shown on the calling card only when filled.'}
                autoCapitalize="none"
                keyboardType="url"
                maxLength={160}
                editable={!fieldsLocked}
              />
              <Field
                label="TikTok (optional)"
                value={profile.socialTiktok}
                onChangeText={(value) => patch('socialTiktok', value)}
                help={fieldsLocked ? undefined : 'Shown on the calling card only when filled.'}
                autoCapitalize="none"
                maxLength={120}
                editable={!fieldsLocked}
              />
              <Field
                label="YouTube (optional)"
                value={profile.socialYoutube}
                onChangeText={(value) => patch('socialYoutube', value)}
                help={fieldsLocked ? undefined : 'Shown on the calling card only when filled.'}
                autoCapitalize="none"
                maxLength={160}
                editable={!fieldsLocked}
              />
              <Field
                label="Default currency"
                value={profile.defaultCurrency}
                onChangeText={(value) => patch('defaultCurrency', value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={3}
                help={fieldsLocked ? undefined : 'Used for all artwork prices. Set it here — not on each artwork entry.'}
                editable={!fieldsLocked}
              />
              {message ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.message, messageTone === 'error' ? styles.messageError : styles.messageSuccess]}
                >
                  {message}
                </Text>
              ) : null}
              {fieldsLocked ? (
                <Button label="Edit profile" variant="secondary" disabled={busy} onPress={startEditing} />
              ) : (
                <Button label={busy ? 'Saving…' : 'Save profile'} disabled={busy} onPress={() => void save()} />
              )}
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
    pageTitle: {
      color: colors.ink,
      fontFamily: fonts.display,
      fontSize: 36,
      fontWeight: '700',
      letterSpacing: 0.2,
      marginTop: spacing.sm,
    },
    lead: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
    cardBody: { padding: spacing.md, gap: spacing.md },
    previewLabel: { color: colors.inkMuted, fontSize: 14 },
    previewValue: { color: colors.ink, fontWeight: '700' },
    previewHint: { color: colors.inkMuted, fontSize: 14, fontStyle: 'italic' },
    message: { fontSize: 15, fontWeight: '700' },
    messageSuccess: { color: colors.success },
    messageError: { color: colors.danger },
  });
