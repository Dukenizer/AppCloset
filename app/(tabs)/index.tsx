import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addArtworksToCollection,
  archiveCollection,
  createCollection,
  getDisplayUnit,
  getSetting,
  listArtworks,
  listCollections,
  removeArtworksFromCollection,
  renameCollection,
  setSetting,
  type CollectionRecord,
} from '@/data/artworkRepository';
import { clearFeaturedArtworkId, resolveFeaturedArtwork } from '@/data/featuredArtwork';
import { type Artwork, type ArtworkQuery, type ArtworkSort } from '@/domain/artwork';
import { formatDimensions } from '@/domain/dimensions';
import type { DisplayUnit } from '@/domain/profile';
import { CreateCollectionModal } from '@/features/collections/CreateCollectionModal';
import { supportsBatchUpload } from '@/platform/capabilities';
import { emailSelectedArtworks } from '@/services/buyerEmailService';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, ScreenState } from '@/ui/components';
import { statusDotColor } from '@/ui/statusColors';
import { useTheme } from '@/ui/ThemeProvider';
import { fonts, radii, spacing, type ColorTokens } from '@/ui/theme';

type ArchiveViewMode = 'grid' | 'list';

const ARCHIVE_VIEW_SETTING = 'archive_view_mode';

const FEATURED_QUERY: ArtworkQuery = {
  search: '',
  status: null,
  sort: 'recently-updated',
  year: '',
  dateFrom: '',
  dateTo: '',
  artist: '',
  genre: '',
  tag: '',
  medium: '',
  material: '',
  collection: '',
  collectionId: null,
  orientation: null,
  sizeBucket: null,
};

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
  { value: 'status', label: 'Status' },
];

type OpenMenu = 'sort' | 'collection' | null;

const statusColor = (status: Artwork['status'], colors: ColorTokens): string =>
  statusDotColor(status, colors);

const parseArchiveViewMode = (value: string | null): ArchiveViewMode =>
  value === 'list' ? 'list' : 'grid';

function SelectionCheck({ selected, styles }: { selected: boolean; styles: VaultStyles }): React.JSX.Element {
  return (
    <View style={[styles.checkOuter, selected && styles.checkOuterSelected]}>
      {selected ? <Text style={styles.checkMark}>✓</Text> : null}
    </View>
  );
}

function ArtworkTile({
  artwork,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  artwork: Artwork;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useStyles();
  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${artwork.title}, ${artwork.artist || 'artist not specified'}, ${artwork.status}${
        selecting ? (selected ? ', selected' : ', not selected') : ''
      }`}
      accessibilityState={selecting ? { selected } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.pressed]}
    >
      {selecting ? (
        <View style={styles.tileCheck}>
          <SelectionCheck selected={selected} styles={styles} />
        </View>
      ) : null}
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
            {[artwork.medium, artwork.completionYear].filter(Boolean).join(' · ') || '\u00A0'}
          </Text>
        </View>
        <View style={styles.tileFooter}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(artwork.status, colors) }]} />
          <Text style={[styles.status, { color: statusColor(artwork.status, colors) }]}>{artwork.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ArtworkRow({
  artwork,
  selecting,
  selected,
  displayUnit,
  onPress,
  onLongPress,
}: {
  artwork: Artwork;
  selecting: boolean;
  selected: boolean;
  displayUnit: DisplayUnit;
  onPress: () => void;
  onLongPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useStyles();
  const hasImage = imageExists(artwork.primaryImageUri);
  const dimensions = formatDimensions(artwork.width, artwork.height, artwork.depth, displayUnit);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${artwork.title}, ${artwork.artist || 'artist not specified'}, ${artwork.status}${
        selecting ? (selected ? ', selected' : ', not selected') : ''
      }`}
      accessibilityState={selecting ? { selected } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      {selecting ? (
        <View style={styles.rowCheck}>
          <SelectionCheck selected={selected} styles={styles} />
        </View>
      ) : null}
      {hasImage && artwork.primaryImageUri ? (
        <Image source={{ uri: artwork.primaryImageUri }} style={styles.rowThumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.rowThumb, styles.missingImage]}>
          <Text style={styles.rowPlaceholder}>AC</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.tileTitle}>
          {artwork.title}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {[dimensions, artwork.artist].filter(Boolean).join(' · ') || artwork.artist || '\u00A0'}
        </Text>
      </View>
      <View
        style={[styles.statusDotOnly, { backgroundColor: statusColor(artwork.status, colors) }]}
        accessibilityLabel={artwork.status}
      />
    </Pressable>
  );
}

export default function VaultScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const database = useSQLiteContext();
  const { artworks, query, stats, globalTotal, setQuery, loading, error, refresh, archive } = useArtworks();
  const [search, setSearch] = useState(query.search);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [viewMode, setViewMode] = useState<ArchiveViewMode>('grid');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('cm');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [emailBusy, setEmailBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [createCollectionBusy, setCreateCollectionBusy] = useState(false);
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false);
  const [addToBusy, setAddToBusy] = useState(false);
  const [createForSelection, setCreateForSelection] = useState(false);
  const [editCollectionOpen, setEditCollectionOpen] = useState(false);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editCollectionError, setEditCollectionError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [featuredArtwork, setFeaturedArtwork] = useState<Artwork | null>(null);
  const [featuredPinned, setFeaturedPinned] = useState(false);

  const showEmptyStudio = !loading && !error && globalTotal === 0;
  /** Specific collection with zero artworks (unfiltered) — not a failed search. */
  const showEmptyCollection =
    !loading && !error && !showEmptyStudio && query.collectionId !== null && stats.total === 0;
  /** Collection/vault has works, but search or filters exclude everything. */
  const showNoMatches =
    !loading && !error && !showEmptyStudio && !showEmptyCollection && artworks.length === 0;
  /** Full-width Add CTA once the studio has content (empty studio / empty collection use their own CTAs). */
  const showProminentAdd = !showEmptyStudio && !showEmptyCollection;
  const selectedCount = selectedIds.length;
  const canRemoveFromCollection = query.collectionId !== null;

  const clearListFilters = useCallback((): void => {
    setSearch('');
    setQuery((current) => ({
      ...current,
      search: '',
      status: null,
      year: '',
      dateFrom: '',
      dateTo: '',
      artist: '',
      genre: '',
      tag: '',
      medium: '',
      material: '',
      collection: '',
      orientation: null,
      sizeBucket: null,
    }));
  }, [setQuery]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listCollections(database).then((items) => {
        if (active) setCollections(items);
      });
      void getSetting(database, ARCHIVE_VIEW_SETTING).then((value) => {
        if (active) setViewMode(parseArchiveViewMode(value));
      });
      void getDisplayUnit(database).then((unit) => {
        if (active) setDisplayUnit(unit);
      });
      void listArtworks(database, FEATURED_QUERY).then(async (items) => {
        if (!active) return;
        const resolved = await resolveFeaturedArtwork(database, items);
        if (!active) return;
        setFeaturedArtwork(resolved.artwork);
        setFeaturedPinned(resolved.pinned);
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

  useEffect(() => {
    setSelecting(false);
    setSelectedIds([]);
  }, [query.collectionId]);

  const selectedCollection = collections.find((collection) => collection.id === query.collectionId) ?? null;
  const selectedCollectionLabel = selectedCollection?.name ?? 'All collections';
  const canManageSelectedCollection = Boolean(selectedCollection && !selectedCollection.isSystem);

  const openAddArtwork = useCallback((): void => {
    if (selectedCollection) {
      router.push({
        pathname: '/artwork/new',
        params: { collection: selectedCollection.name },
      });
      return;
    }
    router.push('/artwork/new');
  }, [selectedCollection]);

  const selectedSortLabel = SORTS.find((sort) => sort.value === query.sort)?.label ?? 'Updated';

  const reloadFeatured = useCallback(async (): Promise<void> => {
    const items = await listArtworks(database, FEATURED_QUERY);
    const resolved = await resolveFeaturedArtwork(database, items);
    setFeaturedArtwork(resolved.artwork);
    setFeaturedPinned(resolved.pinned);
  }, [database]);

  const openFeaturedActions = useCallback((): void => {
    if (!featuredArtwork) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open artwork',
        onPress: () =>
          router.push({ pathname: '/artwork/[id]', params: { id: featuredArtwork.id } }),
      },
    ];
    if (featuredPinned) {
      buttons.push({
        text: 'Use automatic featured',
        onPress: () => {
          void (async () => {
            await clearFeaturedArtworkId(database);
            await reloadFeatured();
          })();
        },
      });
    } else {
      buttons.push({
        text: 'Choose another artwork',
        onPress: () =>
          Alert.alert(
            'Choose featured artwork',
            'Open any artwork, then tap “Set as featured”.',
          ),
      });
    }
    Alert.alert(
      featuredPinned ? 'Featured artwork' : 'Featured artwork (automatic)',
      featuredArtwork.title,
      buttons,
    );
  }, [database, featuredArtwork, featuredPinned, reloadFeatured]);

  const exitSelection = useCallback((): void => {
    setSelecting(false);
    setSelectedIds([]);
  }, []);

  const enterSelection = useCallback((artworkId: number): void => {
    setSelecting(true);
    setSelectedIds([artworkId]);
  }, []);

  const toggleSelection = useCallback((artworkId: number): void => {
    setSelectedIds((current) =>
      current.includes(artworkId) ? current.filter((id) => id !== artworkId) : [...current, artworkId],
    );
  }, []);

  const handleArtworkPress = useCallback(
    (artwork: Artwork): void => {
      if (selecting) {
        toggleSelection(artwork.id);
        return;
      }
      router.push({ pathname: '/artwork/[id]', params: { id: artwork.id } });
    },
    [selecting, toggleSelection],
  );

  const persistViewMode = useCallback(
    (mode: ArchiveViewMode): void => {
      setViewMode(mode);
      void setSetting(database, ARCHIVE_VIEW_SETTING, mode);
    },
    [database],
  );

  const handleEmail = useCallback(async (): Promise<void> => {
    const selected = artworks.filter((artwork) => selectedIds.includes(artwork.id));
    if (selected.length === 0) return;
    setEmailBusy(true);
    try {
      await emailSelectedArtworks(selected, displayUnit);
      exitSelection();
    } catch (shareError) {
      Alert.alert(
        'Unable to email',
        shareError instanceof Error ? shareError.message : 'Could not open the mail composer.',
      );
    } finally {
      setEmailBusy(false);
    }
  }, [artworks, displayUnit, exitSelection, selectedIds]);

  const handleRemoveFromCollection = useCallback((): void => {
    if (!query.collectionId || selectedIds.length === 0) return;
    const collectionName = selectedCollectionLabel;
    Alert.alert(
      'Remove from collection?',
      `Remove ${selectedIds.length} selected ${selectedIds.length === 1 ? 'artwork' : 'artworks'} from “${collectionName}”? The artworks stay in your archive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemoveBusy(true);
              try {
                await removeArtworksFromCollection(database, query.collectionId!, selectedIds);
                exitSelection();
                await refresh();
              } catch (removeError) {
                Alert.alert(
                  'Unable to remove',
                  removeError instanceof Error ? removeError.message : 'Could not update the collection.',
                );
              } finally {
                setRemoveBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [database, exitSelection, query.collectionId, refresh, selectedCollectionLabel, selectedIds]);

  const reloadCollections = useCallback(async (): Promise<CollectionRecord[]> => {
    const rows = await listCollections(database);
    setCollections(rows);
    return rows;
  }, [database]);

  const handleCreateCollection = useCallback(
    async (name: string): Promise<void> => {
      setCreateCollectionBusy(true);
      try {
        const collectionId = await createCollection(database, name);
        const rows = await reloadCollections();
        if (createForSelection && selectedIds.length > 0) {
          await addArtworksToCollection(database, collectionId, selectedIds);
          exitSelection();
          await refresh();
          setCreateForSelection(false);
          setCreateCollectionOpen(false);
          return;
        }
        const created = rows.find((row) => row.id === collectionId);
        setQuery((current) => ({
          ...current,
          collectionId,
          collection: created?.name ?? name,
        }));
        setCreateCollectionOpen(false);
      } finally {
        setCreateCollectionBusy(false);
      }
    },
    [createForSelection, database, exitSelection, refresh, reloadCollections, selectedIds, setQuery],
  );

  const handleAddToCollection = useCallback(
    (collectionId: number): void => {
      if (selectedIds.length === 0) return;
      void (async () => {
        setAddToBusy(true);
        try {
          await addArtworksToCollection(database, collectionId, selectedIds);
          setAddToCollectionOpen(false);
          exitSelection();
          await refresh();
        } catch (addError) {
          Alert.alert(
            'Unable to add',
            addError instanceof Error ? addError.message : 'Could not add artworks to the collection.',
          );
        } finally {
          setAddToBusy(false);
        }
      })();
    },
    [database, exitSelection, refresh, selectedIds],
  );

  const openEditCollection = useCallback((): void => {
    setEditCollectionName(selectedCollection?.name ?? '');
    setEditCollectionError(null);
    setEditCollectionOpen(true);
  }, [selectedCollection?.name]);

  const handleRenameCollection = useCallback(async (): Promise<void> => {
    if (!selectedCollection) return;
    const name = editCollectionName.trim();
    if (!name) {
      setEditCollectionError('Enter a collection name.');
      return;
    }
    setEditCollectionError(null);
    setRenameBusy(true);
    try {
      await renameCollection(database, selectedCollection.id, name);
      await reloadCollections();
      setQuery((current) => ({ ...current, collection: name }));
      setEditCollectionOpen(false);
      await refresh();
    } catch (renameError) {
      setEditCollectionError(
        renameError instanceof Error ? renameError.message : 'Could not rename collection.',
      );
    } finally {
      setRenameBusy(false);
    }
  }, [database, editCollectionName, refresh, reloadCollections, selectedCollection, setQuery]);

  const handleArchiveCollection = useCallback((): void => {
    if (!selectedCollection || selectedCollection.isSystem) return;
    Alert.alert(
      'Archive collection?',
      `“${selectedCollection.name}” will be hidden from filters. Artworks stay in your vault and can return to this collection if you restore it from Settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setArchiveBusy(true);
              try {
                await archiveCollection(database, selectedCollection.id);
                await reloadCollections();
                setQuery((current) => ({ ...current, collectionId: null, collection: '' }));
                setEditCollectionOpen(false);
                await refresh();
              } catch (archiveError) {
                Alert.alert(
                  'Unable to archive',
                  archiveError instanceof Error ? archiveError.message : 'Could not archive collection.',
                );
              } finally {
                setArchiveBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [database, refresh, reloadCollections, selectedCollection, setQuery]);

  const handleMoveToTrash = useCallback((): void => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    Alert.alert(
      count === 1 ? 'Move artwork to trash?' : `Move ${count} artworks to trash?`,
      'Selected artworks will be hidden from your vault. You can restore them later from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to trash',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setTrashBusy(true);
              try {
                const selected = artworks.filter((artwork) => selectedIds.includes(artwork.id));
                for (const artwork of selected) {
                  await archive(artwork);
                }
                exitSelection();
                await refresh();
              } catch (trashError) {
                Alert.alert(
                  'Unable to trash',
                  trashError instanceof Error ? trashError.message : 'Could not move artworks to trash.',
                );
              } finally {
                setTrashBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [archive, artworks, exitSelection, refresh, selectedIds]);

  const titleBlock = selecting ? (
    <View style={styles.selectionTopBar}>
      <Text accessibilityRole="header" style={styles.selectionCount}>
        {selectedCount} selected
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel selection"
        onPress={exitSelection}
        style={({ pressed }) => [styles.cancelChip, pressed && styles.pressed]}
      >
        <Text style={styles.cancelChipText}>Cancel</Text>
      </Pressable>
    </View>
  ) : showEmptyStudio ? null : (
    <View style={styles.heroHeader}>
      <View style={styles.heroBrand}>
        <View style={styles.heroBrandTitleWrap}>
          <Image
            source={require('../../assets/palette-brush.png')}
            style={styles.heroBrandSilhouette}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            importantForAccessibility="no"
          />
          <Text accessibilityRole="header" style={styles.pageTitle}>
            <Text style={styles.pageTitleArt}>Art</Text>
            <Text style={styles.pageTitleCloset}>Closet</Text>
          </Text>
        </View>
        <Text style={styles.workspaceLabel}>
          <Text style={{ color: colors.statusAvailable }}>{stats.available} available</Text>
          {' · '}
          <Text style={{ color: colors.statusSold }}>{stats.sold} sold</Text>
          {' · '}
          <Text style={{ color: colors.statusExhibiting }}>{stats.exhibiting} exhibiting</Text>
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          featuredArtwork
            ? `Featured artwork: ${featuredArtwork.title}. Double-tap to open. Long-press for options.`
            : 'Featured artwork placeholder'
        }
        disabled={!featuredArtwork}
        onPress={() => {
          if (!featuredArtwork) return;
          router.push({ pathname: '/artwork/[id]', params: { id: featuredArtwork.id } });
        }}
        onLongPress={openFeaturedActions}
        delayLongPress={350}
        style={({ pressed }) => [styles.heroFeatured, pressed && featuredArtwork && styles.pressed]}
      >
        {featuredArtwork?.primaryImageUri && imageExists(featuredArtwork.primaryImageUri) ? (
          <Image
            source={{ uri: featuredArtwork.primaryImageUri }}
            style={styles.heroFeaturedImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.heroFeaturedImage, styles.heroFeaturedPlaceholder]}>
            <Image
              source={require('../../assets/palette-brush.png')}
              style={styles.heroPlaceholderMark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
        <View style={styles.heroFade} pointerEvents="none">
          {[0.92, 0.72, 0.48, 0.24, 0.08].map((opacity, index) => (
            <View
              key={`fade-${index}`}
              style={[styles.heroFadeStrip, { backgroundColor: colors.background, opacity }]}
            />
          ))}
        </View>
        <View style={styles.heroFeaturedMeta} pointerEvents="none">
          <Text style={styles.heroFeaturedEyebrow}>
            {featuredPinned ? 'Featured' : 'Featured · Auto'}
          </Text>
          <Text numberOfLines={1} style={styles.heroFeaturedTitle}>
            {featuredArtwork?.title ?? 'Your gallery'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        onPress={() => router.push('/(tabs)/settings')}
        style={({ pressed }) => [styles.heroSettings, pressed && styles.pressed]}
      >
        <Text style={styles.heroSettingsGlyph}>⚙</Text>
      </Pressable>
    </View>
  );

  const archiveControls = !showEmptyStudio && !selecting ? (
    <>
      {showProminentAdd ? (
        <View style={styles.primaryActionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add artwork"
            onPress={openAddArtwork}
            style={({ pressed }) => [styles.addArtworkButton, pressed && styles.pressed]}
          >
            <Text style={styles.addArtworkButtonText}>+ Add artwork</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.collectionSwitcherRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Collection: ${selectedCollectionLabel}`}
          onPress={() => setOpenMenu('collection')}
          style={({ pressed }) => [styles.collectionSwitcher, pressed && styles.pressed]}
        >
          <Text numberOfLines={1} style={styles.collectionSwitcherValue}>
            {selectedCollectionLabel}
          </Text>
          <Text style={styles.menuChevron}>⌄</Text>
        </Pressable>
        {canManageSelectedCollection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${selectedCollectionLabel}`}
            onPress={openEditCollection}
            style={({ pressed }) => [styles.editCollectionIconButton, pressed && styles.pressed]}
          >
            <Text style={styles.editCollectionGlyph}>✎</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New collection"
          disabled={createCollectionBusy}
          onPress={() => {
            setCreateForSelection(false);
            setCreateCollectionOpen(true);
          }}
          style={({ pressed }) => [styles.newCollectionButton, pressed && styles.pressed]}
        >
          <Text style={styles.newCollectionButtonText}>+ Collection</Text>
        </Pressable>
      </View>
      {!showEmptyCollection ? (
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Search artworks"
            placeholder="Search title, artist, tag…"
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            style={styles.search}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              query.status || query.year.trim()
                ? `Filters active${query.status ? `, status ${query.status}` : ''}${
                    query.year.trim() ? `, year ${query.year}` : ''
                  }`
                : 'Open filters'
            }
            onPress={() => router.push('/filters')}
            style={({ pressed }) => [styles.filterSquare, pressed && styles.pressed]}
          >
            <Text style={styles.filterGlyph}>≡</Text>
          </Pressable>
        </View>
      ) : null}
      {!showEmptyCollection ? (
        <View style={styles.sectionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${selectedSortLabel}`}
            onPress={() => setOpenMenu('sort')}
            style={({ pressed }) => [styles.toolbarChip, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.toolbarChipText}>
              {selectedSortLabel}
            </Text>
            <Text style={styles.toolbarChevron}>⌄</Text>
          </Pressable>
          {artworks.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exhibit mode"
              onPress={() => router.push('/exhibit')}
              style={({ pressed }) => [styles.toolbarChip, pressed && styles.pressed]}
            >
              <Text style={styles.toolbarChipText}>Exhibit mode</Text>
            </Pressable>
          ) : null}
          {artworks.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Labels"
              onPress={() => router.push('/labels')}
              style={({ pressed }) => [styles.toolbarChip, pressed && styles.pressed]}
            >
              <Text style={styles.toolbarChipText}>Labels</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            onPress={() => persistViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            style={({ pressed }) => [styles.viewToggle, pressed && styles.pressed]}
          >
            <Text style={styles.viewToggleGlyph}>{viewMode === 'grid' ? '☰' : '▦'}</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  ) : null;

  const archiveChrome = (
    <View>
      {titleBlock}
      {archiveControls}
      {selecting ? (
        <Text style={styles.selectionHint}>Tap artworks to select. Long-press also works.</Text>
      ) : null}
    </View>
  );

  const listEmpty = showEmptyCollection ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add artwork to this collection"
      onPress={openAddArtwork}
      style={({ pressed }) => [styles.emptyCollectionCard, pressed && styles.pressed]}
    >
      <Text style={styles.emptyCollectionIcon}>⬚</Text>
      <Text style={styles.emptyTitle}>This collection is empty</Text>
      <Text style={styles.emptyCopy}>Add your first artwork to get started</Text>
      <View style={styles.emptyCollectionCta}>
        <Text style={styles.emptyCollectionCtaText}>+ Add artwork</Text>
      </View>
    </Pressable>
  ) : showNoMatches ? (
    <View style={styles.filteredEmpty}>
      <Text style={styles.emptyTitle}>No matches</Text>
      <Text style={styles.emptyCopy}>Try changing your search or filter.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear filters"
        onPress={clearListFilters}
        style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.pressed]}
      >
        <Text style={styles.clearFiltersText}>Clear filters</Text>
      </Pressable>
    </View>
  ) : loading ? (
    <ScreenState loading error={null} onRetry={() => void refresh()} empty={null} />
  ) : error ? (
    <ScreenState loading={false} error={error} onRetry={() => void refresh()} empty={null} />
  ) : null;

  const selectionBusy = emailBusy || removeBusy || trashBusy || addToBusy;
  const bottomBar =
    selecting && selectedCount > 0 ? (
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.bottomBarButtons}>
          <View style={styles.bottomBarFlex}>
            <Button
              label="Add to…"
              variant="secondary"
              disabled={selectionBusy}
              onPress={() => setAddToCollectionOpen(true)}
            />
          </View>
          <View style={styles.bottomBarFlex}>
            <Button
              label={emailBusy ? 'Preparing…' : 'Email'}
              disabled={selectionBusy}
              onPress={() => void handleEmail()}
            />
          </View>
          <View style={styles.bottomBarFlex}>
            <Button
              label={trashBusy ? 'Trashing…' : 'Trash'}
              variant="danger"
              disabled={selectionBusy}
              onPress={handleMoveToTrash}
            />
          </View>
        </View>
        {canRemoveFromCollection ? (
          <View style={[styles.bottomBarButtons, { marginTop: spacing.sm }]}>
            <View style={styles.bottomBarFlex}>
              <Button
                label={removeBusy ? 'Removing…' : 'Remove from collection'}
                variant="secondary"
                disabled={selectionBusy}
                onPress={handleRemoveFromCollection}
              />
            </View>
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <SelectionMenu
        visible={openMenu === 'collection'}
        title="Filter by collection"
        options={[
          { label: 'All collections', value: null },
          ...collections.map((collection) => ({ label: collection.name, value: collection.id })),
        ]}
        selectedValue={query.collectionId}
        onClose={() => setOpenMenu(null)}
        onSelect={(value) => {
          setQuery((current) => ({ ...current, collectionId: value, collection: '' }));
          setOpenMenu(null);
        }}
        footer={
          <Button
            label="Create collection"
            variant="secondary"
            onPress={() => {
              setOpenMenu(null);
              setCreateForSelection(false);
              setCreateCollectionOpen(true);
            }}
          />
        }
        styles={styles}
      />
      <SelectionMenu
        visible={addToCollectionOpen}
        title="Add to collection"
        options={collections.map((collection) => ({ label: collection.name, value: collection.id }))}
        selectedValue={null}
        onClose={() => setAddToCollectionOpen(false)}
        onSelect={(value) => {
          if (value !== null) handleAddToCollection(value);
        }}
        footer={
          <Button
            label="Create collection"
            variant="secondary"
            disabled={addToBusy}
            onPress={() => {
              setAddToCollectionOpen(false);
              setCreateForSelection(true);
              setCreateCollectionOpen(true);
            }}
          />
        }
        styles={styles}
      />
      <CreateCollectionModal
        visible={createCollectionOpen}
        busy={createCollectionBusy}
        title={createForSelection ? 'New collection for selection' : 'New collection'}
        confirmLabel={createForSelection ? 'Create & add artworks' : 'Create collection'}
        onClose={() => {
          setCreateCollectionOpen(false);
          setCreateForSelection(false);
        }}
        onCreate={handleCreateCollection}
      />
      <Modal
        visible={editCollectionOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditCollectionOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close edit collection"
          style={styles.menuBackdrop}
          onPress={() => setEditCollectionOpen(false)}
        >
          <Pressable style={styles.menuSheet} onPress={(event) => event.stopPropagation()}>
            <Text accessibilityRole="header" style={styles.menuTitle}>
              Edit collection
            </Text>
            <Text style={styles.editSheetHelp}>
              Rename or archive “{selectedCollectionLabel}”. Artworks stay in your vault if you archive.
            </Text>

            <Text style={styles.editSheetSectionLabel}>Rename</Text>
            <TextInput
              accessibilityLabel="Collection name"
              value={editCollectionName}
              onChangeText={(value) => {
                setEditCollectionName(value);
                if (editCollectionError) setEditCollectionError(null);
              }}
              placeholder="Collection name"
              placeholderTextColor={colors.placeholder}
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={() => void handleRenameCollection()}
              editable={!renameBusy && !archiveBusy}
              style={styles.editCollectionInput}
            />
            {editCollectionError ? (
              <Text accessibilityRole="alert" style={styles.editCollectionError}>
                {editCollectionError}
              </Text>
            ) : null}
            <Button
              label={renameBusy ? 'Saving…' : 'Save name'}
              disabled={renameBusy || archiveBusy}
              onPress={() => void handleRenameCollection()}
            />

            <View style={styles.editSheetDanger}>
              <Text style={styles.editSheetSectionLabel}>Archive</Text>
              <Text style={styles.editSheetHelp}>
                Hides this collection from filters. You can restore it later from Settings.
              </Text>
              <Button
                label={archiveBusy ? 'Archiving…' : 'Archive collection'}
                variant="danger"
                disabled={renameBusy || archiveBusy}
                onPress={handleArchiveCollection}
              />
            </View>

            <Button
              label="Close"
              variant="secondary"
              disabled={renameBusy || archiveBusy}
              onPress={() => setEditCollectionOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
      {showEmptyStudio ? (
        <View style={styles.flex}>
          <View style={styles.emptyStudio}>
            <View style={styles.emptyBrand}>
              <View style={styles.brandMark}>
                <Image
                  source={require('../../assets/palette-brush.png')}
                  style={styles.brandSilhouette}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <Text accessibilityRole="header" style={styles.brandTitle}>
                  ArtCloset
                </Text>
              </View>
              <Text style={styles.brandPillars}>List · Describe · Share</Text>
              <Text style={styles.brandTagline}>Your art, offline first.</Text>
            </View>
            <Text style={styles.emptyCopy}>
              Add your first artwork with a photo and title. Collections, medium, dimensions, and tags can wait.
            </Text>
            <View style={styles.emptyActions}>
              <Button label="Add your first artwork" onPress={() => router.push('/artwork/new')} />
              {supportsBatchUpload && (
                <Button label="Batch upload photos" variant="secondary" onPress={() => router.push('/artwork/batch')} />
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.flex}>
          {/* Keep search/filters mounted outside FlatList so query updates do not dismiss the keyboard. */}
          {archiveChrome}
          <FlatList
            key={viewMode}
            data={artworks}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            renderItem={({ item }) =>
              viewMode === 'grid' ? (
                <ArtworkTile
                  artwork={item}
                  selecting={selecting}
                  selected={selectedIds.includes(item.id)}
                  onPress={() => handleArtworkPress(item)}
                  onLongPress={() => (selecting ? toggleSelection(item.id) : enterSelection(item.id))}
                />
              ) : (
                <ArtworkRow
                  artwork={item}
                  selecting={selecting}
                  selected={selectedIds.includes(item.id)}
                  displayUnit={displayUnit}
                  onPress={() => handleArtworkPress(item)}
                  onLongPress={() => (selecting ? toggleSelection(item.id) : enterSelection(item.id))}
                />
              )
            }
            ListEmptyComponent={listEmpty}
            numColumns={viewMode === 'grid' ? 2 : 1}
            columnWrapperStyle={viewMode === 'grid' ? styles.columns : undefined}
            contentContainerStyle={[
              styles.list,
              artworks.length === 0 ? styles.listEmptyGrow : null,
              selecting && selectedCount > 0 ? styles.listWithBottomBar : null,
            ]}
            initialNumToRender={12}
            windowSize={7}
          />
          {bottomBar}
        </View>
      )}
    </SafeAreaView>
  );
}

type VaultStyles = ReturnType<typeof createStyles>;

function SelectionMenu<Value extends string | number | null>({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
  footer,
  styles,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: Value }[];
  selectedValue: Value;
  onClose: () => void;
  onSelect: (value: Value) => void;
  footer?: React.ReactNode;
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
            {options.length === 0 ? (
              <Text style={styles.menuEmpty}>No collections yet. Create one below.</Text>
            ) : (
              options.map((option) => {
                const selected = option.value === selectedValue;
                return (
                  <Pressable
                    key={String(option.value ?? 'all')}
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
              })
            )}
          </ScrollView>
          {footer ? <View style={styles.menuFooter}>{footer}</View> : null}
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
    paddingTop: spacing.xs,
    paddingBottom: 2,
  },
  heroHeader: {
    height: 132,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBrand: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '54%',
    zIndex: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  heroBrandTitleWrap: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  heroBrandSilhouette: {
    position: 'absolute',
    width: 118,
    height: 118,
    top: '50%',
    left: '50%',
    marginTop: -59,
    marginLeft: -59,
    opacity: 0.22,
    zIndex: 0,
  },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.4,
    lineHeight: 36,
    zIndex: 1,
    textAlign: 'center',
  },
  pageTitleArt: { color: colors.ink, fontFamily: fonts.display },
  pageTitleCloset: { color: colors.accent, fontFamily: fonts.display },
  workspaceLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
    zIndex: 1,
  },
  heroFeatured: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '58%',
    zIndex: 1,
  },
  heroFeaturedImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  heroFeaturedPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderMark: {
    width: 72,
    height: 72,
    opacity: 0.35,
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '42%',
    flexDirection: 'row',
  },
  heroFadeStrip: {
    flex: 1,
    height: '100%',
  },
  heroFeaturedMeta: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(12, 10, 8, 0.55)',
  },
  heroFeaturedEyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroFeaturedTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 1,
  },
  heroSettings: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 3,
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 18, 14, 0.72)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroSettingsGlyph: { color: colors.accent, fontSize: 16 },
  selectionTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    minHeight: 44,
  },
  selectionCount: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '600',
  },
  cancelChip: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelChipText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  selectionHint: {
    color: colors.inkMuted,
    fontSize: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  primaryActionsRow: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  addArtworkButton: {
    minHeight: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
  },
  addArtworkButtonText: {
    color: colors.onAccent,
    fontSize: 17,
    fontWeight: '800',
  },
  collectionSwitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  collectionSwitcher: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  collectionSwitcherValue: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  editCollectionIconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editCollectionGlyph: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  newCollectionButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  newCollectionButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  editSheetHelp: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  editSheetSectionLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  editCollectionInput: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.inkMuted,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  editCollectionError: { color: colors.danger, fontWeight: '600', marginBottom: spacing.sm },
  editSheetDanger: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  search: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  filterSquare: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  filterGlyph: { color: colors.onAccent, fontSize: 20, fontWeight: '700', transform: [{ rotate: '90deg' }] },
  menuChevron: { color: colors.accent, fontSize: 16, marginLeft: 4 },
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
  menuEmpty: { color: colors.inkMuted, fontSize: 15, paddingVertical: spacing.md },
  menuFooter: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  toolbarChip: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  toolbarChipText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  toolbarChevron: { color: colors.accent, fontSize: 14, marginTop: -1 },
  viewToggle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  viewToggleGlyph: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  list: { paddingBottom: spacing.xl, gap: spacing.xs },
  listEmptyGrow: { flexGrow: 1 },
  filteredEmpty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  clearFiltersButton: {
    marginTop: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  clearFiltersText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  emptyCollectionCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    minHeight: 220,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyCollectionIcon: {
    color: colors.accent,
    fontSize: 36,
    fontWeight: '300',
    marginBottom: spacing.xs,
  },
  emptyCollectionCta: {
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  emptyCollectionCtaText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '800',
  },
  listWithBottomBar: { paddingBottom: 120 },
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
  tileSelected: { borderColor: colors.accent },
  pressed: { opacity: 0.72 },
  thumbnail: { width: '100%', aspectRatio: 0.92, backgroundColor: colors.surfaceMuted },
  missingImage: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  placeholderMark: { color: colors.accent, fontFamily: fonts.display, fontSize: 25, fontWeight: '600' },
  missingText: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.xs },
  tileBody: { padding: spacing.sm, gap: spacing.sm },
  tileText: { gap: 2 },
  tileTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 15, fontWeight: '600' },
  artist: { color: colors.ink, fontSize: 12 },
  meta: { color: colors.inkMuted, fontSize: 11 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  statusDotOnly: { width: 8, height: 8, borderRadius: 4 },
  status: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
  tileCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 2,
  },
  checkOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.onAccent,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOuterSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkMark: { color: colors.onAccent, fontSize: 14, fontWeight: '900', lineHeight: 16 },
  row: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  rowSelected: { borderColor: colors.accent },
  rowCheck: { marginRight: spacing.xs },
  rowThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  rowPlaceholder: { color: colors.accent, fontFamily: fonts.display, fontSize: 16, fontWeight: '600' },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  bottomBarButtons: { flexDirection: 'row', gap: spacing.sm },
  bottomBarFlex: { flex: 1 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: '600' },
  emptyCopy: {
    color: colors.inkMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  emptyStudio: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  emptyBrand: { alignItems: 'center', gap: spacing.sm, width: '100%' },
  brandMark: {
    width: '100%',
    minHeight: 168,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandSilhouette: {
    position: 'absolute',
    width: 240,
    height: 240,
    opacity: 0.35,
  },
  brandTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 44,
    fontWeight: '600',
    letterSpacing: -0.8,
    textAlign: 'center',
    zIndex: 1,
  },
  brandPillars: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  brandTagline: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyActions: { width: '100%', maxWidth: 320, gap: spacing.sm },
});
