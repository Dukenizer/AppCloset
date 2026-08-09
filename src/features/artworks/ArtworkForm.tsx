import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  listCatalogGenres,
  listCatalogMaterials,
  listCatalogMediums,
} from '@/data/catalogRepository';
import {
  createCollection,
  getUserProfile,
  listCollections,
  setSetting,
  type CollectionRecord,
} from '@/data/artworkRepository';
import { COMPLETION_MONTHS, DEFAULT_GENRE } from '@/domain/catalog';
import {
  ARTWORK_STATUSES,
  FULL_DESCRIPTION_MAX_CHARS,
  MEASUREMENT_UNITS,
  ORIENTATIONS,
  type ArtworkDraft,
  type MeasurementUnit,
} from '@/domain/artwork';
import { PROFILE_SETTING_KEYS, profileArtistName } from '@/domain/profile';
import { validateArtwork, type ValidationErrors } from '@/domain/validation';
import { CreateCollectionModal } from '@/features/collections/CreateCollectionModal';
import { IOS_MEDIA_DEFERRED_COPY, isIos, isWeb, supportsNativeCrop } from '@/platform/capabilities';
import { pickAndCropImage } from '@/services/imagePick';
import { stagePendingArtworkImage } from '@/services/imageStorage';
import { Button, Chip, Field, SelectField } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { useUnsavedChangesGuard } from '@/ui/useUnsavedChangesGuard';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

const parseList = (value: string): string[] =>
  [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

type ArtistMode = 'self' | 'other';

interface ArtworkFormProps {
  initialValue: ArtworkDraft;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: ArtworkDraft) => Promise<void>;
  requirePhoto?: boolean;
  /** When set, shows Move to trash (edit mode only — not for new artwork). */
  onTrash?: () => Promise<void>;
  /** Create-entry mode shows Discard instead of trash. Defaults to !onTrash. */
  isNew?: boolean;
}

export function ArtworkForm({
  initialValue,
  submitLabel,
  busy,
  onSubmit,
  requirePhoto = false,
  onTrash,
  isNew = !onTrash,
}: ArtworkFormProps): React.JSX.Element {
  const database = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState(initialValue);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [artistMode, setArtistMode] = useState<ArtistMode>('other');
  const [profileArtist, setProfileArtist] = useState('');
  const [profileCurrency, setProfileCurrency] = useState('USD');
  const [mediumOptions, setMediumOptions] = useState<string[]>([]);
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  const [genreOptions, setGenreOptions] = useState<string[]>([DEFAULT_GENRE]);
  const [customMedium, setCustomMedium] = useState('');
  const [customMaterial, setCustomMaterial] = useState('');
  const [dirty, setDirty] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [createCollectionBusy, setCreateCollectionBusy] = useState(false);
  const trackEditsRef = useRef(false);
  const { allowNextLeave } = useUnsavedChangesGuard(dirty, busy || trashBusy);

  const markDirty = useCallback((): void => {
    if (trackEditsRef.current) setDirty(true);
  }, []);

  const loadCatalogs = useCallback(async (): Promise<void> => {
    const [mediums, materials, genres, profile, collectionRows] = await Promise.all([
      listCatalogMediums(database),
      listCatalogMaterials(database),
      listCatalogGenres(database),
      getUserProfile(database),
      listCollections(database),
    ]);
    setMediumOptions(mediums);
    setMaterialOptions(materials);
    setGenreOptions(genres.length > 0 ? genres : [DEFAULT_GENRE]);
    setCollections(collectionRows);
    const selfName = profileArtistName(profile);
    setProfileArtist(selfName);
    setProfileCurrency(profile.defaultCurrency);
    const initialArtist = initialValue.artist.trim();
    if (!initialArtist || (selfName && initialArtist === selfName)) {
      setArtistMode('self');
      setDraft((current) => ({ ...current, artist: selfName }));
    } else {
      setArtistMode('other');
    }
    if (initialValue.medium && !mediums.includes(initialValue.medium)) {
      setCustomMedium(initialValue.medium);
      setDraft((current) => ({ ...current, medium: 'Other' }));
    }
    if (initialValue.material && !materials.includes(initialValue.material)) {
      setCustomMaterial(initialValue.material);
      setDraft((current) => ({ ...current, material: 'Other' }));
    }
    setDraft((current) => ({
      ...current,
      measurementUnit: initialValue.measurementUnit || profile.displayUnit,
      currency: initialValue.currency || profile.defaultCurrency,
    }));
  }, [
    database,
    initialValue.artist,
    initialValue.currency,
    initialValue.material,
    initialValue.measurementUnit,
    initialValue.medium,
  ]);

  useEffect(() => {
    trackEditsRef.current = false;
    setDirty(false);
    void loadCatalogs().finally(() => {
      // Ignore hydration writes (profile artist, unit) so only user edits count as dirty.
      trackEditsRef.current = true;
    });
  }, [loadCatalogs]);

  const setField = <Key extends keyof ArtworkDraft>(key: Key, value: ArtworkDraft[Key]): void => {
    markDirty();
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const setDisplayUnit = (unit: MeasurementUnit): void => {
    setField('measurementUnit', unit);
    void setSetting(database, PROFILE_SETTING_KEYS.displayUnit, unit);
  };

  /** Keep full description seeded from short description until the user customizes it. */
  const setShortDescription = (value: string): void => {
    markDirty();
    const nextShort = value.replace(/[\r\n]+/g, ' ');
    setDraft((current) => {
      const previousShort = current.shortDescription.trim();
      const fullTrimmed = current.fullDescription.trim();
      const stillSeeded = fullTrimmed === '' || fullTrimmed === previousShort;
      return {
        ...current,
        shortDescription: nextShort,
        fullDescription: stillSeeded ? nextShort : current.fullDescription,
      };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.shortDescription;
      delete next.fullDescription;
      return next;
    });
  };

  const setArtistModeAndApply = (mode: ArtistMode): void => {
    markDirty();
    setArtistMode(mode);
    if (mode === 'self') setField('artist', profileArtist);
  };

  const toggleCollection = (name: string): void => {
    markDirty();
    setDraft((current) => {
      const selected = current.collections.some(
        (entry) => entry.toLowerCase() === name.toLowerCase(),
      );
      return {
        ...current,
        // Many-to-many: keep every selected collection name on this artwork.
        collections: selected
          ? current.collections.filter((entry) => entry.toLowerCase() !== name.toLowerCase())
          : [...current.collections, name],
      };
    });
  };

  const handleCreateCollection = async (name: string): Promise<void> => {
    setCreateCollectionBusy(true);
    try {
      await createCollection(database, name);
      const rows = await listCollections(database);
      setCollections(rows);
      const created = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
      const resolvedName = created?.name ?? name;
      markDirty();
      setDraft((current) =>
        current.collections.some((entry) => entry.toLowerCase() === resolvedName.toLowerCase())
          ? current
          : { ...current, collections: [...current.collections, resolvedName] },
      );
      setCreateCollectionOpen(false);
    } finally {
      setCreateCollectionBusy(false);
    }
  };

  const adoptPickedImage = async (uri: string | null): Promise<void> => {
    if (!uri) return;
    // Crop cache files can vanish before Save — stage into app documents immediately.
    const stagedUri = await stagePendingArtworkImage(uri);
    setField('pendingImageUri', stagedUri);
  };

  const pickImage = async (): Promise<void> => {
    setSubmitError(null);
    try {
      await adoptPickedImage(await pickAndCropImage());
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to choose photo.');
    }
  };

  const takePhoto = async (): Promise<void> => {
    setSubmitError(null);
    try {
      await adoptPickedImage(await pickAndCropImage({ source: 'camera' }));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to take photo.');
    }
  };

  const normalizedDraft = (): ArtworkDraft => ({
    ...draft,
    artist: artistMode === 'self' ? profileArtist : draft.artist.trim(),
    medium: draft.medium === 'Other' ? customMedium.trim() || 'Other' : draft.medium,
    material: draft.material === 'Other' ? customMaterial.trim() || 'Other' : draft.material,
    genres: draft.genres.length > 0 ? [draft.genres[0] ?? DEFAULT_GENRE] : [DEFAULT_GENRE],
    location: '',
    currency: profileCurrency,
  });

  const submit = async (): Promise<void> => {
    const payload = normalizedDraft();
    const nextErrors = validateArtwork(payload, { requirePhoto, requireCompletionYear: true });
    if (artistMode === 'other' && !payload.artist.trim()) {
      nextErrors.artist = 'Enter the artist name or choose “As me”.';
    }
    if (artistMode === 'self' && !profileArtist.trim()) {
      nextErrors.artist = 'Add your name on the Profile tab first.';
    }
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      // Allow leave only for the successful save navigation inside onSubmit.
      allowNextLeave();
      await onSubmit(payload);
      setDirty(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The artwork could not be saved.';
      setSubmitError(
        /NoSuchFileException|FileSystemFile\.copy|could not (process|save) the artwork image/i.test(message)
          ? 'Could not save the artwork image after cropping. Try choosing the photo again, then save.'
          : message,
      );
    }
  };

  const selectedGenre = draft.genres[0] ?? DEFAULT_GENRE;
  const monthOptions = COMPLETION_MONTHS.filter((entry) => entry.value !== '').map((entry) => entry.label);
  const monthValue =
    COMPLETION_MONTHS.find((entry) => entry.value === draft.completionMonth)?.label ?? '';

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
          <Text style={styles.muted}>Add a photo to start this entry.</Text>
        </View>
      )}
      {errors.pendingImageUri && (
        <Text accessibilityRole="alert" style={styles.error}>
          {errors.pendingImageUri}
        </Text>
      )}
      {isWeb ? (
        <Text style={styles.muted}>Image capture and permanent image storage require the Android app.</Text>
      ) : (
        <>
          {isIos && <Text style={styles.muted}>{IOS_MEDIA_DEFERRED_COPY}</Text>}
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Choose photo" variant="secondary" onPress={() => void pickImage()} />
            </View>
            <View style={styles.flex}>
              <Button label="Take photo" variant="secondary" onPress={() => void takePhoto()} />
            </View>
          </View>
        </>
      )}
      {draft.pendingImageUri && supportsNativeCrop && (
        <Button label="Re-crop photo" variant="secondary" onPress={() => void pickImage()} />
      )}

      <Text style={styles.sectionTitle}>Basic entry</Text>
      <Field
        label="Title"
        value={draft.title}
        error={errors.title}
        onChangeText={(value) => setField('title', value)}
        maxLength={200}
      />
      <Field
        label="Short description"
        value={draft.shortDescription}
        error={errors.shortDescription}
        onChangeText={setShortDescription}
        help="Describe this artwork in one sentence."
      />

      <Text style={styles.label}>Collections</Text>
      <Text style={styles.help}>
        Select one or more. An artwork can belong to many collections, and each collection can hold many artworks.
      </Text>
      <View style={styles.chips}>
        {collections.map((collection) => (
          <Chip
            key={collection.id}
            label={collection.name}
            selected={draft.collections.some(
              (entry) => entry.toLowerCase() === collection.name.toLowerCase(),
            )}
            onPress={() => toggleCollection(collection.name)}
          />
        ))}
        <Chip label="+ New collection" selected={false} onPress={() => setCreateCollectionOpen(true)} />
      </View>
      {draft.collections.length === 0 ? (
        <Text style={styles.help}>No collection selected — it will be saved under Unsorted.</Text>
      ) : null}

      <Text style={styles.label}>Artist</Text>
      <View style={styles.chips}>
        <Chip
          label="As me (from profile)"
          selected={artistMode === 'self'}
          onPress={() => setArtistModeAndApply('self')}
        />
        <Chip label="Another artist" selected={artistMode === 'other'} onPress={() => setArtistMode('other')} />
      </View>
      {artistMode === 'self' ? (
        profileArtist.trim() ? (
          <Text style={styles.help}>{profileArtist}</Text>
        ) : (
          <View style={styles.profilePrompt}>
            <Text style={styles.help}>Add your name on the Profile tab to use “As me”.</Text>
            <Link href="/(tabs)/profile" asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => [styles.profileLink, pressed && styles.pressed]}>
                <Text style={styles.profileLinkText}>Go to Profile</Text>
              </Pressable>
            </Link>
          </View>
        )
      ) : (
        <Field
          label="Artist name"
          value={draft.artist}
          error={errors.artist}
          onChangeText={(value) => setField('artist', value)}
        />
      )}
      {errors.artist && artistMode === 'self' && (
        <Text accessibilityRole="alert" style={styles.error}>
          {errors.artist}
        </Text>
      )}

      <Field
        label="Completion year"
        value={draft.completionYear}
        error={errors.completionYear}
        onChangeText={(value) => setField('completionYear', value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        help="Year is required. Month is optional under advanced details."
      />

      <Text style={styles.sectionTitle}>Size</Text>
      <Text style={styles.label}>Display unit</Text>
      <Text style={styles.help}>Choose cm or in before entering width and height.</Text>
      <View style={styles.chips}>
        {MEASUREMENT_UNITS.map((unit) => (
          <Chip
            key={unit}
            label={unit}
            selected={draft.measurementUnit === unit}
            onPress={() => setDisplayUnit(unit)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label={`Width (${draft.measurementUnit})`}
            value={draft.width}
            error={errors.width}
            onChangeText={(value) => setField('width', value)}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={`Height (${draft.measurementUnit})`}
            value={draft.height}
            error={errors.height}
            onChangeText={(value) => setField('height', value)}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <Button
        label={showAdvanced ? 'Hide advanced details' : 'Add advanced details (optional)'}
        variant="secondary"
        onPress={() => setShowAdvanced((current) => !current)}
      />

      {showAdvanced && (
        <>
          <Text style={styles.sectionTitle}>Advanced details</Text>
          <SelectField
            label="Completion month (optional)"
            value={monthValue}
            options={monthOptions}
            placeholder="Month (optional)"
            error={errors.completionMonth}
            onSelect={(label) => {
              const match = COMPLETION_MONTHS.find((entry) => entry.label === label);
              setField('completionMonth', match?.value ?? '');
            }}
          />
          <SelectField
            label="Medium"
            value={draft.medium}
            options={mediumOptions}
            placeholder="Choose medium"
            onSelect={(value) => setField('medium', value)}
          />
          {draft.medium === 'Other' && (
            <Field
              label="Custom medium"
              value={customMedium}
              onChangeText={(value) => {
                markDirty();
                setCustomMedium(value);
              }}
              placeholder="Describe the medium"
            />
          )}
          <SelectField
            label="Material"
            value={draft.material}
            options={materialOptions}
            placeholder="Choose material (optional)"
            onSelect={(value) => setField('material', value)}
          />
          {draft.material === 'Other' && (
            <Field
              label="Custom material"
              value={customMaterial}
              onChangeText={(value) => {
                markDirty();
                setCustomMaterial(value);
              }}
              placeholder="Describe the material"
            />
          )}
          <Field
            label={`Depth (${draft.measurementUnit})`}
            value={draft.depth}
            error={errors.depth}
            onChangeText={(value) => setField('depth', value)}
            keyboardType="decimal-pad"
            help="Optional third dimension for sculpture, framed depth, etc."
          />
          <Text style={styles.label}>Orientation (optional)</Text>
          <View style={styles.chips}>
            <Chip label="None" selected={!draft.orientation} onPress={() => setField('orientation', '')} />
            {ORIENTATIONS.map((orientation) => (
              <Chip
                key={orientation}
                label={orientation}
                selected={draft.orientation === orientation}
                onPress={() => setField('orientation', orientation)}
              />
            ))}
          </View>
          <Text style={styles.label}>Framed</Text>
          <View style={styles.chips}>
            <Chip label="No" selected={!draft.framed} onPress={() => setField('framed', false)} />
            <Chip label="Yes" selected={draft.framed} onPress={() => setField('framed', true)} />
          </View>
          <SelectField
            label="Genre"
            value={selectedGenre}
            options={genreOptions}
            placeholder={DEFAULT_GENRE}
            onSelect={(value) => setField('genres', [value])}
          />
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
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field
                label="Price"
                value={draft.price}
                error={errors.price}
                onChangeText={(value) => setField('price', value)}
                keyboardType="decimal-pad"
                help={`Currency (${profileCurrency}) is set in Profile.`}
              />
            </View>
          </View>
          {draft.price.trim() !== '' && (
            <>
              <Text style={styles.label}>Show price on cards</Text>
              <View style={styles.chips}>
                <Chip label="Show" selected={!draft.hidePrice} onPress={() => setField('hidePrice', false)} />
                <Chip label="Hide" selected={draft.hidePrice} onPress={() => setField('hidePrice', true)} />
              </View>
            </>
          )}
          <Field
            label="Full description"
            value={draft.fullDescription}
            error={errors.fullDescription}
            onChangeText={(value) => setField('fullDescription', value)}
            help={`Add more detail about this artwork — up to ${FULL_DESCRIPTION_MAX_CHARS} characters (${draft.fullDescription.length}/${FULL_DESCRIPTION_MAX_CHARS}).`}
            multiline
            maxLength={FULL_DESCRIPTION_MAX_CHARS}
          />
          <Field
            label="Private notes"
            value={draft.notes}
            onChangeText={(value) => setField('notes', value)}
            multiline
            maxLength={5000}
          />
        </>
      )}

      {submitError && (
        <Text accessibilityRole="alert" style={styles.error}>
          {submitError}
        </Text>
      )}
      <Button
        label={busy ? 'Saving…' : submitLabel}
        disabled={busy || trashBusy}
        onPress={() => void submit()}
      />
      {isNew ? (
        <View style={styles.discardRow}>
          <Button
            label="Discard"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              if (!dirty) {
                allowNextLeave();
                router.back();
                return;
              }
              Alert.alert(
                'Discard artwork?',
                'This artwork has not been saved. Leave without saving?',
                [
                  { text: 'Keep editing', style: 'cancel' },
                  {
                    text: 'Discard',
                    style: 'destructive',
                    onPress: () => {
                      allowNextLeave();
                      setDirty(false);
                      router.back();
                    },
                  },
                ],
              );
            }}
          />
        </View>
      ) : null}
      {onTrash ? (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneLabel}>Danger zone</Text>
          <Text style={styles.help}>
            Deleting moves this saved artwork to trash. You can restore it later from Settings.
          </Text>
          <Button
            label={trashBusy ? 'Deleting…' : 'Move to trash'}
            variant="danger"
            disabled={busy || trashBusy}
            style={styles.trashButton}
            onPress={() => {
              Alert.alert(
                'Are you sure you want to delete this artwork?',
                'It will be moved to trash and hidden from your vault. You can restore it later from Settings.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void (async () => {
                        setTrashBusy(true);
                        try {
                          allowNextLeave();
                          setDirty(false);
                          await onTrash();
                        } catch (trashError) {
                          setSubmitError(
                            trashError instanceof Error ? trashError.message : 'Could not move artwork to trash.',
                          );
                        } finally {
                          setTrashBusy(false);
                        }
                      })();
                    },
                  },
                ],
              );
            }}
          />
        </View>
      ) : null}
      <CreateCollectionModal
        visible={createCollectionOpen}
        busy={createCollectionBusy}
        onClose={() => setCreateCollectionOpen(false)}
        onCreate={handleCreateCollection}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 120 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: spacing.md, marginBottom: spacing.md },
  label: { color: colors.ink, fontWeight: '700', fontSize: 15, marginBottom: spacing.sm },
  help: { color: colors.inkMuted, fontSize: 14, marginBottom: spacing.md },
  profilePrompt: { gap: spacing.xs, marginBottom: spacing.md },
  profileLink: { alignSelf: 'flex-start' },
  profileLinkText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.78 },
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
  discardRow: {
    marginTop: spacing.md,
  },
  dangerZone: {
    marginTop: spacing.xl * 1.5,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  dangerZoneLabel: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  trashButton: {
    alignSelf: 'flex-start',
    width: '48%',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
});
