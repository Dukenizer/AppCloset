import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router, useFocusEffect, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  listArchivedCollections,
  listTrashedArtworks,
  restoreArtwork,
  restoreCollection,
} from '@/data/artworkRepository';
import { APP_THEMES, type AppTheme } from '@/domain/theme';
import { useEntitlements } from '@/entitlements';
import { getLatestBackupMeta } from '@/services/drive/driveApi';
import { runDriveBackup, runDriveRestore } from '@/services/drive/driveBackupService';
import {
  clearGoogleTokens,
  createGoogleAuthRequest,
  isGoogleDriveConfigured,
  loadGoogleAccountEmail,
  promptGoogleSignIn,
} from '@/services/drive/googleAuth';
import { exportCatalog } from '@/services/exportService';
import { getImageStorageUsage } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, Chip } from '@/ui/components';
import { saveAppTheme } from '@/ui/ThemePreferenceSync';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

const useStyles = (): ReturnType<typeof createStyles> => {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
};

interface TrashedArtwork {
  id: number;
  title: string;
  deletedAt: string;
}

interface ArchivedCollection {
  id: number;
  name: string;
  archivedAt: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

export default function SettingsScreen(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const styles = useStyles();
  const database = useSQLiteContext();
  const { refresh } = useArtworks();
  const {
    isPremiumActive,
    vipStatus,
    redemption,
    daysUntilExpiry,
    can,
  } = useEntitlements();
  const [storageUsage, setStorageUsage] = useState(0);
  const [trash, setTrash] = useState<TrashedArtwork[]>([]);
  const [archivedCollections, setArchivedCollections] = useState<ArchivedCollection[]>([]);
  const [busy, setBusy] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [lastBackupLabel, setLastBackupLabel] = useState<string>('—');

  const driveConfigured = isGoogleDriveConfigured();
  const canDrive = can('CAN_USE_GOOGLE_DRIVE_BACKUP');

  const load = useCallback(async (): Promise<void> => {
    setStorageUsage(getImageStorageUsage());
    const [trashed, archived, email] = await Promise.all([
      listTrashedArtworks(database),
      listArchivedCollections(database),
      loadGoogleAccountEmail(),
    ]);
    setTrash(trashed);
    setArchivedCollections(archived);
    setGoogleEmail(email);
    if (canDrive && email && driveConfigured) {
      try {
        const meta = await getLatestBackupMeta();
        if (meta?.modifiedTime) {
          setLastBackupLabel(
            `${new Date(meta.modifiedTime).toLocaleString()} · ${meta.size ? `${meta.size} bytes` : 'OK'}`,
          );
        } else {
          setLastBackupLabel('—');
        }
      } catch {
        setLastBackupLabel('—');
      }
    } else {
      setLastBackupLabel('—');
    }
  }, [database, canDrive, driveConfigured]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const exportData = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await exportCatalog(database);
      setMessage('Catalog export created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (item: TrashedArtwork): Promise<void> => {
    await restoreArtwork(database, item.id);
    await Promise.all([load(), refresh()]);
  };

  const restoreArchivedCollection = async (item: ArchivedCollection): Promise<void> => {
    await restoreCollection(database, item.id);
    await Promise.all([load(), refresh()]);
    setMessage(`Restored collection “${item.name}”.`);
  };

  const changeTheme = async (nextTheme: AppTheme): Promise<void> => {
    setTheme(nextTheme);
    await saveAppTheme(database, nextTheme);
    setMessage(`Theme set to ${nextTheme}.`);
  };

  const themeLabel = (value: AppTheme): string => {
    if (value === 'dark') return 'Dark';
    if (value === 'light') return 'Light';
    if (value === 'neon') return 'Neon';
    return 'Metallic';
  };

  const vipStatusLabel = (() => {
    if (vipStatus === 'active' && redemption) {
      return `Active until ${new Date(redemption.expiry_date).toLocaleDateString()}`;
    }
    if (vipStatus === 'expired') return 'Expired';
    return 'Not redeemed';
  })();

  const connectGoogle = async (): Promise<void> => {
    if (!driveConfigured) {
      Alert.alert(
        'Google Drive not configured',
        'Set GOOGLE_ANDROID_CLIENT_ID in .env / EAS secrets and rebuild.',
      );
      return;
    }
    setDriveBusy(true);
    setMessage(null);
    try {
      const request = createGoogleAuthRequest();
      if (!request) throw new Error('OAuth client missing.');
      const result = await promptGoogleSignIn(request);
      if (!result) {
        setMessage('Google sign-in cancelled.');
        return;
      }
      setGoogleEmail(result.email);
      setMessage('Google account connected.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google connect failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const backupNow = async (): Promise<void> => {
    setDriveBusy(true);
    setMessage(null);
    try {
      const { manifest } = await runDriveBackup(database);
      setMessage(`Backup complete · ${manifest.artworkCount} artworks.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const restoreFromDrive = (): void => {
    Alert.alert(
      'Restore from Google Drive?',
      'This replaces the catalog on this device with the Drive backup. Your current local catalog will be overwritten.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDriveBusy(true);
              setMessage(null);
              try {
                const manifest = await runDriveRestore();
                await refresh();
                setMessage(`Catalog restored · ${manifest.artworkCount} artworks. Restart the app if views look stale.`);
                await load();
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Restore failed.');
              } finally {
                setDriveBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const disconnectGoogle = (): void => {
    Alert.alert('Disconnect Google?', 'Drive backup stays in your Google account. You can connect again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearGoogleTokens();
            setGoogleEmail(null);
            setLastBackupLabel('—');
            setMessage('Google account disconnected.');
          })();
        },
      },
    ]);
  };

  const showGetPremium = (): void => {
    Alert.alert(
      'Get Premium',
      'Store purchase is coming soon. Testers can unlock Premium now with a VIP code.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem VIP code', onPress: () => router.push('/vip-redeem' as Href) },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {(vipStatus === 'expired' ||
        (vipStatus === 'active' && daysUntilExpiry != null && daysUntilExpiry <= 14)) && (
        <Card>
          <View style={styles.cardBody}>
            {vipStatus === 'expired' ? (
              <>
                <Text style={styles.cardTitle}>VIP access ended</Text>
                <Text style={styles.body}>
                  Free catalog still works. Redeem a new VIP code or Get Premium to restore Drive backup and other
                  Premium features.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>VIP expires in {daysUntilExpiry} days</Text>
                <Text style={styles.body}>Renew with a new code after expiry, or Get Premium when store purchase ships.</Text>
              </>
            )}
            <Button label="Redeem VIP code" variant="secondary" onPress={() => router.push('/vip-redeem' as Href)} />
            <Button label="Get Premium" variant="secondary" onPress={showGetPremium} />
          </View>
        </Card>
      )}

      <Text accessibilityRole="header" style={styles.heading}>
        Premium
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>VIP Status</Text>
          <Text style={styles.body}>{vipStatusLabel}</Text>
          {(!isPremiumActive || vipStatus === 'expired') && (
            <Button label="Redeem VIP code" variant="secondary" onPress={() => router.push('/vip-redeem' as Href)} />
          )}
        </View>
      </Card>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Get Premium</Text>
          <Text style={styles.body}>Store subscription purchase will unlock Premium without a VIP code.</Text>
          <Button label="Coming via store" variant="secondary" onPress={showGetPremium} />
        </View>
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        Appearance
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Theme</Text>
          <Text style={styles.body}>
            Dark is the classic ArtCloset look (warm brass). Light is daytime. Neon is vibrant contemporary art.
            Metallic is bluish futuristic chrome. Themes stay on this device.
          </Text>
          <View style={styles.roleOptions}>
            {APP_THEMES.map((option) => (
              <Chip
                key={option}
                label={themeLabel(option)}
                selected={theme === option}
                onPress={() => void changeTheme(option)}
              />
            ))}
          </View>
        </View>
      </Card>
      <Text accessibilityRole="header" style={styles.heading}>
        Profile
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Name, studio, and catalog preferences</Text>
          <Text style={styles.body}>
            Your artist name, studio details, bio, display unit, and default currency live on the Profile tab.
          </Text>
          <Link href="/(tabs)/profile" asChild>
            <Button label="Open Profile" variant="secondary" />
          </Link>
        </View>
      </Card>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Artwork choices</Text>
          <Text style={styles.body}>
            Create, rename, archive, and restore the mediums, materials, and genres available in artwork forms.
          </Text>
          <Button
            label="Manage catalog fields"
            variant="secondary"
            onPress={() => router.push('/catalog-fields' as Href)}
          />
        </View>
      </Card>
      <Text accessibilityRole="header" style={styles.heading}>
        Data ownership
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Local catalog export</Text>
          <Text style={styles.body}>
            Export artwork metadata as readable JSON using the native share sheet. Image files remain private on this
            device and are not included in this catalog export.
          </Text>
          <Button
            label={busy ? 'Preparing export…' : 'Export catalog'}
            disabled={busy}
            onPress={() => void exportData()}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Backup your ArtCloset to Google Drive</Text>
          {!canDrive ? (
            <>
              <Text style={styles.body}>
                Protect your catalog if you reinstall or change phones. Premium feature — unlock with VIP or Premium.
                ArtCloset never uploads automatically.
              </Text>
              <Button label="Unlock with VIP code" variant="secondary" onPress={() => router.push('/vip-redeem' as Href)} />
              <Button label="Get Premium" variant="secondary" onPress={showGetPremium} />
            </>
          ) : !driveConfigured ? (
            <Text style={styles.body}>
              Premium is active, but Google OAuth is not configured on this build. Add GOOGLE_ANDROID_CLIENT_ID and
              rebuild to enable Connect.
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Backups stay private to ArtCloset in your Google account (app data folder). ArtCloset never uploads
                automatically.
              </Text>
              <Text style={styles.body}>Account: {googleEmail ?? 'Not connected'}</Text>
              <Text style={styles.body}>Last backup: {lastBackupLabel}</Text>
              {!googleEmail ? (
                <Button
                  label={driveBusy ? 'Connecting…' : 'Connect Google'}
                  disabled={driveBusy}
                  onPress={() => void connectGoogle()}
                />
              ) : (
                <>
                  <Button
                    label={driveBusy ? 'Working…' : 'Backup now'}
                    disabled={driveBusy}
                    onPress={() => void backupNow()}
                  />
                  <Button
                    label="Restore from Drive"
                    variant="secondary"
                    disabled={driveBusy}
                    onPress={restoreFromDrive}
                  />
                  <Button label="Disconnect" variant="danger" disabled={driveBusy} onPress={disconnectGoogle} />
                </>
              )}
            </>
          )}
        </View>
      </Card>

      <Text style={styles.heading}>Storage</Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.metric}>{formatBytes(storageUsage)}</Text>
          <Text style={styles.body}>Managed artwork image storage on this device.</Text>
        </View>
      </Card>

      <Text style={styles.heading}>Trash</Text>
      <Card>
        <View style={styles.cardBody}>
          {trash.length === 0 ? (
            <Text style={styles.body}>Trash is empty.</Text>
          ) : (
            trash.map((item) => (
              <View key={item.id} style={styles.trashRow}>
                <View style={styles.flex}>
                  <Text style={styles.trashTitle}>{item.title}</Text>
                  <Text style={styles.caption}>Removed {new Date(item.deletedAt).toLocaleDateString()}</Text>
                </View>
                <Button label="Restore" variant="secondary" onPress={() => void restore(item)} />
              </View>
            ))
          )}
        </View>
      </Card>

      <Text style={styles.heading}>Archived collections</Text>
      <Card>
        <View style={styles.cardBody}>
          {archivedCollections.length === 0 ? (
            <Text style={styles.body}>No archived collections.</Text>
          ) : (
            archivedCollections.map((item) => (
              <View key={item.id} style={styles.trashRow}>
                <View style={styles.flex}>
                  <Text style={styles.trashTitle}>{item.name}</Text>
                  <Text style={styles.caption}>
                    Archived {new Date(item.archivedAt).toLocaleDateString()}
                  </Text>
                </View>
                <Button
                  label="Restore"
                  variant="secondary"
                  onPress={() => void restoreArchivedCollection(item)}
                />
              </View>
            ))
          )}
        </View>
      </Card>

      <Text style={styles.heading}>Privacy</Text>
      <Text style={styles.body}>
        The SQLite catalog and managed images are the primary source of truth. Drive backup is explicit and optional.
        ArtCloset does not require an account for Free features and does not upload in the background.
      </Text>

      <Text accessibilityRole="header" style={styles.heading}>
        About
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>About ArtCloset</Text>
          <Text style={styles.body}>
            What the vault is for, what you can do, and how your catalog stays private on this device.
          </Text>
          <Button
            label="Open About ArtCloset"
            variant="secondary"
            onPress={() => router.push('/about' as Href)}
          />
        </View>
      </Card>

      {message && (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
  heading: { color: colors.ink, fontSize: 23, fontWeight: '900', marginTop: spacing.sm },
  cardBody: { padding: spacing.md, gap: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  metric: { color: colors.ink, fontSize: 30, fontWeight: '900' },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  trashTitle: { color: colors.ink, fontWeight: '700' },
  caption: { color: colors.inkMuted, fontSize: 12 },
  message: { color: colors.ink, fontWeight: '600' },
  roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
