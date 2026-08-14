import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ARTWORK_STATUSES, type ArtworkQuery, type ArtworkStatus } from '@/domain/artwork';
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
  sizeBucket: null,
});

export default function FiltersScreen(): React.JSX.Element {
  const styles = useStyles();
  const { query, setQuery } = useArtworks();
  const [status, setStatus] = useState<ArtworkStatus | null>(query.status);
  const [year, setYear] = useState(query.year);

  useFocusEffect(
    useCallback(() => {
      setStatus(query.status);
      setYear(query.year);
    }, [query.status, query.year]),
  );

  const apply = (): void => {
    setQuery((current) => ({
      ...resetFilters(current),
      status,
      year: year.trim(),
    }));
    router.back();
  };

  const clearAll = (): void => {
    setStatus(null);
    setYear('');
  };

  return (
    <ScrollView contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets>
      <Text style={styles.heading}>Status</Text>
      <Text style={styles.help}>Show artworks by availability (Available, Reserved, Not for sale, and more).</Text>
      <View style={styles.statusGrid}>
        <Chip label="Any" selected={!status} onPress={() => setStatus(null)} style={styles.statusChip} />
        {ARTWORK_STATUSES.map((item) => (
          <Chip
            key={item}
            label={item}
            selected={status === item}
            onPress={() => setStatus(status === item ? null : item)}
            style={styles.statusChip}
          />
        ))}
      </View>

      <Text style={styles.heading}>Year</Text>
      <Text style={styles.help}>Filter by completion year.</Text>
      <Field
        label="Completion year"
        value={year}
        onChangeText={(value) => setYear(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        placeholder="e.g. 2022"
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Clear filters" variant="secondary" onPress={clearAll} />
        </View>
        <View style={styles.flex}>
          <Button label="Apply" onPress={apply} />
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.sm },
    heading: { color: colors.ink, fontSize: 19, fontWeight: '800', marginTop: spacing.sm },
    help: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
    statusGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: spacing.sm,
      marginBottom: spacing.sm,
    },
    statusChip: { width: '48.5%' },
    row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    flex: { flex: 1 },
  });
