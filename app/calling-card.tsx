import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { captureRef } from 'react-native-view-shot';

import { getSetting, getUserProfile, saveUserProfile, setSetting } from '@/data/artworkRepository';
import { PROFILE_SETTING_KEYS, profileArtistName, type UserProfile } from '@/domain/profile';
import { isWeb } from '@/platform/capabilities';
import { pickAndCropImage } from '@/services/imagePick';
import {
  clearStudioLogo,
  imageExists,
  resolveStoredImageUri,
  storeStudioLogo,
} from '@/services/imageStorage';
import { shareImage, saveImageToLibrary } from '@/services/exportService';
import { Button, Card, Field, ScreenState } from '@/ui/components';
import { CallingCardBrandIcon, type CallingCardContactKind } from '@/ui/callingCardIcons';
import { callingCardType, useCallingCardFonts } from '@/ui/callingCardFonts';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

/** Mockup palette — cream card, mustard/gold accents. */
const PALETTE = {
  cream: '#FFF5E1',
  creamDeep: '#F3E8D4',
  gold: '#C88E3F',
  goldSoft: '#E6BE8A',
  brown: '#7A5C3E',
  ink: '#2A2118',
  muted: '#6E5C48',
} as const;

const formatHandle = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('@') || trimmed.includes('/') || trimmed.includes('.')) return trimmed;
  return `@${trimmed}`;
};

const formatWebsite = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '');
};

type ContactEntry = { kind: CallingCardContactKind; label: string; value: string };

/** Spread filled contacts evenly — one row up to 4, otherwise two balanced rows. */
const layoutContactRows = (entries: ContactEntry[]): ContactEntry[][] => {
  const filled = entries.filter((entry) => entry.value.trim().length > 0);
  if (filled.length === 0) return [];
  if (filled.length <= 4) return [filled];
  const split = Math.ceil(filled.length / 2);
  return [filled.slice(0, split), filled.slice(split)];
};

type CardStyles = ReturnType<typeof createStyles>;

function DiamondRule({ styles }: { styles: CardStyles }): React.JSX.Element {
  return (
    <View style={styles.diamondRule}>
      <View style={styles.diamondLine} />
      <View style={styles.diamond} />
      <View style={styles.diamondLine} />
    </View>
  );
}

function ContactCell({
  kind,
  label,
  value,
  styles,
  showDivider,
}: {
  kind: CallingCardContactKind;
  label: string;
  value: string;
  styles: CardStyles;
  showDivider: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.contactCell, showDivider && styles.contactCellDivider]}>
      <View style={styles.iconWrap}>
        <CallingCardBrandIcon kind={kind} size={14} />
      </View>
      <Text style={styles.contactLabel}>{label}</Text>
      <Text style={styles.contactValue} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function CallingCardScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fontsReady = useCallingCardFonts();
  const database = useSQLiteContext();
  const card = useRef<View | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cardSaved, setCardSaved] = useState(false);
  const [editing, setEditing] = useState(true);
  /** Busts Image cache when studio-logo.jpg is overwritten at the same path. */
  const [logoRevision, setLogoRevision] = useState(0);
  const editingRef = useRef(true);
  const didInitRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [nextProfile, savedFlag] = await Promise.all([
        getUserProfile(database),
        getSetting(database, PROFILE_SETTING_KEYS.callingCardSaved),
      ]);
      const saved = savedFlag === '1';
      setProfile(nextProfile);
      setCardSaved(saved);
      if (!didInitRef.current) {
        didInitRef.current = true;
        editingRef.current = !saved;
        setEditing(!saved);
      }
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading || loadError || !profile || !fontsReady) {
    return <ScreenState loading={loading || !fontsReady} error={loadError} />;
  }

  const name = profileArtistName(profile) || 'Your name';
  const studio = profile.studioName.trim();
  const medium = profile.specialtyMedium.trim();
  const location = profile.location.trim();
  const logoUri = resolveStoredImageUri(profile.studioLogoUri) ?? '';
  const hasLogo = Boolean(logoUri && imageExists(profile.studioLogoUri));
  const logoSourceUri = hasLogo
    ? logoRevision > 0
      ? `${logoUri}${logoUri.includes('?') ? '&' : '?'}v=${logoRevision}`
      : logoUri
    : '';
  const fieldsLocked = cardSaved && !editing;

  const contactRows = layoutContactRows([
    { kind: 'email', label: 'Email', value: profile.contactEmail.trim() },
    { kind: 'facebook', label: 'Facebook', value: formatHandle(profile.socialFacebook) || profile.socialFacebook.trim() },
    { kind: 'instagram', label: 'Instagram', value: formatHandle(profile.socialInstagram) },
    { kind: 'threads', label: 'Threads', value: formatHandle(profile.socialThreads) },
    { kind: 'phone', label: 'Phone', value: profile.contactPhone.trim() },
    { kind: 'website', label: 'Website', value: formatWebsite(profile.websiteUrl) },
    { kind: 'tiktok', label: 'TikTok', value: formatHandle(profile.socialTiktok) },
    { kind: 'youtube', label: 'YouTube', value: formatHandle(profile.socialYoutube) || formatWebsite(profile.socialYoutube) },
  ]);

  const patchProfile = (patch: Partial<UserProfile>): void => {
    if (fieldsLocked) return;
    setProfile((current) => (current ? { ...current, ...patch } : current));
  };

  const persist = async (next: UserProfile): Promise<void> => {
    setProfile(next);
    await saveUserProfile(database, next);
  };

  const chooseLogo = async (): Promise<void> => {
    if (fieldsLocked) return;
    setMessage(null);
    setBusy(true);
    try {
      const picked = await pickAndCropImage();
      if (!picked) return;
      // Fixed path artcloset/branding/studio-logo.jpg — overwrite in place; do not delete first.
      const storedRef = await storeStudioLogo(picked);
      const absolute = resolveStoredImageUri(storedRef);
      if (!absolute || !imageExists(absolute)) {
        throw new Error('Could not save the studio logo on this device.');
      }
      await persist({ ...profile, studioLogoUri: absolute });
      setLogoRevision(Date.now());
      setMessage('Studio logo updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update logo.');
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async (): Promise<void> => {
    if (fieldsLocked) return;
    setBusy(true);
    setMessage(null);
    try {
      await clearStudioLogo(profile.studioLogoUri);
      await persist({ ...profile, studioLogoUri: '' });
      setLogoRevision(0);
      setMessage('Studio logo removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove logo.');
    } finally {
      setBusy(false);
    }
  };

  const captureCard = async (): Promise<string | null> => {
    if (!card.current) return null;
    return captureRef(card, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
  };

  const share = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await saveUserProfile(database, profile);
      const uri = await captureCard();
      if (!uri) return;
      await shareImage(uri, 'Share calling card');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not share the calling card.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await saveUserProfile(database, profile);
      const uri = await captureCard();
      if (!uri) return;
      await saveImageToLibrary(uri);
      await setSetting(database, PROFILE_SETTING_KEYS.callingCardSaved, '1');
      editingRef.current = false;
      setCardSaved(true);
      setEditing(false);
      setMessage('Card saved. Tap Edit calling card to change logo, socials, and details.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the calling card.');
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (): void => {
    editingRef.current = true;
    setEditing(true);
    setMessage(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        {fieldsLocked
          ? 'Calling card saved. Tap Edit calling card to change logo, socials, and other details.'
          : 'Edit identity, contacts, and logo below, then Save image.'}
      </Text>

      <View ref={card} collapsable={false} style={styles.cardFrame}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.logoFrame}>
              {hasLogo && logoSourceUri ? (
                <Image
                  key={`studio-logo-${logoRevision}`}
                  source={{ uri: logoSourceUri }}
                  style={styles.logo}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoMonogram}>{(name.trim().charAt(0) || 'A').toUpperCase()}</Text>
                </View>
              )}
            </View>

            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <DiamondRule styles={styles} />
              {studio ? (
                <Text style={styles.studio} numberOfLines={1}>
                  {studio}
                </Text>
              ) : null}
              <Text style={[styles.medium, !medium && styles.mediumMuted]} numberOfLines={1}>
                {medium || 'Add specialty / medium below'}
              </Text>
              {location ? (
                <View style={styles.locationRow}>
                  <View style={styles.pinMark}>
                    <View style={styles.pinHead} />
                    <View style={styles.pinPoint} />
                  </View>
                  <Text style={styles.location} numberOfLines={1}>
                    {location}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {contactRows.length > 0 ? (
            <View style={styles.contactSection}>
              {contactRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.contactBand}>
                  {row.map((entry, index) => (
                    <ContactCell
                      key={entry.label}
                      kind={entry.kind}
                      label={entry.label}
                      value={entry.value}
                      styles={styles}
                      showDivider={index < row.length - 1}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.contactEmpty}>Add contacts below — only filled fields appear here.</Text>
          )}

          <View style={styles.footer}>
            <View style={styles.footerLine}>
              <View style={styles.footerRule} />
              <View style={styles.footerDiamond} />
            </View>
            <Text style={styles.brandScript}>ArtCloset</Text>
            <View style={styles.footerLine}>
              <View style={styles.footerDiamond} />
              <View style={styles.footerRule} />
            </View>
          </View>
        </View>
      </View>

      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {Platform.OS === 'web' ? (
        <Text style={styles.notice}>Calling card share and download require the Android or iOS app.</Text>
      ) : (
        <Text style={styles.notice}>Share opens chats/apps. Save opens the system sheet — pick Photos or Files.</Text>
      )}
      <Button
        label={busy ? 'Preparing…' : 'Share calling card'}
        disabled={busy || Platform.OS === 'web'}
        onPress={() => void share()}
      />
      {fieldsLocked ? (
        <Button label="Edit calling card" variant="secondary" disabled={busy} onPress={startEditing} />
      ) : null}

      <Text style={styles.sectionLead}>
        {fieldsLocked
          ? 'Details are locked. Tap Edit calling card to change them.'
          : 'Editing — update any field, then Save image at the bottom.'}
      </Text>
      <Card>
        <View style={styles.editCardBody}>
          <Text style={styles.editCardTitle}>Identity</Text>
          <Field
            label="Your name"
            value={profile.artistName}
            onChangeText={(value) => patchProfile({ artistName: value })}
            autoCapitalize="words"
            maxLength={120}
            editable={!fieldsLocked}
          />
          <Field
            label="Studio name (optional)"
            value={profile.studioName}
            onChangeText={(value) => patchProfile({ studioName: value })}
            autoCapitalize="words"
            maxLength={120}
            editable={!fieldsLocked}
          />
          <Field
            label="Specialty / medium (optional)"
            value={profile.specialtyMedium}
            onChangeText={(value) => patchProfile({ specialtyMedium: value })}
            maxLength={80}
            editable={!fieldsLocked}
          />
          <Field
            label="Location (optional)"
            value={profile.location}
            onChangeText={(value) => patchProfile({ location: value })}
            autoCapitalize="words"
            maxLength={120}
            editable={!fieldsLocked}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.editCardBody}>
          <Text style={styles.editCardTitle}>Contacts & social</Text>
          <Field
            label="Email (optional)"
            value={profile.contactEmail}
            onChangeText={(value) => patchProfile({ contactEmail: value })}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={120}
            editable={!fieldsLocked}
          />
          <Field
            label="Phone (optional)"
            value={profile.contactPhone}
            onChangeText={(value) => patchProfile({ contactPhone: value })}
            keyboardType="phone-pad"
            maxLength={40}
            editable={!fieldsLocked}
          />
          <Field
            label="Facebook (optional)"
            value={profile.socialFacebook}
            onChangeText={(value) => patchProfile({ socialFacebook: value })}
            autoCapitalize="none"
            maxLength={160}
            editable={!fieldsLocked}
          />
          <Field
            label="Instagram (optional)"
            value={profile.socialInstagram}
            onChangeText={(value) => patchProfile({ socialInstagram: value })}
            autoCapitalize="none"
            maxLength={120}
            editable={!fieldsLocked}
          />
          <Field
            label="Threads (optional)"
            value={profile.socialThreads}
            onChangeText={(value) => patchProfile({ socialThreads: value })}
            autoCapitalize="none"
            maxLength={120}
            editable={!fieldsLocked}
          />
          <Field
            label="Website (optional)"
            value={profile.websiteUrl}
            onChangeText={(value) => patchProfile({ websiteUrl: value })}
            autoCapitalize="none"
            keyboardType="url"
            maxLength={160}
            editable={!fieldsLocked}
          />
          <Field
            label="TikTok (optional)"
            value={profile.socialTiktok}
            onChangeText={(value) => patchProfile({ socialTiktok: value })}
            autoCapitalize="none"
            maxLength={120}
            editable={!fieldsLocked}
          />
          <Field
            label="YouTube (optional)"
            value={profile.socialYoutube}
            onChangeText={(value) => patchProfile({ socialYoutube: value })}
            autoCapitalize="none"
            maxLength={160}
            editable={!fieldsLocked}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.editCardBody}>
          <Text style={styles.editCardTitle}>Studio logo</Text>
          {fieldsLocked ? (
            <>
              <Text style={styles.logoHelp}>
                Logo and details are locked after Save image. Tap Edit calling card to change the studio logo.
              </Text>
              <Button label="Edit calling card" variant="secondary" disabled={busy} onPress={startEditing} />
            </>
          ) : (
            <>
              <Text style={styles.logoHelp}>
                Optional mark for the top-left of your card. Pick from Photos on this device (not the artwork
                catalog), crop, then Save image.
              </Text>
              <Button
                label={busy ? 'Working…' : hasLogo ? 'Change studio logo' : 'Add studio logo'}
                variant="secondary"
                disabled={busy || isWeb}
                onPress={() => void chooseLogo()}
              />
              {hasLogo ? (
                <Button
                  label="Remove logo"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void removeLogo()}
                />
              ) : null}
            </>
          )}
        </View>
      </Card>

      {!fieldsLocked ? (
        <Button
          label={busy ? 'Preparing…' : 'Save image…'}
          disabled={busy || Platform.OS === 'web'}
          onPress={() => void download()}
        />
      ) : null}
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },
    lead: {
      color: colors.inkMuted,
      fontFamily: callingCardType.body,
      fontSize: 15,
      lineHeight: 22,
    },
    sectionLead: {
      color: colors.ink,
      fontFamily: callingCardType.bodyStrong,
      fontSize: 15,
      marginTop: spacing.sm,
    },
    editCardBody: { padding: spacing.md, gap: spacing.sm },
    editCardTitle: {
      color: colors.ink,
      fontFamily: callingCardType.bodyStrong,
      fontSize: 16,
      marginBottom: spacing.xs,
    },
    logoHelp: {
      color: colors.inkMuted,
      fontFamily: callingCardType.body,
      fontSize: 14,
      lineHeight: 20,
    },
    cardFrame: {
      width: '100%',
      borderRadius: 12,
      padding: 2,
      backgroundColor: PALETTE.goldSoft,
      borderWidth: 1.5,
      borderColor: PALETTE.gold,
    },
    card: {
      backgroundColor: PALETTE.cream,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: PALETTE.gold,
      paddingTop: 10,
      paddingHorizontal: 10,
      paddingBottom: 8,
      gap: 8,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoFrame: {
      width: 72,
      height: 84,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: PALETTE.gold,
      overflow: 'hidden',
      backgroundColor: PALETTE.creamDeep,
    },
    logo: { width: '100%', height: '100%' },
    logoPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2A241E',
    },
    logoMonogram: {
      color: PALETTE.cream,
      fontFamily: callingCardType.display,
      fontSize: 36,
    },
    identity: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 },
    name: {
      color: PALETTE.ink,
      fontFamily: callingCardType.display,
      fontSize: 22,
      lineHeight: 26,
      letterSpacing: 0.2,
    },
    diamondRule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginVertical: 1,
      maxWidth: 140,
    },
    diamondLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: PALETTE.gold },
    diamond: {
      width: 6,
      height: 6,
      backgroundColor: PALETTE.gold,
      transform: [{ rotate: '45deg' }],
    },
    studio: {
      color: PALETTE.brown,
      fontFamily: callingCardType.displayItalic,
      fontSize: 12,
    },
    medium: {
      color: PALETTE.ink,
      fontFamily: callingCardType.body,
      fontSize: 10,
      lineHeight: 13,
      letterSpacing: 0.15,
      marginTop: 1,
    },
    mediumMuted: {
      color: PALETTE.muted,
      fontStyle: 'italic',
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    pinMark: { width: 9, height: 12, alignItems: 'center' },
    pinHead: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      borderWidth: 1.5,
      borderColor: PALETTE.gold,
      backgroundColor: PALETTE.goldSoft,
    },
    pinPoint: {
      width: 0,
      height: 0,
      marginTop: -1,
      borderLeftWidth: 2.5,
      borderRightWidth: 2.5,
      borderTopWidth: 4,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: PALETTE.gold,
    },
    location: {
      flex: 1,
      color: PALETTE.ink,
      fontFamily: callingCardType.body,
      fontSize: 10,
      lineHeight: 13,
    },
    contactSection: { gap: 6 },
    contactBand: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: PALETTE.goldSoft,
      paddingTop: 6,
    },
    contactEmpty: {
      color: PALETTE.muted,
      fontFamily: callingCardType.body,
      fontSize: 11,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 4,
    },
    contactCell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 2,
      minWidth: 0,
    },
    contactCellDivider: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: PALETTE.goldSoft,
    },
    iconWrap: {
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactLabel: {
      color: PALETTE.gold,
      fontFamily: callingCardType.bodyStrong,
      fontSize: 7,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    contactValue: {
      color: PALETTE.ink,
      fontFamily: callingCardType.body,
      fontSize: 8,
      lineHeight: 10,
      textAlign: 'center',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingTop: 2,
    },
    footerLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
    footerRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: PALETTE.goldSoft },
    footerDiamond: {
      width: 4,
      height: 4,
      backgroundColor: PALETTE.gold,
      transform: [{ rotate: '45deg' }],
    },
    brandScript: {
      color: PALETTE.gold,
      fontFamily: callingCardType.script,
      fontSize: 16,
      lineHeight: 20,
      paddingHorizontal: 2,
    },
    message: { color: colors.ink, fontFamily: callingCardType.bodyStrong, fontSize: 14 },
    notice: { color: colors.inkMuted, fontFamily: callingCardType.body, fontSize: 13, lineHeight: 18 },
  });
