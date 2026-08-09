import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getDisplayUnit } from '@/data/artworkRepository';
import { formatCompletionLabel } from '@/domain/catalog';
import { formatDimensions } from '@/domain/dimensions';
import type { Artwork } from '@/domain/artwork';
import { ArtworkImageViewer } from '@/features/artworks/ArtworkImageViewer';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, spacing, type ColorTokens } from '@/ui/theme';

export default function ArtworkDetailsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Number(Array.isArray(idParam) ? idParam[0] : idParam);
  const database = useSQLiteContext();
  const { findById } = useArtworks();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [displayUnit, setDisplayUnit] = useState<'cm' | 'in'>('cm');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const line = (label: string, value: string | number | null): React.JSX.Element | null =>
    value === null || value === '' ? null : (
      <View style={styles.line}>
        <Text style={styles.lineLabel}>{label}</Text>
        <Text selectable style={styles.lineValue}>
          {value}
        </Text>
      </View>
    );

  const load = useCallback(async (): Promise<void> => {
    if (!Number.isInteger(id) || id <= 0) {
      setError('Invalid artwork ID.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextArtwork, unit] = await Promise.all([findById(id), getDisplayUnit(database)]);
      setArtwork(nextArtwork);
      setDisplayUnit(unit);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this artwork.');
    } finally {
      setLoading(false);
    }
  }, [database, findById, id]);

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

  const dimensions = formatDimensions(artwork.width, artwork.height, artwork.depth, displayUnit);
  const hasImage = imageExists(artwork.primaryImageUri);
  const showPrice = artwork.priceMinor !== null && !artwork.hidePrice;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {hasImage && artwork.primaryImageUri ? (
        <ArtworkImageViewer uri={artwork.primaryImageUri} accessibilityLabel={artwork.title} />
      ) : (
        <View style={[styles.missing, styles.imageFrame]}>
          <Text style={styles.muted}>Artwork image is missing or unavailable.</Text>
        </View>
      )}
      <Text accessibilityRole="header" selectable style={styles.title}>
        {artwork.title}
      </Text>
      <Text selectable style={styles.artist}>
        {artwork.artist || 'Artist not specified'}
      </Text>
      {artwork.shortDescription ? (
        <Text selectable style={styles.shortDescription}>
          {artwork.shortDescription}
        </Text>
      ) : null}
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
          {line('Completed', formatCompletionLabel(artwork.completionYear, artwork.completionMonth))}
          {line('Medium', artwork.medium)}
          {line('Material', artwork.material)}
          {line('Dimensions', dimensions)}
          {line('Framed', artwork.framed ? 'Yes' : 'No')}
          {line('Orientation', artwork.orientation)}
          {line('Genre', artwork.genres.join(', ') || 'Other')}
          {line('Tags', artwork.tags.join(', '))}
          {line('Collection', artwork.collections.join(', '))}
          {line(
            'Price',
            showPrice ? `${artwork.currency} ${(artwork.priceMinor! / 100).toFixed(2)}` : null,
          )}
          {!showPrice && artwork.priceMinor !== null && line('Price', 'Hidden on cards')}
        </View>
      </Card>
      {artwork.fullDescription ? (
        <View>
          <Text style={styles.heading}>Full description</Text>
          <Text selectable style={styles.body}>
            {artwork.fullDescription}
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
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
  imageFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceMuted,
  },
  missing: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, fontWeight: '600' },
  artist: { color: colors.inkMuted, fontSize: 19 },
  shortDescription: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  status: { color: colors.accent, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  cardBody: { padding: spacing.md },
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  lineLabel: { width: 96, color: colors.inkMuted, fontWeight: '700' },
  lineValue: { flex: 1, color: colors.ink },
  heading: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.inkMuted, textAlign: 'center' },
});
