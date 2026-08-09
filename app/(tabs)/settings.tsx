import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getSetting, listTrashedArtworks, restoreArtwork, setSetting } from '@/data/artworkRepository';
import { parseProfileRole, type ProfileRole } from '@/domain/profile';
import { exportCatalog } from '@/services/exportService';
import { getImageStorageUsage } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, Chip } from '@/ui/components';
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

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

export default function SettingsScreen(): React.JSX.Element {
  const styles = useStyles();
  const database = useSQLiteContext();
  const { refresh } = useArtworks();
  const [storageUsage, setStorageUsage] = useState(0);
  const [trash, setTrash] = useState<TrashedArtwork[]>([]);
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setStorageUsage(getImageStorageUsage());
    setTrash(await listTrashedArtworks(database));
    setRole(parseProfileRole(await getSetting(database, 'profile_role')));
  }, [database]);

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

  const changeRole = async (nextRole: ProfileRole): Promise<void> => {
    await setSetting(database, 'profile_role', nextRole);
    setRole(nextRole);
    setMessage(`Profile changed to ${nextRole}.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>
        Your profile
      </Text>
      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>I use ArtCloset as…</Text>
          <View style={styles.roleOptions}>
            <Chip label="Artist" selected={role === 'artist'} onPress={() => void changeRole('artist')} />
            <Chip label="Collector" selected={role === 'collector'} onPress={() => void changeRole('collector')} />
            <Chip
              label="Artist & collector"
              selected={role === 'both'}
              onPress={() => void changeRole('both')}
            />
          </View>
          <Text style={styles.body}>This changes dashboard language only. Your catalog data remains unchanged.</Text>
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
          <Text style={styles.cardTitle}>Google Drive backup</Text>
          <Text style={styles.body}>
            Optional Drive backup is not connected. Core features never require a Google account, and ArtCloset never
            uploads data automatically.
          </Text>
          <Button
            label="Drive setup required"
            variant="secondary"
            onPress={() =>
              Alert.alert(
                'Google Drive is not configured',
                'A development build and platform OAuth client IDs are required before Drive backup can be enabled.',
              )
            }
          />
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

      <Text style={styles.heading}>Privacy</Text>
      <Text style={styles.body}>
        The SQLite catalog and managed images are the primary source of truth. ArtCloset does not require an account,
        contain analytics, or upload your data in the background.
      </Text>
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
