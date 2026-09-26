import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { listArchivedCollections, restoreCollection } from '@/data/artworkRepository';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

interface ArchivedCollection {
  id: number;
  name: string;
  archivedAt: string;
}

export default function ArchivedCollectionsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const { refresh } = useArtworks();
  const [items, setItems] = useState<ArchivedCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setItems(await listArchivedCollections(database));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load archived collections.');
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const restoreItem = async (item: ArchivedCollection): Promise<void> => {
    setBusyId(item.id);
    try {
      await restoreCollection(database, item.id);
      await Promise.all([load(), refresh()]);
      setMessage(`Restored collection “${item.name}”.`);
    } finally {
      setBusyId(null);
    }
  };

  if (loading || error) {
    return <ScreenState loading={loading} error={error} onRetry={() => void load()} empty={null} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Archived collections are hidden from filters. Their artworks stay in your catalog and return to the collection
        when you restore it.
      </Text>
      <Card>
        <View style={styles.cardBody}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No archived collections.</Text>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{item.name}</Text>
                  <Text style={styles.caption}>Archived {new Date(item.archivedAt).toLocaleDateString()}</Text>
                </View>
                <Button
                  label={busyId === item.id ? 'Restoring…' : 'Restore'}
                  variant="secondary"
                  disabled={busyId !== null}
                  onPress={() => void restoreItem(item)}
                />
              </View>
            ))
          )}
        </View>
      </Card>
      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
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
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    flex: { flex: 1 },
    title: { color: colors.ink, fontWeight: '700' },
    caption: { color: colors.inkMuted, fontSize: 12 },
    empty: { color: colors.inkMuted, textAlign: 'center' },
    message: { color: colors.ink, fontWeight: '600' },
  });
