import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { isWeb } from '@/platform/capabilities';

import { EXHIBIT_LABEL_LAYOUTS, EXHIBIT_LABEL_LAYOUT_SPECS, EXHIBIT_LABEL_SIZES, EXHIBIT_LABEL_SIZE_SPECS, letterSheetGrid, type ExhibitLabelLayout, type ExhibitLabelSize } from '@/domain/exhibitLabel';
import type { Artwork } from '@/domain/artwork';
import { exportExhibitLabelsDocx, exportExhibitLabelsPdf } from '@/services/exhibitLabelService';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Chip, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

type ExportFormat = 'pdf' | 'docx';

export default function ExhibitLabelsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { artworks, loading, error, refresh } = useArtworks();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [size, setSize] = useState<ExhibitLabelSize>('3x4');
  const [layout, setLayout] = useState<ExhibitLabelLayout>('letter-sheet');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sheetGrid = letterSheetGrid(size);
  const selectedArtworks = artworks.filter((item) => selectedIds.has(item.id));
  const sheetCount =
    layout === 'letter-sheet' && selectedArtworks.length > 0
      ? Math.ceil(selectedArtworks.length / sheetGrid.perPage)
      : selectedArtworks.length;

  const toggle = (id: number): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (): void => {
    setSelectedIds(new Set(artworks.map((item) => item.id)));
  };

  const clearAll = (): void => {
    setSelectedIds(new Set());
  };

  const generate = async (format: ExportFormat): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      if (format === 'docx') {
        await exportExhibitLabelsDocx(selectedArtworks, size, layout);
      } else {
        await exportExhibitLabelsPdf(selectedArtworks, size, layout);
      }
      const packNote =
        layout === 'letter-sheet'
          ? ` on ${sheetCount} Letter sheet${sheetCount === 1 ? '' : 's'}`
          : '';
      const formatNote = format === 'docx' ? 'Word (.docx)' : 'PDF';
      setMessage(
        `Created ${selectedArtworks.length} label${selectedArtworks.length === 1 ? '' : 's'}${packNote} as ${formatNote}.`,
      );
    } catch (exportError) {
      setMessage(exportError instanceof Error ? exportError.message : 'Unable to create labels.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || error) {
    return (
      <ScreenState
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={artworks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.lead}>
              Select artworks for printable exhibit labels. Each label includes title, artist, date, and medium.
            </Text>
            {isWeb && (
              <Text style={styles.notice}>Label export requires the Android or iOS app.</Text>
            )}
            <Text style={styles.sectionTitle}>Label size</Text>
            <View style={styles.chips}>
              {EXHIBIT_LABEL_SIZES.map((option) => (
                <Chip
                  key={option}
                  label={EXHIBIT_LABEL_SIZE_SPECS[option].label}
                  selected={size === option}
                  onPress={() => setSize(option)}
                />
              ))}
            </View>
            <Text style={styles.sectionTitle}>Print layout</Text>
            <View style={styles.chips}>
              {EXHIBIT_LABEL_LAYOUTS.map((option) => (
                <Chip
                  key={option}
                  label={EXHIBIT_LABEL_LAYOUT_SPECS[option].label}
                  selected={layout === option}
                  onPress={() => setLayout(option)}
                />
              ))}
            </View>
            <Text style={styles.help}>{EXHIBIT_LABEL_LAYOUT_SPECS[layout].help}</Text>
            {layout === 'letter-sheet' ? (
              <Text style={styles.help}>
                {EXHIBIT_LABEL_SIZE_SPECS[size].label} packs {sheetGrid.perPage} per Letter page (
                {sheetGrid.columns}×{sheetGrid.rows}). Text is centered in each cut. Print at 100% / actual size.
              </Text>
            ) : (
              <Text style={styles.help}>
                Each page matches the chosen pre-cut size ({EXHIBIT_LABEL_SIZE_SPECS[size].label}) with centered
                details.
              </Text>
            )}
            <Text style={styles.help}>
              PDF is print-ready. Word (.docx) opens in Microsoft Word so you can edit before printing.
            </Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Select all" variant="secondary" onPress={selectAll} disabled={artworks.length === 0} />
              </View>
              <View style={styles.flex}>
                <Button label="Clear" variant="secondary" onPress={clearAll} disabled={selectedIds.size === 0} />
              </View>
            </View>
            <Text style={styles.count}>
              {selectedIds.size} of {artworks.length} selected
              {layout === 'letter-sheet' && selectedIds.size > 0
                ? ` · ${sheetCount} Letter sheet${sheetCount === 1 ? '' : 's'}`
                : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No artworks yet</Text>
            <Text style={styles.emptyCopy}>Add artwork to your catalog before creating exhibit labels.</Text>
            <Button label="Back to collection" variant="secondary" onPress={() => router.replace('/(tabs)')} />
          </View>
        }
        renderItem={({ item }) => (
          <LabelRow artwork={item} selected={selectedIds.has(item.id)} onToggle={() => toggle(item.id)} styles={styles} />
        )}
      />
      {artworks.length > 0 && (
        <View style={styles.footer}>
          <Button
            label={
              busy
                ? 'Creating…'
                : selectedIds.size === 0
                  ? 'Create PDF labels'
                  : `Create ${selectedIds.size} PDF label${selectedIds.size === 1 ? '' : 's'}`
            }
            disabled={busy || selectedIds.size === 0 || isWeb}
            onPress={() => void generate('pdf')}
          />
          <Button
            label={
              busy
                ? 'Creating…'
                : selectedIds.size === 0
                  ? 'Create Word labels'
                  : `Create ${selectedIds.size} Word label${selectedIds.size === 1 ? '' : 's'}`
            }
            variant="secondary"
            disabled={busy || selectedIds.size === 0 || isWeb}
            onPress={() => void generate('docx')}
          />
          {message && (
            <Text accessibilityRole="alert" style={styles.message}>
              {message}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

type LabelStyles = ReturnType<typeof createStyles>;

function LabelRow({
  artwork,
  selected,
  onToggle,
  styles,
}: {
  artwork: Artwork;
  selected: boolean;
  onToggle: () => void;
  styles: LabelStyles;
}): React.JSX.Element {
  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${artwork.title}, ${selected ? 'selected' : 'not selected'}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.rowCard, selected && styles.rowCardSelected, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && <Text style={styles.checkmark}>✓</Text>}
      </View>
      {hasImage && artwork.primaryImageUri ? (
        <Image source={{ uri: artwork.primaryImageUri }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbMissing]}>
          <Text style={styles.thumbMark}>AC</Text>
        </View>
      )}
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {artwork.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {[artwork.artist, artwork.medium, artwork.completionYear].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    list: { padding: spacing.md, paddingBottom: 180, gap: spacing.sm },
    header: { gap: spacing.md, marginBottom: spacing.md },
    lead: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    notice: { color: colors.accent, fontSize: 14, lineHeight: 20 },
    sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    help: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    row: { flexDirection: 'row', gap: spacing.sm },
    flex: { flex: 1 },
    count: { color: colors.inkMuted, fontSize: 14, fontWeight: '600' },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
    },
    rowCardSelected: { borderColor: colors.accent, borderWidth: 2 },
    pressed: { opacity: 0.82 },
    checkbox: {
      width: 22,
      height: 22,
      borderWidth: 2,
      borderColor: colors.inkMuted,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
    checkmark: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
    thumb: { width: 52, height: 52, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
    thumbMissing: { alignItems: 'center', justifyContent: 'center' },
    thumbMark: { color: colors.inkMuted, fontWeight: '800', fontSize: 11 },
    rowCopy: { flex: 1, gap: 2 },
    rowTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
    rowMeta: { color: colors.inkMuted, fontSize: 13 },
    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
    emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
    emptyCopy: { color: colors.inkMuted, textAlign: 'center', lineHeight: 22 },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: spacing.md,
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    message: { color: colors.ink, fontWeight: '600', textAlign: 'center' },
  });
