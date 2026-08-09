import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSetting } from '@/data/artworkRepository';
import { ARTWORK_STATUSES, type Artwork, type ArtworkSort } from '@/domain/artwork';
import { parseProfileRole, type ProfileRole } from '@/domain/profile';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, radii, spacing, type ColorTokens } from '@/ui/theme';

const useStyles = (): ReturnType<typeof createStyles> => {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
};

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

type OpenMenu = 'status' | 'sort' | null;

const statusColor = (status: Artwork['status'], colors: ColorTokens): string => {
  if (status === 'Available') return colors.success;
  if (status === 'Sold') return colors.accent;
  if (status === 'Reserved') return '#E29A37';
  return colors.inkMuted;
};

function ArtworkTile({ artwork }: { artwork: Artwork }): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useStyles();
  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${artwork.title}, ${artwork.artist || 'artist not specified'}, ${artwork.status}`}
      onPress={() => router.push({ pathname: '/artwork/[id]', params: { id: artwork.id } })}
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
          <View style={[styles.statusDot, { backgroundColor: statusColor(artwork.status, colors) }]} />
          <Text style={styles.status}>{artwork.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function VaultScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useStyles();
  const database = useSQLiteContext();
  const { artworks, query, setQuery, loading, error, refresh } = useArtworks();
  const [search, setSearch] = useState(query.search);
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSetting(database, 'profile_role').then((value) => {
        if (active) setRole(parseProfileRole(value));
      });
      return () => {
        active = false;
      };
    }, [database]),
  );

  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => setQuery((current) => ({ ...current, search })), 250);
    return () => clearTimeout(timer);
  }, [query.search, search, setQuery]);

  const roleSummary = useMemo(() => {
    if (role === 'artist') {
      return [
        { label: 'Available', value: artworks.filter((artwork) => artwork.status === 'Available').length },
        { label: 'Sold', value: artworks.filter((artwork) => artwork.status === 'Sold').length },
        {
          label: 'Exhibiting',
          value: artworks.filter((artwork) => artwork.status === 'On Exhibition').length,
        },
      ];
    }
    if (role === 'both') {
      return [
        { label: 'Total works', value: artworks.length },
        { label: 'Available', value: artworks.filter((artwork) => artwork.status === 'Available').length },
        {
          label: 'On display',
          value: artworks.filter((artwork) => artwork.status === 'On Exhibition').length,
        },
      ];
    }
    return [
      { label: 'Catalogued', value: artworks.length },
      {
        label: 'On display',
        value: artworks.filter((artwork) => artwork.status === 'On Exhibition').length,
      },
      { label: 'Archived', value: artworks.filter((artwork) => artwork.status === 'Archived').length },
    ];
  }, [artworks, role]);

  const selectedSortLabel = SORTS.find((sort) => sort.value === query.sort)?.label ?? 'Updated';

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View>
          <Text accessibilityRole="header" style={styles.pageTitle}>
            {role === 'artist' ? 'My Studio' : role === 'both' ? 'Studio & Collection' : 'My Collection'}
          </Text>
          <Text style={styles.count}>
            {artworks.length}{' '}
            {role === 'collector'
              ? 'collected works'
              : role === 'both'
                ? 'works in your shared archive'
                : 'works in your archive'}
          </Text>
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
      <View style={styles.roleSummary}>
        <Text style={styles.roleEyebrow}>
          {role === 'artist' ? 'ARTIST WORKSPACE' : role === 'both' ? 'CREATIVE ARCHIVE' : 'COLLECTOR ARCHIVE'}
        </Text>
        <Text style={styles.roleMessage}>
          {role === 'artist'
            ? 'Track your practice, availability, and exhibition-ready portfolio.'
            : role === 'both'
              ? 'Manage your artistic practice and collected works together in one private vault.'
            : 'Keep your collection, provenance, and locations organized privately.'}
        </Text>
        <View style={styles.metrics}>
          {roleSummary.map((metric) => (
            <View key={metric.label} style={styles.metric}>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
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
      <View style={styles.controls}>
        <MenuButton
          label="Status"
          value={query.status ?? 'All artworks'}
          onPress={() => setOpenMenu('status')}
          styles={styles}
        />
        <MenuButton
          label="Sort"
          value={selectedSortLabel}
          onPress={() => setOpenMenu('sort')}
          styles={styles}
        />
      </View>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Your archive</Text>
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
      <SelectionMenu
        visible={openMenu === 'status'}
        title="Filter by status"
        options={[
          { label: 'All artworks', value: null },
          ...ARTWORK_STATUSES.map((status) => ({ label: status, value: status })),
        ]}
        selectedValue={query.status}
        onClose={() => setOpenMenu(null)}
        onSelect={(value) => {
          setQuery((current) => ({ ...current, status: value }));
          setOpenMenu(null);
        }}
        styles={styles}
      />
      <SelectionMenu
        visible={openMenu === 'sort'}
        title="Sort artworks"
        options={SORTS}
        selectedValue={query.sort}
        onClose={() => setOpenMenu(null)}
        onSelect={(value) => {
          setQuery((current) => ({ ...current, sort: value }));
          setOpenMenu(null);
        }}
        styles={styles}
      />
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
          numColumns={2}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={7}
        />
      )}
    </SafeAreaView>
  );
}

type VaultStyles = ReturnType<typeof createStyles>;

function MenuButton({
  label,
  value,
  onPress,
  styles,
}: {
  label: string;
  value: string;
  onPress: () => void;
  styles: VaultStyles;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
    >
      <View style={styles.menuButtonCopy}>
        <Text style={styles.menuButtonLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.menuButtonValue}>
          {value}
        </Text>
      </View>
      <Text style={styles.menuChevron}>⌄</Text>
    </Pressable>
  );
}

function SelectionMenu<Value extends string | null>({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
  styles,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: Value }[];
  selectedValue: Value;
  onClose: () => void;
  onSelect: (value: Value) => void;
  styles: VaultStyles;
}): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={styles.menuBackdrop} onPress={onClose}>
        <Pressable style={styles.menuSheet}>
          <Text accessibilityRole="header" style={styles.menuTitle}>
            {title}
          </Text>
          <ScrollView contentContainerStyle={styles.menuOptions}>
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value ?? 'all'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(option.value)}
                  style={[styles.menuOption, selected && styles.menuOptionSelected]}
                >
                  <Text style={[styles.menuOptionText, selected && styles.menuOptionTextSelected]}>
                    {option.label}
                  </Text>
                  {selected && <Text style={styles.menuCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pageTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 35, fontWeight: '600', letterSpacing: -0.5 },
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
  roleSummary: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  roleEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  roleMessage: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  metrics: { flexDirection: 'row', paddingTop: spacing.xs },
  metric: { flex: 1 },
  metricValue: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: '600' },
  metricLabel: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
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
  controls: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  menuButton: {
    minWidth: 0,
    flex: 1,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  menuButtonCopy: { minWidth: 0, flex: 1 },
  menuButtonLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  menuButtonValue: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 2 },
  menuChevron: { color: colors.accent, fontSize: 20, marginLeft: spacing.sm },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  menuSheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '72%',
    alignSelf: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  menuTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  menuOptions: { gap: spacing.xs },
  menuOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  menuOptionSelected: { backgroundColor: colors.surfaceMuted },
  menuOptionText: { color: colors.ink, fontSize: 16 },
  menuOptionTextSelected: { color: colors.accent, fontWeight: '800' },
  menuCheck: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: '600' },
  exhibitLink: { color: colors.accent, fontWeight: '800' },
  list: { paddingBottom: spacing.xl, gap: spacing.sm },
  columns: { justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md },
  tile: {
    width: '48.5%',
    minWidth: 0,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.72 },
  thumbnail: { width: '100%', aspectRatio: 0.92, backgroundColor: colors.surfaceMuted },
  missingImage: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  placeholderMark: { color: colors.accent, fontFamily: fonts.display, fontSize: 25, fontWeight: '600' },
  missingText: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.xs },
  tileBody: { padding: spacing.sm, gap: spacing.sm },
  tileText: { gap: 2 },
  tileTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 16, fontWeight: '600' },
  artist: { color: colors.ink, fontSize: 12 },
  meta: { color: colors.inkMuted, fontSize: 11 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  status: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: '600' },
  emptyCopy: { color: colors.inkMuted, fontSize: 15, textAlign: 'center' },
});
