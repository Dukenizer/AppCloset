import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Link, router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  listArchivedCollections,
  listTrashedArtworks,
  restoreArtwork,
  restoreCollection,
} from '@/data/artworkRepository';
import { APP_THEMES, type AppTheme } from '@/domain/theme';
import { useEntitlements } from '@/entitlements';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL } from '@/legal/privacy';
import { DriveBackupStatus, type DriveConnectionHealth } from '@/features/drive/DriveBackupStatus';
import { formatRestoreFailure } from '@/features/drive/formatRestoreFailure';
import { prepareDatabaseReplace } from '@/features/drive/prepareDatabaseReplace';
import { getLatestBackupMeta } from '@/services/drive/driveApi';
import {
  IDLE_DRIVE_PROGRESS,
  buildProgress,
  isBackupStale,
  type DriveJobKind,
  type DriveProgressState,
} from '@/services/drive/driveBackupProgress';
import { runDriveBackup, runDriveRestore } from '@/services/drive/driveBackupService';
import {
  clearGoogleTokens,
  getGoogleDriveUnavailableReason,
  isGoogleDriveConfigured,
  loadGoogleAccountEmail,
  promptGoogleSignIn,
} from '@/services/drive/googleAuth';
import { exportCatalog } from '@/services/exportService';
import {
  clearDiagnosticsLog,
  downloadDiagnosticsLog,
  getDiagnosticsLogInfo,
  loadDiagnosticsEnabled,
  setDiagnosticsEnabled,
} from '@/services/debugLog';
import { getImageStorageUsage } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { useCatalogReload } from '@/state/CatalogReloadContext';
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
  const { theme, setTheme, colors } = useTheme();
  const styles = useStyles();
  const database = useSQLiteContext();
  const { refresh, globalTotal } = useArtworks();
  const { suspendCatalog, resumeCatalog } = useCatalogReload();
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
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastBackupSizeBytes, setLastBackupSizeBytes] = useState<number | null>(null);
  const [driveHealth, setDriveHealth] = useState<DriveConnectionHealth>('disconnected');
  const [driveProgress, setDriveProgress] = useState<DriveProgressState>(IDLE_DRIVE_PROGRESS);
  const [diagnosticsOn, setDiagnosticsOn] = useState(false);
  const [logBytes, setLogBytes] = useState(0);
  const [logExists, setLogExists] = useState(false);
  const retryActionRef = useRef<DriveJobKind>('idle');
  const driveFocusShown = useRef(false);
  const params = useLocalSearchParams<{ focus?: string | string[] }>();
  const focusRaw = Array.isArray(params.focus) ? params.focus[0] : params.focus;

  const driveConfigured = isGoogleDriveConfigured();
  const driveUnavailableReason = getGoogleDriveUnavailableReason();
  const canDrive = can('CAN_USE_GOOGLE_DRIVE_BACKUP');
  const backupStale = isBackupStale(lastBackupAt);

  const refreshLogInfo = useCallback(async (): Promise<void> => {
    const info = await getDiagnosticsLogInfo();
    setLogExists(info.exists);
    setLogBytes(info.bytes);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setStorageUsage(getImageStorageUsage());
    const [trashed, archived, email, diagnostics] = await Promise.all([
      listTrashedArtworks(database),
      listArchivedCollections(database),
      loadGoogleAccountEmail(),
      loadDiagnosticsEnabled(),
    ]);
    setTrash(trashed);
    setArchivedCollections(archived);
    setGoogleEmail(email);
    setDiagnosticsOn(diagnostics);
    await refreshLogInfo();
    if (!email) {
      setDriveHealth('disconnected');
      setLastBackupAt(null);
      setLastBackupSizeBytes(null);
      return;
    }
    if (!(canDrive && driveConfigured)) {
      setDriveHealth('connected');
      return;
    }
    setDriveHealth('checking');
    try {
      const meta = await getLatestBackupMeta();
      setLastBackupAt(meta?.modifiedTime ?? null);
      const size = meta?.size ? Number(meta.size) : NaN;
      setLastBackupSizeBytes(Number.isFinite(size) ? size : null);
      setDriveHealth('connected');
    } catch {
      setLastBackupAt(null);
      setLastBackupSizeBytes(null);
      setDriveHealth('error');
    }
  }, [database, canDrive, driveConfigured, refreshLogInfo]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onDriveProgress = useCallback(
    (state: DriveProgressState): void => {
      setDriveProgress(state);
      void refreshLogInfo();
    },
    [refreshLogInfo],
  );

  useEffect(() => {
    if (!driveBusy) return;
    setDiagnosticsOn(true);
    void refreshLogInfo();
    const timer = setInterval(() => {
      void refreshLogInfo();
    }, 1000);
    return () => clearInterval(timer);
  }, [driveBusy, refreshLogInfo]);

  useFocusEffect(
    useCallback(() => {
      if (focusRaw !== 'drive' || driveFocusShown.current) return;
      driveFocusShown.current = true;
      if (!canDrive) {
        Alert.alert(
          'Restore from backup',
          'Unlock Premium with a VIP code first, then Connect Google and Restore from Drive.',
        );
        return;
      }
      if (!driveConfigured) {
        Alert.alert('Google Drive unavailable', driveUnavailableReason ?? 'Drive is not available on this build.');
        return;
      }
      Alert.alert(
        'Restore your catalog',
        'Restore overwrites this phone with the Drive backup. Work that was never backed up will be lost. Connect Google if needed, then tap Restore from Drive.',
      );
    }, [canDrive, driveConfigured, driveUnavailableReason, focusRaw]),
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

  const offerDownloadLog = (title: string, body: string): void => {
    void refreshLogInfo();
    Alert.alert(title, body, [
      { text: 'Close', style: 'cancel' },
      {
        text: 'Download log file',
        onPress: () => {
          void downloadDiagnosticsLog().catch((shareError: unknown) => {
            Alert.alert(
              'Could not download log',
              shareError instanceof Error ? shareError.message : 'Something went wrong.',
            );
          });
        },
      },
    ]);
  };

  const failDrive = (kind: DriveJobKind, error: unknown): void => {
    const messageText =
      kind === 'restore' ? formatRestoreFailure(error) : error instanceof Error ? error.message : 'Something went wrong.';
    retryActionRef.current = kind;
    setDriveProgress(buildProgress(kind, 'failed', { error: messageText, message: messageText }));
    offerDownloadLog(
      kind === 'restore' ? 'Restore failed' : kind === 'backup' ? 'Backup failed' : 'Google connection failed',
      `${messageText}\n\nA diagnostic log is on this phone. Download the log file and email it to ${SUPPORT_EMAIL}.`,
    );
  };

  const toggleDiagnostics = async (next: boolean): Promise<void> => {
    await setDiagnosticsEnabled(next);
    setDiagnosticsOn(next);
    await refreshLogInfo();
  };

  const saveLogFile = async (): Promise<void> => {
    try {
      await downloadDiagnosticsLog();
    } catch (error) {
      Alert.alert('Could not download log', error instanceof Error ? error.message : 'Something went wrong.');
    }
  };

  const wipeLogFile = (): void => {
    Alert.alert('Clear diagnostic log?', 'This only deletes the log on this phone. Your catalog is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear log',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearDiagnosticsLog();
            await refreshLogInfo();
          })();
        },
      },
    ]);
  };

  const connectGoogle = async (): Promise<void> => {
    if (!driveConfigured) {
      Alert.alert('Google Drive unavailable', driveUnavailableReason ?? 'Google Drive is not available on this build.');
      return;
    }
    setDriveBusy(true);
    setMessage(null);
    setDriveProgress(buildProgress('connect', 'checking_connection'));
    try {
      const result = await promptGoogleSignIn();
      if (!result) {
        setDriveProgress(IDLE_DRIVE_PROGRESS);
        setMessage('Google sign-in cancelled.');
        return;
      }
      setDriveProgress(buildProgress('connect', 'finishing'));
      setGoogleEmail(result.email);
      setDriveProgress(buildProgress('connect', 'done'));
      Alert.alert('Connected', `Signed in as ${result.email}.`);
      await load();
      setDriveProgress(IDLE_DRIVE_PROGRESS);
    } catch (error) {
      failDrive('connect', error);
    } finally {
      setDriveBusy(false);
    }
  };

  const backupNow = async (): Promise<void> => {
    setDriveBusy(true);
    setMessage(null);
    retryActionRef.current = 'backup';
    try {
      const { manifest } = await runDriveBackup(database, onDriveProgress);
      Alert.alert('Backup finished', `${manifest.artworkCount} artworks were backed up to Google Drive.`);
      await load();
      setDriveProgress(IDLE_DRIVE_PROGRESS);
    } catch (error) {
      failDrive('backup', error);
    } finally {
      setDriveBusy(false);
    }
  };

  const runRestore = async (): Promise<void> => {
    setDriveBusy(true);
    setMessage(null);
    retryActionRef.current = 'restore';
    let suspended = false;
    try {
      const manifest = await runDriveRestore(onDriveProgress, {
        onBeforeApply: async () => {
          const uri = await prepareDatabaseReplace(database, suspendCatalog);
          suspended = true;
          return uri;
        },
      });
      resumeCatalog(manifest.verifiedArtworkCount);
      suspended = false;
      await refreshLogInfo();
      const count = manifest.verifiedArtworkCount;
      Alert.alert(
        count === 0 ? 'Restore finished' : 'Restore verified',
        count === 0
          ? 'The Drive backup was applied, but it contains no artworks yet. Add artwork or run Backup now from a device that has your catalog.'
          : `${count} artwork${count === 1 ? '' : 's'} restored. Opening your catalog…`,
        [
          {
            text: 'View catalog',
            onPress: () => router.replace('/(tabs)/' as Href),
          },
        ],
      );
      router.replace('/(tabs)/' as Href);
    } catch (error) {
      if (suspended) {
        resumeCatalog();
        suspended = false;
        const messageText = formatRestoreFailure(error);
        offerDownloadLog(
          'Restore failed',
          `${messageText}\n\nA diagnostic log is on this phone. Download the log file and email it to ${SUPPORT_EMAIL}.`,
        );
      } else {
        failDrive('restore', error);
      }
    } finally {
      setDriveBusy(false);
      setDriveProgress(IDLE_DRIVE_PROGRESS);
    }
  };

  const restoreFromDrive = (): void => {
    const localCount = globalTotal;
    const overwriteBody =
      'Restore replaces EVERYTHING on this phone with the Google Drive backup.\n\n' +
      'Photos, titles, sizes, descriptions, collections, and profile on this device will be overwritten.\n\n' +
      'Work that is only on this phone and was never included in Backup now cannot be recovered. This cannot be undone.';

    const confirmReplace = (): void => {
      Alert.alert(
        localCount > 0 ? `Replace ${localCount} artwork${localCount === 1 ? '' : 's'} on this phone?` : 'Replace this phone’s catalog?',
        localCount > 0
          ? `This phone currently has ${localCount} artwork${localCount === 1 ? '' : 's'}. Restore will delete them and load the Drive snapshot instead.\n\nAnything not in the last Backup now will be lost forever.`
          : overwriteBody,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace catalog',
            style: 'destructive',
            onPress: () => {
              void runRestore();
            },
          },
        ],
      );
    };

    Alert.alert('Restore will overwrite this phone', overwriteBody, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'I understand',
        style: 'destructive',
        onPress: confirmReplace,
      },
    ]);
  };

  const retryDrive = (): void => {
    const action = retryActionRef.current;
    if (action === 'connect') void connectGoogle();
    else if (action === 'backup') void backupNow();
    else if (action === 'restore') void runRestore();
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
            setLastBackupAt(null);
            setLastBackupSizeBytes(null);
            setDriveHealth('disconnected');
            setDriveProgress(IDLE_DRIVE_PROGRESS);
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
      <Text accessibilityRole="header" style={[styles.heading, styles.headingFirst]}>
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
            Dark is the classic ArtCloset look (warm brass). Light is warm gallery cream and gold. Neon is vibrant
            contemporary art.
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
            <Text style={styles.body}>{driveUnavailableReason}</Text>
          ) : (
            <>
              <Text style={styles.body}>
                Backups stay private to ArtCloset in your Google account (app data folder). Restore only works in this
                app with the same Google account — the file is not listed in the Drive website. Restore overwrites this
                phone; work never included in Backup now is lost. ArtCloset never uploads automatically. Connect uses
                the Google account picker on this device — not a browser tab.
              </Text>
              <DriveBackupStatus
                email={googleEmail}
                health={driveHealth}
                lastBackupAt={lastBackupAt}
                lastBackupSizeBytes={lastBackupSizeBytes}
                stale={backupStale}
                progress={driveProgress}
                onRetry={driveProgress.step === 'failed' ? retryDrive : undefined}
                onBackupNow={googleEmail && !driveBusy ? () => void backupNow() : undefined}
              />
              {!googleEmail ? (
                <Button
                  label={driveBusy ? 'Connecting…' : 'Connect Google'}
                  disabled={driveBusy}
                  onPress={() => void connectGoogle()}
                />
              ) : (
                <>
                  <Button
                    label={driveBusy && driveProgress.kind === 'backup' ? 'Backing up…' : 'Backup now'}
                    disabled={driveBusy}
                    onPress={() => void backupNow()}
                  />
                  <Button
                    label={driveBusy && driveProgress.kind === 'restore' ? 'Restoring…' : 'Restore from Drive'}
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

      <Card>
        <View style={styles.cardBody}>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Backup diagnostics</Text>
            </View>
            <Switch
              accessibilityLabel="Backup diagnostics"
              value={diagnosticsOn || driveBusy}
              disabled={driveBusy}
              onValueChange={(value) => void toggleDiagnostics(value)}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.onAccent}
            />
          </View>
          <Text style={styles.body}>
            Backup now and Restore from Drive turn logging on for the whole job. Download the log file and email it to{' '}
            {SUPPORT_EMAIL}. ArtCloset never uploads the log. The file stays after a crash until you clear it.
          </Text>
          {driveBusy ? (
            <Text style={styles.caption}>Logging is on while backup or restore is running.</Text>
          ) : logExists ? (
            <Text style={styles.caption}>Log on device · {formatBytes(logBytes)}</Text>
          ) : (
            <Text style={styles.caption}>No log file yet.</Text>
          )}
          <Button
            label="Download log file"
            variant="secondary"
            disabled={!logExists && !driveBusy}
            onPress={() => void saveLogFile()}
          />
          <Button label="Clear log" variant="danger" disabled={!logExists || driveBusy} onPress={wipeLogFile} />
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
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.body}>
            The SQLite catalog and managed images are the primary source of truth. Drive backup is explicit and optional.
            ArtCloset does not require an account for Free features and does not upload in the background.
          </Text>
          <Button
            label="Open privacy policy"
            variant="secondary"
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
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
  // Tighter vertical rhythm: less “air” between section headers and cards without crowding tap targets.
  content: { padding: spacing.md, paddingBottom: 64, gap: spacing.sm },
  heading: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: spacing.xs,
    marginBottom: -spacing.xs,
  },
  headingFirst: { marginTop: 0 },
  cardBody: { padding: spacing.sm + 4, gap: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  metric: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  trashTitle: { color: colors.ink, fontWeight: '700' },
  caption: { color: colors.inkMuted, fontSize: 12 },
  message: { color: colors.ink, fontWeight: '600' },
  roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
