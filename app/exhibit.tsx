import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';

import type { Artwork } from '@/domain/artwork';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button } from '@/ui/components';
import { spacing } from '@/ui/theme';

function ExhibitSlide({
  artwork,
  width,
  controlsVisible,
  onToggleControls,
}: {
  artwork: Artwork;
  width: number;
  controlsVisible: boolean;
  onToggleControls: () => void;
}): React.JSX.Element {
  const hasImage = imageExists(artwork.primaryImageUri);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${artwork.title}. Tap to show or hide exhibit information.`}
      onPress={onToggleControls}
      style={[styles.slide, { width }]}
    >
      {hasImage && artwork.primaryImageUri ? (
        <Image source={{ uri: artwork.primaryImageUri }} style={styles.art} resizeMode="contain" />
      ) : (
        <Text style={styles.missing}>Image unavailable</Text>
      )}
      {controlsVisible && (
        <View style={styles.caption}>
          <Text style={styles.title}>{artwork.title}</Text>
          <Text style={styles.artist}>{artwork.artist}</Text>
          <Text style={styles.meta}>
            {[artwork.medium, artwork.completionYear].filter(Boolean).join(', ')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ExhibitScreen(): React.JSX.Element {
  const { artworks } = useArtworks();
  const { width } = useWindowDimensions();
  const [controlsVisible, setControlsVisible] = useState(true);

  return (
    <View style={styles.screen}>
      {artworks.length ? (
        <FlatList
          key={`exhibit-${Math.round(width)}`}
          data={artworks}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => String(item.id)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item }) => (
            <ExhibitSlide
              artwork={item}
              width={width}
              controlsVisible={controlsVisible}
              onToggleControls={() => setControlsVisible((visible) => !visible)}
            />
          )}
          windowSize={3}
          initialNumToRender={2}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.missing}>There are no artworks in the current selection.</Text>
        </View>
      )}
      {controlsVisible && (
        <View style={styles.exit}>
          <Button label="Exit exhibit" variant="secondary" onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090909' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', height: '100%' },
  caption: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 90,
    left: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    padding: spacing.md,
  },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  artist: { color: '#EEEEEE', fontSize: 17, marginTop: spacing.xs },
  meta: { color: '#CFCFCF', marginTop: spacing.xs },
  missing: { color: '#FFFFFF', textAlign: 'center' },
  empty: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  exit: { position: 'absolute', top: 52, right: spacing.md },
});
