import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';

import type { Artwork } from '@/domain/artwork';
import { imageExists } from '@/services/imageStorage';
import { shareImage } from '@/services/exportService';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

export default function ShareCardScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Number(Array.isArray(idParam) ? idParam[0] : idParam);
  const card = useRef<View | null>(null);
  const { findById } = useArtworks();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  /** Natural image ratio so the full painting shows; details sit below (not over/cropping it). */
  const [imageAspectRatio, setImageAspectRatio] = useState(1);

  useEffect(() => {
    let active = true;
    void findById(id)
      .then((value) => {
        if (active) setArtwork(value);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load artwork.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [findById, id]);

  useEffect(() => {
    const uri = artwork?.primaryImageUri;
    if (!uri || !imageExists(uri)) {
      setImageAspectRatio(1);
      return;
    }
    let active = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) setImageAspectRatio(width / height);
      },
      () => {
        if (active) setImageAspectRatio(1);
      },
    );
    return () => {
      active = false;
    };
  }, [artwork?.primaryImageUri]);

  if (loading || loadError || !artwork) {
    return <ScreenState loading={loading} error={loadError ?? (!artwork ? 'Artwork not found.' : null)} />;
  }

  const generateAndShare = async (): Promise<void> => {
    if (!card.current) return;
    setBusy(true);
    setShareError(null);
    try {
      const uri = await captureRef(card, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
      await shareImage(uri);
    } catch (shareError) {
      setShareError(shareError instanceof Error ? shareError.message : 'Could not share the artwork card.');
    } finally {
      setBusy(false);
    }
  };

  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View ref={card} collapsable={false} style={styles.card}>
        {hasImage && artwork.primaryImageUri ? (
          <Image
            source={{ uri: artwork.primaryImageUri }}
            style={[styles.image, { aspectRatio: imageAspectRatio }]}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.image, styles.missing]}>
            <Text style={styles.missingText}>ARTCLOSET</Text>
          </View>
        )}
        <View style={styles.details}>
          <Text style={styles.title}>{artwork.title}</Text>
          <Text style={styles.artist}>{artwork.artist}</Text>
          <Text style={styles.meta}>
            {[artwork.medium, artwork.completionYear].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Text style={styles.notice}>Status and price are never included on share cards.</Text>
      {Platform.OS === 'web' && (
        <Text style={styles.notice}>Artwork card sharing requires the Android or iOS app.</Text>
      )}
      {shareError && (
        <Text accessibilityRole="alert" style={styles.error}>
          {shareError}
        </Text>
      )}
      <Button
        label={busy ? 'Preparing…' : 'Share with device menu'}
        disabled={busy || Platform.OS === 'web'}
        onPress={() => void generateAndShare()}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.background },
  card: { backgroundColor: '#F4EFE7', overflow: 'hidden' },
  /** Default square until natural ratio loads; do not force cover-crop. */
  image: { width: '100%', aspectRatio: 1, backgroundColor: '#F4EFE7' },
  missing: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#D8C8B5' },
  missingText: { color: '#6B5441', fontSize: 32, fontWeight: '900', letterSpacing: 4 },
  details: { padding: spacing.lg },
  title: { color: '#211E1B', fontSize: 30, fontWeight: '900' },
  artist: { color: '#514A43', fontSize: 18, marginTop: spacing.xs },
  meta: { color: '#6D655C', fontSize: 15, marginTop: spacing.md },
  notice: { color: colors.inkMuted, lineHeight: 20 },
  error: { color: colors.danger },
});
