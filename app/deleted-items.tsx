import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { listDeletedArtworks, permanentlyDeleteArtworks, type DeletedArtwork } from '@/data/deletedArtworks';
import { formatDeletedAgo } from '@/domain/deletedItems';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

export default function DeletedItemsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const { restore } = useArtworks();
  const [items, setItems] = useState<DeletedArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | 'all' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setItems(await listDeletedArtworks(database));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load deleted items.');
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const runAction = async (target: number | 'all', action: () => Promise<string>): Promise<void> => {
    setBusyId(target);
    setMessage(null);
    try {
      setMessage(await action());
      await load();
    } catch (actionError) {
      Alert.alert('Something went wrong', actionError instanceof Error ? actionError.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const restoreItem = (item: DeletedArtwork): void => {
    void runAction(item.id, async () => {
      await restore([item.id]);
      return `Restored “${item.title}”.`;
    });
  };

  const deleteForever = (item: DeletedArtwork): void => {
    Alert.alert(
      'Delete forever?',
      `Permanently delete “${item.title}” and its photo? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () =>
            void runAction(item.id, async () => {
              await permanentlyDeleteArtworks(database, [item.id]);
              return `Permanently deleted “${item.title}”.`;
            }),
        },
      ],
    );
  };

  const emptyAll = (): void => {
    const count = items.length;
    Alert.alert(
      'Empty deleted items?',
      `Permanently delete ${count} artwork${count === 1 ? '' : 's'} and ${count === 1 ? 'its photo' : 'their photos'}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () =>
            void runAction('all', async () => {
              const removed = await permanentlyDeleteArtworks(database);
              return `Permanently deleted ${removed} artwork${removed === 1 ? '' : 's'}.`;
            }),
        },
      ],
    );
  };

  if (loading || error) {
    return <ScreenState loading={loading} error={error} onRetry={() => void load()} empty={null} />;
  }

  const busy = busyId !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Deleted artworks stay here until you delete them forever. Restore puts them back in your catalog and
        collections.
      </Text>

      {items.length === 0 ? (
        <Card>
          <View style={styles.cardBody}>
            <Text style={styles.empty}>No deleted artworks.</Text>
          </View>
        </Card>
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <View style={styles.cardBody}>
              <View style={styles.row}>
                {item.thumbnailUri && imageExists(item.thumbnailUri) ? (
                  <Image source={{ uri: item.thumbnailUri }} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.thumb, styles.thumbMissing]} />
                )}
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.caption}>{formatDeletedAgo(item.deletedAt)}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button
                    label={busyId === item.id ? 'Working…' : 'Restore'}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => restoreItem(item)}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label="Delete forever"
                    variant="danger"
                    disabled={busy}
                    onPress={() => deleteForever(item)}
                  />
                </View>
              </View>
            </View>
          </Card>
        ))
      )}

      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {items.length > 0 ? (
        <View style={styles.dangerZone}>
          <Button
            label={busyId === 'all' ? 'Deleting…' : 'Empty deleted items'}
            variant="danger"
            disabled={busy}
            onPress={emptyAll}
          />
          <Text style={styles.caption}>
            Artworks already saved in a Google Drive backup can still come back through Restore from Drive.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.sm },
    intro: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.xs },
    cardBody: { padding: spacing.sm + 4, gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    thumb: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
    thumbMissing: { borderWidth: 1, borderColor: colors.border },
    flex: { flex: 1 },
    title: { color: colors.ink, fontWeight: '700', fontSize: 16 },
    caption: { color: colors.inkMuted, fontSize: 12 },
    actions: { flexDirection: 'row', gap: spacing.sm },
    empty: { color: colors.inkMuted, textAlign: 'center' },
    message: { color: colors.ink, fontWeight: '600' },
    dangerZone: {
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
  });
