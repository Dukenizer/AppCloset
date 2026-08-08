import { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import type { Artwork } from '@/domain/artwork';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, ScreenState } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';

const line = (label: string, value: string | number | null): React.JSX.Element | null =>
  value === null || value === '' ? null : (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text selectable style={styles.lineValue}>
        {value}
      </Text>
    </View>
  );

export default function ArtworkDetailsScreen(): React.JSX.Element {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const { findById, archive } = useArtworks();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!Number.isInteger(id) || id <= 0) {
      setError('Invalid artwork ID.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setArtwork(await findById(id));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this artwork.');
    } finally {
      setLoading(false);
    }
  }, [findById, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading || error || !artwork) {
    return (
      <ScreenState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={<Text style={styles.muted}>This artwork no longer exists.</Text>}
      />
    );
  }

  const dimensions = [artwork.width, artwork.height, artwork.depth]
    .filter((value): value is number => value !== null)
    .join(' × ');
  const hasImage = imageExists(artwork.primaryImageUri);

  const confirmArchive = (): void => {
    Alert.alert(
      'Move artwork to trash?',
      'The artwork will be hidden from your vault. Its local data is retained for recovery.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to trash',
          style: 'destructive',
          onPress: () => {
            void archive(artwork).then(() => router.replace('/(tabs)/index'));
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {hasImage && artwork.primaryImageUri ? (
        <Image source={{ uri: artwork.primaryImageUri }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={[styles.image, styles.missing]}>
          <Text style={styles.muted}>Artwork image is missing or unavailable.</Text>
        </View>
      )}
      <Text accessibilityRole="header" selectable style={styles.title}>
        {artwork.title}
      </Text>
      <Text selectable style={styles.artist}>
        {artwork.artist || 'Artist not specified'}
      </Text>
      <Text style={styles.status}>{artwork.status}</Text>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            label="Edit"
            variant="secondary"
            onPress={() => router.push({ pathname: '/artwork/[id]/edit', params: { id } })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Share card"
            onPress={() => router.push({ pathname: '/share-card/[id]', params: { id } })}
          />
        </View>
      </View>

      <Card>
        <View style={styles.cardBody}>
          {line('Artwork ID', artwork.humanId)}
          {line('Completed', artwork.completionDate ?? artwork.completionYear)}
          {line('Medium', artwork.medium)}
          {line('Material', artwork.material)}
          {line('Dimensions', dimensions ? `${dimensions} ${artwork.measurementUnit}` : null)}
          {line('Orientation', artwork.orientation)}
          {line('Genre', artwork.genres.join(', '))}
          {line('Tags', artwork.tags.join(', '))}
          {line('Collection', artwork.collections.join(', '))}
          {line('Location', artwork.location)}
          {line(
            'Price',
            artwork.priceMinor === null ? null : `${artwork.currency} ${(artwork.priceMinor / 100).toFixed(2)}`,
          )}
        </View>
      </Card>
      {artwork.description ? (
        <View>
          <Text style={styles.heading}>Description</Text>
          <Text selectable style={styles.body}>
            {artwork.description}
          </Text>
        </View>
      ) : null}
      {artwork.notes ? (
        <View>
          <Text style={styles.heading}>Private notes</Text>
          <Text selectable style={styles.body}>
            {artwork.notes}
          </Text>
        </View>
      ) : null}
      <Button label="Move to trash" variant="danger" onPress={confirmArchive} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceMuted },
  missing: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.ink, fontSize: 32, fontWeight: '900' },
  artist: { color: colors.inkMuted, fontSize: 19 },
  status: { color: colors.accent, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  cardBody: { padding: spacing.md },
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  lineLabel: { width: 96, color: colors.inkMuted, fontWeight: '700' },
  lineValue: { flex: 1, color: colors.ink },
  heading: { color: colors.ink, fontSize: 19, fontWeight: '800', marginBottom: spacing.sm },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.inkMuted, textAlign: 'center' },
});
