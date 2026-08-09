import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import {
  ARTWORK_STATUSES,
  MEASUREMENT_UNITS,
  ORIENTATIONS,
  type ArtworkDraft,
} from '@/domain/artwork';
import { validateArtwork, type ValidationErrors } from '@/domain/validation';
import { useCapture } from '@/state/CaptureContext';
import { Button, Chip, Field } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

const parseList = (value: string): string[] =>
  [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

interface ArtworkFormProps {
  initialValue: ArtworkDraft;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: ArtworkDraft) => Promise<void>;
}

export function ArtworkForm({
  initialValue,
  submitLabel,
  busy,
  onSubmit,
}: ArtworkFormProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState(initialValue);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { capturedUri, setCapturedUri } = useCapture();

  useEffect(() => {
    if (capturedUri) {
      setDraft((current) => ({ ...current, pendingImageUri: capturedUri }));
      setCapturedUri(null);
    }
  }, [capturedUri, setCapturedUri]);

  const setField = <Key extends keyof ArtworkDraft>(key: Key, value: ArtworkDraft[Key]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const pickImage = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSubmitError('Photo access is required only to select an artwork image. You can continue without one.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (!result.canceled) setField('pendingImageUri', result.assets[0]?.uri ?? null);
  };

  const submit = async (): Promise<void> => {
    const nextErrors = validateArtwork(draft);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await onSubmit(draft);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The artwork could not be saved.');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.sectionTitle}>Artwork image</Text>
      {draft.pendingImageUri ? (
        <Image source={{ uri: draft.pendingImageUri }} style={styles.preview} accessibilityLabel="Artwork preview" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.muted}>No image selected. You can add one later.</Text>
        </View>
      )}
      {Platform.OS === 'web' ? (
        <Text style={styles.muted}>Image capture and permanent image storage require the Android or iOS app.</Text>
      ) : (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Choose photo" variant="secondary" onPress={() => void pickImage()} />
          </View>
          <View style={styles.flex}>
            <Button label="Use camera" variant="secondary" onPress={() => router.push('/camera')} />
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Identity</Text>
      <Field
        label="Title"
        value={draft.title}
        error={errors.title}
        onChangeText={(value) => setField('title', value)}
        maxLength={200}
      />
      <Field
        label="Artwork ID"
        value={draft.humanId}
        error={errors.humanId}
        onChangeText={(value) => setField('humanId', value)}
        autoCapitalize="characters"
      />
      <Field label="Artist" value={draft.artist} onChangeText={(value) => setField('artist', value)} />
      <Field
        label="Completion date"
        value={draft.completionDate}
        error={errors.completionDate}
        onChangeText={(value) => setField('completionDate', value)}
        placeholder="YYYY-MM-DD"
      />
      <Field
        label="Completion year"
        value={draft.completionYear}
        error={errors.completionYear}
        onChangeText={(value) => setField('completionYear', value)}
        keyboardType="number-pad"
        maxLength={4}
      />

      <Text style={styles.sectionTitle}>Materials and dimensions</Text>
      <Field label="Medium" value={draft.medium} onChangeText={(value) => setField('medium', value)} />
      <Field label="Material" value={draft.material} onChangeText={(value) => setField('material', value)} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="Width"
            value={draft.width}
            error={errors.width}
            onChangeText={(value) => setField('width', value)}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Height"
            value={draft.height}
            error={errors.height}
            onChangeText={(value) => setField('height', value)}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Depth"
            value={draft.depth}
            error={errors.depth}
            onChangeText={(value) => setField('depth', value)}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <Text style={styles.label}>Measurement unit</Text>
      <View style={styles.chips}>
        {MEASUREMENT_UNITS.map((unit) => (
          <Chip
            key={unit}
            label={unit}
            selected={draft.measurementUnit === unit}
            onPress={() => setField('measurementUnit', unit)}
          />
        ))}
      </View>
      <Text style={styles.label}>Orientation</Text>
      <View style={styles.chips}>
        {ORIENTATIONS.map((orientation) => (
          <Chip
            key={orientation}
            label={orientation}
            selected={draft.orientation === orientation}
            onPress={() => setField('orientation', orientation)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Catalog details</Text>
      <Text style={styles.label}>Status</Text>
      <View style={styles.chips}>
        {ARTWORK_STATUSES.map((status) => (
          <Chip
            key={status}
            label={status}
            selected={draft.status === status}
            onPress={() => setField('status', status)}
          />
        ))}
      </View>
      <Field
        label="Tags"
        value={draft.tags.join(', ')}
        onChangeText={(value) => setField('tags', parseList(value))}
        help="Separate tags with commas."
      />
      <Field
        label="Genres"
        value={draft.genres.join(', ')}
        onChangeText={(value) => setField('genres', parseList(value))}
        help="Separate genres with commas."
      />
      <Field
        label="Collection or series"
        value={draft.collections.join(', ')}
        onChangeText={(value) => setField('collections', parseList(value))}
        help="Separate collections with commas."
      />
      <Field label="Location" value={draft.location} onChangeText={(value) => setField('location', value)} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="Price"
            value={draft.price}
            error={errors.price}
            onChangeText={(value) => setField('price', value)}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Currency"
            value={draft.currency}
            error={errors.currency}
            onChangeText={(value) => setField('currency', value.toUpperCase())}
            autoCapitalize="characters"
            maxLength={3}
          />
        </View>
      </View>
      <Field
        label="Description"
        value={draft.description}
        onChangeText={(value) => setField('description', value)}
        multiline
        maxLength={5000}
      />
      <Field
        label="Private notes"
        value={draft.notes}
        onChangeText={(value) => setField('notes', value)}
        multiline
        maxLength={5000}
      />

      {submitError && (
        <Text accessibilityRole="alert" style={styles.error}>
          {submitError}
        </Text>
      )}
      <Button label={busy ? 'Saving…' : submitLabel} disabled={busy} onPress={() => void submit()} />
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 64 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: spacing.md, marginBottom: spacing.md },
  label: { color: colors.ink, fontWeight: '700', fontSize: 15, marginBottom: spacing.sm },
  muted: { color: colors.inkMuted, textAlign: 'center' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  imagePlaceholder: {
    aspectRatio: 4 / 3,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
});
