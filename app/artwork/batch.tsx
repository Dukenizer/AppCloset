import { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { BatchArtworkItem } from '@/domain/artwork';
import {
  IOS_MEDIA_DEFERRED_COPY,
  isWeb,
  supportsBatchUpload,
  supportsNativeCrop,
} from '@/platform/capabilities';
import { useArtworks } from '@/state/ArtworkContext';
import { pickAndCropImage, pickMultipleImages } from '@/services/imagePick';
import { Button, Field } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

export default function BatchUploadScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { createBatch } = useArtworks();
  const [items, setItems] = useState<BatchArtworkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhotos = async (): Promise<void> => {
    setError(null);
    try {
      const uris = await pickMultipleImages();
      if (uris.length === 0) return;
      setItems((current) => [
        ...current,
        ...uris.map((uri, index) => ({
          pendingImageUri: uri,
          title: `Untitled ${current.length + index + 1}`,
        })),
      ]);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Unable to select photos.');
    }
  };

  const cropItem = async (index: number): Promise<void> => {
    setError(null);
    try {
      const uri = await pickAndCropImage();
      if (!uri) return;
      setItems((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? { ...item, pendingImageUri: uri } : item)),
      );
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'Unable to crop photo.');
    }
  };

  const saveAll = async (): Promise<void> => {
    if (items.length === 0) {
      setError('Add at least one photo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createBatch(items);
      router.replace('/(tabs)');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Batch save failed.');
    } finally {
      setBusy(false);
    }
  };

  const updateTitle = useCallback((index: number, title: string): void => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, title } : item)));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets>
      <Text style={styles.lead}>
        Select multiple photos, trim each one, add quick titles, then save every entry as its own artwork.
      </Text>
      {isWeb || !supportsBatchUpload ? (
        <Text style={styles.muted}>{isWeb ? 'Batch upload requires the Android app.' : IOS_MEDIA_DEFERRED_COPY}</Text>
      ) : (
        <Button label="Choose photos" variant="secondary" onPress={() => void addPhotos()} />
      )}

      {items.map((item, index) => (
        <View key={`${item.pendingImageUri}-${index}`} style={styles.row}>
          <Image source={{ uri: item.pendingImageUri }} style={styles.thumb} accessibilityIgnoresInvertColors />
          <View style={styles.flex}>
            <Field
              label={`Title ${index + 1}`}
              value={item.title}
              onChangeText={(value) => updateTitle(index, value)}
              maxLength={200}
            />
            {supportsNativeCrop && (
              <Button label="Crop / rotate" variant="secondary" onPress={() => void cropItem(index)} />
            )}
          </View>
        </View>
      ))}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {items.length > 0 && supportsBatchUpload && (
        <Button label={busy ? 'Saving…' : `Save ${items.length} artworks`} disabled={busy} onPress={() => void saveAll()} />
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
    lead: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    thumb: {
      width: 96,
      height: 96,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
    },
    flex: { flex: 1, gap: spacing.sm },
    muted: { color: colors.inkMuted },
    error: { color: colors.danger, fontWeight: '600' },
  });
