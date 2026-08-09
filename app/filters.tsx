import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ARTWORK_STATUSES, ORIENTATIONS, type ArtworkQuery } from '@/domain/artwork';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Chip, Field } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

const useStyles = (): ReturnType<typeof createStyles> => {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
};

const resetFilters = (query: ArtworkQuery): ArtworkQuery => ({
  ...query,
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
  minDimension: '',
  maxDimension: '',
  location: '',
});

export default function FiltersScreen(): React.JSX.Element {
  const styles = useStyles();
  const { query, setQuery } = useArtworks();
  const [draft, setDraft] = useState(query);

  useFocusEffect(
    useCallback(() => {
      setDraft(query);
    }, [query]),
  );

  const set = <Key extends keyof ArtworkQuery>(key: Key, value: ArtworkQuery[Key]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  const apply = (): void => {
    setQuery(draft);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets>
      <Text style={styles.heading}>Status</Text>
      <View style={styles.chips}>
        <Chip label="Any" selected={!draft.status} onPress={() => set('status', null)} />
        {ARTWORK_STATUSES.map((status) => (
          <Chip
            key={status}
            label={status}
            selected={draft.status === status}
            onPress={() => set('status', status)}
          />
        ))}
      </View>
      <Text style={styles.heading}>Date</Text>
      <Field
        label="Completion year"
        value={draft.year}
        onChangeText={(value) => set('year', value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="From date"
            value={draft.dateFrom}
            onChangeText={(value) => set('dateFrom', value)}
            placeholder="YYYY-MM-DD"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="To date"
            value={draft.dateTo}
            onChangeText={(value) => set('dateTo', value)}
            placeholder="YYYY-MM-DD"
          />
        </View>
      </View>

      <Text style={styles.heading}>Catalog fields</Text>
      <Field label="Artist" value={draft.artist} onChangeText={(value) => set('artist', value)} />
      <Field label="Genre" value={draft.genre} onChangeText={(value) => set('genre', value)} />
      <Field label="Tag" value={draft.tag} onChangeText={(value) => set('tag', value)} />
      <Field label="Medium" value={draft.medium} onChangeText={(value) => set('medium', value)} />
      <Field label="Material" value={draft.material} onChangeText={(value) => set('material', value)} />
      <Field label="Collection" value={draft.collection} onChangeText={(value) => set('collection', value)} />
      <Field label="Location" value={draft.location} onChangeText={(value) => set('location', value)} />

      <Text style={styles.heading}>Orientation</Text>
      <View style={styles.chips}>
        <Chip label="Any" selected={!draft.orientation} onPress={() => set('orientation', null)} />
        {ORIENTATIONS.map((orientation) => (
          <Chip
            key={orientation}
            label={orientation}
            selected={draft.orientation === orientation}
            onPress={() => set('orientation', orientation)}
          />
        ))}
      </View>

      <Text style={styles.heading}>Largest dimension</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="Minimum"
            value={draft.minDimension}
            onChangeText={(value) => set('minDimension', value)}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Maximum"
            value={draft.maxDimension}
            onChangeText={(value) => set('maxDimension', value)}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Reset filters" variant="secondary" onPress={() => setDraft(resetFilters(draft))} />
        </View>
        <View style={styles.flex}>
          <Button label="Apply filters" onPress={apply} />
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 64 },
  heading: { color: colors.ink, fontSize: 19, fontWeight: '800', marginVertical: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
