import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';

import type { Artwork } from '@/domain/artwork';
import { imageExists } from '@/services/imageStorage';
import { shareImage } from '@/services/exportService';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, ScreenState } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';

export default function ShareCardScreen(): React.JSX.Element {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const card = useRef<View | null>(null);
  const { findById } = useArtworks();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void findById(id)
      .then((value) => {
        if (active) setArtwork(value);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load artwork.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [findById, id]);

  if (loading || error || !artwork) {
    return <ScreenState loading={loading} error={error ?? (!artwork ? 'Artwork not found.' : null)} />;
  }

  const generateAndShare = async (): Promise<void> => {
    if (!card.current) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await captureRef(card, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
      await shareImage(uri);
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Could not share the artwork card.');
    } finally {
      setBusy(false);
    }
  };

  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View ref={card} collapsable={false} style={styles.card}>
        {hasImage && artwork.primaryImageUri ? (
          <Image source={{ uri: artwork.primaryImageUri }} style={styles.image} resizeMode="cover" />
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
          <Text style={styles.id}>#{artwork.humanId}</Text>
        </View>
      </View>
      <Text style={styles.notice}>Private notes, location, status, and price are never included on share cards.</Text>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button
        label={busy ? 'Preparing…' : 'Share with device menu'}
        disabled={busy}
        onPress={() => void generateAndShare()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.background },
  card: { backgroundColor: '#F4EFE7', overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 1 },
  missing: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#D8C8B5' },
  missingText: { color: '#6B5441', fontSize: 32, fontWeight: '900', letterSpacing: 4 },
  details: { padding: spacing.lg },
  title: { color: '#211E1B', fontSize: 30, fontWeight: '900' },
  artist: { color: '#514A43', fontSize: 18, marginTop: spacing.xs },
  meta: { color: '#6D655C', fontSize: 15, marginTop: spacing.md },
  id: { color: '#8C3B2A', fontWeight: '800', marginTop: spacing.lg },
  notice: { color: colors.inkMuted, lineHeight: 20 },
  error: { color: colors.danger },
});
