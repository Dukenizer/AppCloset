import ImageViewing from 'react-native-image-viewing';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

import { useTheme } from '@/ui/ThemeProvider';
import { radii, type ColorTokens } from '@/ui/theme';

interface ArtworkImageViewerProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

export function ArtworkImageViewer({
  uri,
  style,
  accessibilityLabel = 'Artwork image',
}: ArtworkImageViewerProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${accessibilityLabel}. Double tap to zoom.`}
        onPress={() => setVisible(true)}
      >
        <Image source={{ uri }} style={style ?? styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
      </Pressable>
      <ImageViewing
        images={[{ uri }]}
        imageIndex={0}
        visible={visible}
        onRequestClose={() => setVisible(false)}
        backgroundColor={colors.background}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    image: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
  });
