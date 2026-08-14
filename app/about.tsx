import { useMemo } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { PRIVACY_POLICY_URL } from '@/legal/privacy';
import { Button, Card } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, spacing, type ColorTokens } from '@/ui/theme';

const PILLARS = [
  {
    title: 'Offline-first',
    body: 'Your catalog works without connectivity. SQLite and managed images on this device are the source of truth.',
  },
  {
    title: 'No account required',
    body: 'Core features never require signup. Identity is this device—not a cloud login.',
  },
  {
    title: 'Trust & privacy',
    body: 'Nothing uploads in the background. Export leaves the device only when you explicitly share it.',
  },
  {
    title: 'List · Describe · Share',
    body: 'Capture once, then search, filter, present in Exhibit Mode, print labels, email selections, and export metadata.',
  },
] as const;

const CAN_DO = [
  {
    title: 'Catalog artworks',
    body: 'Photos, titles, artists, dimensions, medium, status (including Reserved), price, tags, genres, and more—searchable in your vault.',
  },
  {
    title: 'Home gallery',
    body: 'Featured artwork beside the ArtCloset brand, compact archive controls, collections, and a gold Add artwork action for new works.',
  },
  {
    title: 'Collections',
    body: 'Create collections with + Collection, switch between them, and edit (rename / archive) the one you are viewing. One artwork can belong to many collections.',
  },
  {
    title: 'Find what you need',
    body: 'Search by title, artist, or tag. Filters cover status (Available, Reserved, Sold, and more) and completion year.',
  },
  {
    title: 'Present & export',
    body: 'Exhibit Mode, exhibit labels, share cards, email selections, digital calling card, and a local JSON catalog export (metadata—not image bytes).',
  },
  {
    title: 'Recover safely',
    body: 'Trashed artworks and archived collections can be restored from Settings. Soft delete is the default.',
  },
] as const;

const DRIVE_STEPS = [
  'Open Settings → Backup your ArtCloset to Google Drive (needs VIP or Premium).',
  'Connect Google, then tap Backup now when you want a snapshot. ArtCloset never uploads in the background.',
  'The backup (database + images) stays in a private Drive app folder for your Google account—not a normal My Drive folder you browse on the web.',
  'On a reinstall or new phone: Connect the same Google account, tap Restore from Drive, and confirm. This replaces the catalog on this device (no merge).',
  'If Restore says nothing was found, that account has no ArtCloset backup yet—run Backup now first. If Connect fails or the session expired, connect again.',
] as const;

const LIMITATIONS = [
  'No live multi-device sync—Drive is backup/restore, not continuous sync.',
  'Local catalog export does not include image files (use Premium Drive backup for full recovery).',
  'Google Drive backup and restore require Premium (VIP code or future store purchase) and a connected Google account.',
  'Restore overwrites the catalog on this device with the latest Drive backup for that Google account.',
  'Drive backups are not listed like ordinary files in the Google Drive website; recover them only through ArtCloset Restore.',
  'Certificate of Authenticity, portfolio PDF, and store IAP are not in this build yet.',
  'Advanced photo crop and batch upload are Android-first.',
] as const;

export default function AboutScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const version = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.0';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.brandMark}>
          <Image
            source={require('../assets/palette-brush.png')}
            style={styles.brandSilhouette}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text accessibilityRole="header" style={styles.title}>
            ArtCloset
          </Text>
        </View>
        <Text style={styles.eyebrow}>YOUR WORK. YOUR DEVICE.</Text>
        <Text style={styles.pillars}>List · Describe · Share</Text>
        <Text style={styles.tagline}>Your art, offline first.</Text>
        <Text style={styles.version}>Version {version} · Free catalog · Premium Drive optional</Text>
      </View>

      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Product overview</Text>
          <Text style={styles.body}>
            ArtCloset is a private, offline-first vault for artworks you make, collect, or keep for inspiration. It is
            built so makers and collectors get a trustworthy daily catalog—not another social marketplace or cloud CMS.
          </Text>
          <Text style={styles.body}>
            Free includes unlimited local cataloging, photos, collections, search, filters, exhibit tools, share card,
            email, calling card, and metadata export—without requiring an account or background uploads. Premium (VIP
            codes for testers; store purchase later) unlocks Google Drive backup and restore so your catalog can survive
            reinstall or a new phone.
          </Text>
        </View>
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        Core pillars
      </Text>
      {PILLARS.map((item) => (
        <Card key={item.title}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        </Card>
      ))}

      <Text accessibilityRole="header" style={styles.heading}>
        What you can do
      </Text>
      {CAN_DO.map((item) => (
        <Card key={item.title}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        </Card>
      ))}

      <Text accessibilityRole="header" style={styles.heading}>
        Free vs Premium
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.body}>
            Free forever for create & organize: unlimited artworks, photos, search, collections, share card, email,
            basic exhibit labels, and calling card.
          </Text>
          <Text style={styles.body}>
            Premium (VIP codes for testers; store purchase later) unlocks Google Drive backup & restore. Later Premium
            roadmap items include Certificate of Authenticity, portfolio PDF, and exhibition branding. No ads. No upload
            caps.
          </Text>
        </View>
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        Google Drive backup & restore
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Protect your vault (Premium)</Text>
          <Text style={styles.body}>
            Drive is an optional safety net for reinstall or a new phone—not live sync across devices. You choose when
            to back up or restore. Your Free catalog always stays usable on this device even if VIP expires.
          </Text>
          {DRIVE_STEPS.map((line) => (
            <Text key={line} style={styles.bullet}>
              • {line}
            </Text>
          ))}
        </View>
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        Privacy policy
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.body}>
            ArtCloset has no backend and does not collect catalog data. Camera and photo library are used only when you
            choose to capture or pick images. There is no analytics SDK in this version.
          </Text>
          <Text style={styles.body}>
            The SQLite catalog and managed images on this device are the source of truth. Data leaves the device only
            through an action you start (catalog export, share, or Premium Drive Backup now). Optional Drive backup
            stays in your Google account’s private app-data folder—not on ArtCloset servers.
          </Text>
          <Button
            label="Open privacy policy"
            variant="secondary"
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          />
        </View>
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        Transparent limits
      </Text>
      <Card>
        <View style={styles.cardBody}>
          {LIMITATIONS.map((line) => (
            <Text key={line} style={styles.bullet}>
              • {line}
            </Text>
          ))}
        </View>
      </Card>

      <Text style={styles.footer}>
        ArtCloset is the offline art vault that keeps your catalog on your device—and lets Premium protect it with
        Google Drive backup when you choose.
      </Text>
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: {
      padding: spacing.md,
      paddingBottom: 64,
      gap: spacing.md,
    },
    hero: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      gap: spacing.sm,
    },
    brandMark: {
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    brandSilhouette: {
      width: 56,
      height: 56,
      tintColor: colors.accent,
    },
    title: {
      color: colors.ink,
      fontFamily: fonts.display,
      fontSize: 40,
      fontWeight: '600',
    },
    eyebrow: {
      color: colors.accent,
      fontWeight: '800',
      letterSpacing: 1.4,
      fontSize: 12,
    },
    pillars: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    tagline: {
      color: colors.inkMuted,
      fontSize: 17,
      lineHeight: 24,
      textAlign: 'center',
    },
    version: {
      color: colors.inkMuted,
      fontSize: 13,
      fontWeight: '600',
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    heading: {
      color: colors.ink,
      fontSize: 23,
      fontWeight: '900',
      marginTop: spacing.sm,
    },
    cardBody: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTitle: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: '800',
    },
    body: {
      color: colors.inkMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    bullet: {
      color: colors.inkMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    footer: {
      color: colors.inkMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      fontStyle: 'italic',
    },
  });
