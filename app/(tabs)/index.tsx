import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ARTWORK_STATUSES, type Artwork, type ArtworkSort } from '@/domain/artwork';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Chip, ScreenState } from '@/ui/components';
import { colors, radii, spacing } from '@/ui/theme';

const SORTS: { value: ArtworkSort; label: string }[] = [
  { value: 'recently-updated', label: 'Updated' },
  { value: 'recently-added', label: 'Added' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title-asc', label: 'A–Z' },
  { value: 'title-desc', label: 'Z–A' },
  { value: 'artwork-id', label: 'Artwork ID' },
  { value: 'status', label: 'Status' },
];

const statusColor = (status: Artwork['status']): string => {
  if (status === 'Available') return colors.success;
  if (status === 'Sold') return colors.accent;
  if (status === 'Reserved') return '#E29A37';
  return colors.inkMuted;
};

function ArtworkTile({ artwork }: { artwork: Artwork }): React.JSX.Element {
  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${artwork.title}, ${artwork.artist || 'artist not specified'}, ${artwork.status}`}
      onPress={() => router.push({ pathname: '/artwork/[id]/index', params: { id: artwork.id } })}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      {hasImage && artwork.primaryImageUri ? (
        <Image source={{ uri: artwork.primaryImageUri }} style={styles.thumbnail} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumbnail, styles.missingImage]}>
          <Text style={styles.placeholderMark}>AC</Text>
          <Text style={styles.missingText}>No image</Text>
        </View>
      )}
      <View style={styles.tileBody}>
        <View style={styles.tileText}>
          <Text numberOfLines={1} style={styles.tileTitle}>
            {artwork.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {artwork.artist || 'Artist not specified'}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {[artwork.medium, artwork.completionYear].filter(Boolean).join(' · ') || artwork.humanId}
          </Text>
        </View>
        <View style={styles.tileFooter}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(artwork.status) }]} />
          <Text style={styles.status}>{artwork.status}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

function CollectionSummary({ artworks }: { artworks: Artwork[] }): React.JSX.Element {
  const summary = useMemo(() => {
    const value = artworks.reduce((total, artwork) => total + (artwork.priceMinor ?? 0), 0);
    return {
      value,
      currency: artworks.find((artwork) => artwork.priceMinor !== null)?.currency ?? 'USD',
      available: artworks.filter((artwork) => artwork.status === 'Available').length,
      sold: artworks.filter((artwork) => artwork.status === 'Sold').length,
    };
  }, [artworks]);

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <View>
          <Text style={styles.summaryLabel}>CATALOG VALUE</Text>
          <Text style={styles.summaryValue}>
            {summary.currency} {(summary.value / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.totalBlock}>
          <Text style={styles.totalValue}>{artworks.length}</Text>
          <Text style={styles.summaryLabel}>TOTAL WORKS</Text>
        </View>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: colors.success }]}>{summary.available}</Text>
          <Text style={styles.metricLabel}>Available</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: colors.accent }]}>{summary.sold}</Text>
          <Text style={styles.metricLabel}>Sold</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{artworks.length - summary.available - summary.sold}</Text>
          <Text style={styles.metricLabel}>Other</Text>
        </View>
      </View>
    </View>
  );
}

export default function VaultScreen(): React.JSX.Element {
  const { artworks, query, setQuery, loading, error, refresh } = useArtworks();
  const [search, setSearch] = useState(query.search);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => setQuery({ ...query, search }), 250);
    return () => clearTimeout(timer);
  }, [query, search, setQuery]);

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View>
          <Text accessibilityRole="header" style={styles.pageTitle}>
            Collection
          </Text>
          <Text style={styles.count}>{artworks.length} artworks</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add artwork"
          onPress={() => router.push('/artwork/new')}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addIcon}>＋</Text>
        </Pressable>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search artworks"
          placeholder="Search title, artist, tag, location…"
          placeholderTextColor={colors.inkMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          style={styles.search}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          onPress={() => router.push('/filters')}
          style={styles.filterSquare}
        >
          <Text style={styles.filterGlyph}>≡</Text>
        </Pressable>
      </View>
      <CollectionSummary artworks={artworks} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip label="All" selected={!query.status} onPress={() => setQuery({ ...query, status: null })} />
        {ARTWORK_STATUSES.map((status) => (
          <Chip
            key={status}
            label={status}
            selected={query.status === status}
            onPress={() => setQuery({ ...query, status })}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
        <Text style={styles.sortLabel}>Sort</Text>
        {SORTS.map((sort) => (
          <Chip
            key={sort.value}
            label={sort.label}
            selected={query.sort === sort.value}
            onPress={() => setQuery({ ...query, sort: sort.value })}
          />
        ))}
      </ScrollView>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Artworks</Text>
        {artworks.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/exhibit')}>
            <Text style={styles.exhibitLink}>Exhibit mode</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {loading || error || artworks.length === 0 ? (
        <View style={styles.flex}>
          {header}
          <ScreenState
            loading={loading}
            error={error}
            onRetry={() => void refresh()}
            empty={
              <>
                <Text style={styles.emptyTitle}>{query.search || query.status ? 'No matches' : 'Your vault is empty'}</Text>
                <Text style={styles.emptyCopy}>
                  {query.search || query.status
                    ? 'Try changing your search or filter.'
                    : 'Add your first artwork to begin your private catalog.'}
                </Text>
                {!query.search && !query.status && (
                  <Button label="Add first artwork" onPress={() => router.push('/artwork/new')} />
                )}
              </>
            }
          />
        </View>
      ) : (
        <FlatList
          data={artworks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ArtworkTile artwork={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pageTitle: { color: colors.ink, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  count: { color: colors.inkMuted, fontSize: 14, marginTop: 2 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addIcon: { color: '#FFFFFF', fontSize: 25, lineHeight: 28 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.md },
  search: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  filterSquare: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  filterGlyph: { color: '#FFFFFF', fontSize: 25, fontWeight: '700', transform: [{ rotate: '90deg' }] },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#20253A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  summaryValue: { color: colors.ink, fontSize: 26, fontWeight: '900', marginTop: spacing.xs },
  totalBlock: { alignItems: 'flex-end' },
  totalValue: { color: colors.ink, fontSize: 25, fontWeight: '900' },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  metrics: { flexDirection: 'row' },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  metricLabel: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sorts: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignItems: 'center' },
  sortLabel: { color: colors.inkMuted, fontWeight: '800' },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  exhibitLink: { color: colors.accent, fontWeight: '800' },
  list: { paddingBottom: spacing.xl, gap: spacing.sm },
  tile: {
    flexDirection: 'row',
    minHeight: 104,
    marginHorizontal: spacing.md,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.72 },
  thumbnail: { width: 104, minHeight: 104, backgroundColor: colors.surfaceMuted },
  missingImage: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  placeholderMark: { color: colors.accent, fontSize: 22, fontWeight: '900' },
  missingText: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.xs },
  tileBody: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  tileText: { flex: 1, gap: 2 },
  tileTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  artist: { color: colors.ink, fontSize: 14 },
  meta: { color: colors.inkMuted, fontSize: 12 },
  tileFooter: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  status: { color: colors.inkMuted, fontSize: 10, fontWeight: '700', maxWidth: 68, textAlign: 'center' },
  chevron: { color: colors.inkMuted, fontSize: 24 },
  emptyTitle: { color: colors.ink, fontSize: 23, fontWeight: '900' },
  emptyCopy: { color: colors.inkMuted, fontSize: 15, textAlign: 'center' },
});
