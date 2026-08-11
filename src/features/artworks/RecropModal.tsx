import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

type NormRect = { x: number; y: number; width: number; height: number };

type Props = {
  visible: boolean;
  uri: string;
  onCancel: () => void;
  onDone: (uri: string) => void;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const FULL: NormRect = { x: 0, y: 0, width: 1, height: 1 };

/** Contain-fit a source size into a box; returns the drawn image rect inside the box. */
const containRect = (
  boxW: number,
  boxH: number,
  imageW: number,
  imageH: number,
): { left: number; top: number; width: number; height: number } => {
  if (boxW <= 0 || boxH <= 0 || imageW <= 0 || imageH <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(boxW / imageW, boxH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height };
};

/**
 * In-app re-crop for an existing local photo — opens the same image, not the library picker.
 */
export function RecropModal({ visible, uri, onCancel, onDone }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingUri, setWorkingUri] = useState(uri);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<NormRect>(FULL);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const dragOrigin = useRef<NormRect>(FULL);

  const loadSize = useCallback((imageUri: string): void => {
    setNatural({ width: 0, height: 0 });
    Image.getSize(
      imageUri,
      (width, height) => setNatural({ width, height }),
      () => setError('Could not read this photo for cropping.'),
    );
  }, []);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setError(null);
    setWorkingUri(uri);
    setCrop(FULL);
    loadSize(uri);
  }, [visible, uri, loadSize]);

  const drawn = useMemo(
    () => containRect(box.width, box.height, natural.width, natural.height),
    [box, natural],
  );

  const onBoxLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setBox({ width, height });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragOrigin.current = cropRef.current;
        },
        onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
          if (drawn.width <= 0 || drawn.height <= 0) return;
          const origin = dragOrigin.current;
          const dx = gesture.dx / drawn.width;
          const dy = gesture.dy / drawn.height;
          setCrop({
            ...origin,
            x: clamp(origin.x + dx, 0, 1 - origin.width),
            y: clamp(origin.y + dy, 0, 1 - origin.height),
          });
        },
      }),
    [drawn.height, drawn.width],
  );

  const insetCrop = useCallback((amount: number): void => {
    setCrop((current) => {
      const nextWidth = clamp(current.width - amount * 2, 0.2, 1);
      const nextHeight = clamp(current.height - amount * 2, 0.2, 1);
      return {
        width: nextWidth,
        height: nextHeight,
        x: clamp(current.x + (current.width - nextWidth) / 2, 0, 1 - nextWidth),
        y: clamp(current.y + (current.height - nextHeight) / 2, 0, 1 - nextHeight),
      };
    });
  }, []);

  const expandCrop = useCallback((): void => {
    setCrop((current) => {
      const nextWidth = clamp(current.width + 0.1, 0.2, 1);
      const nextHeight = clamp(current.height + 0.1, 0.2, 1);
      return {
        width: nextWidth,
        height: nextHeight,
        x: clamp(current.x - (nextWidth - current.width) / 2, 0, 1 - nextWidth),
        y: clamp(current.y - (nextHeight - current.height) / 2, 0, 1 - nextHeight),
      };
    });
  }, []);

  const rotateLeft = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await manipulateAsync(workingUri, [{ rotate: -90 }], {
        compress: 1,
        format: SaveFormat.JPEG,
      });
      setWorkingUri(result.uri);
      setCrop(FULL);
      loadSize(result.uri);
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : 'Could not rotate this photo.');
    } finally {
      setBusy(false);
    }
  };

  const reset = (): void => {
    setWorkingUri(uri);
    setCrop(FULL);
    setError(null);
    loadSize(uri);
  };

  const apply = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const needsCrop =
        crop.width < 0.999 || crop.height < 0.999 || crop.x > 0.001 || crop.y > 0.001;

      if (!needsCrop) {
        onDone(workingUri === uri ? uri : workingUri);
        return;
      }

      const outW = natural.width;
      const outH = natural.height;
      if (outW <= 0 || outH <= 0) throw new Error('Could not read this photo for cropping.');

      const originX = Math.round(crop.x * outW);
      const originY = Math.round(crop.y * outH);
      const width = Math.max(1, Math.round(crop.width * outW));
      const height = Math.max(1, Math.round(crop.height * outH));

      const result = await manipulateAsync(
        workingUri,
        [
          {
            crop: {
              originX: clamp(originX, 0, Math.max(0, outW - 1)),
              originY: clamp(originY, 0, Math.max(0, outH - 1)),
              width: clamp(width, 1, outW - originX),
              height: clamp(height, 1, outH - originY),
            },
          },
        ],
        { compress: 1, format: SaveFormat.JPEG },
      );
      onDone(result.uri);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Could not crop this photo.');
    } finally {
      setBusy(false);
    }
  };

  const frameLeft = drawn.left + crop.x * drawn.width;
  const frameTop = drawn.top + crop.y * drawn.height;
  const frameWidth = crop.width * drawn.width;
  const frameHeight = crop.height * drawn.height;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
        <Text style={styles.title}>Re-crop photo</Text>
        <Text style={styles.help}>Same photo — drag the frame, tighten or rotate, then Apply.</Text>

        <View style={styles.stage} onLayout={onBoxLayout}>
          {natural.width > 0 ? (
            <>
              <Image
                source={{ uri: workingUri }}
                style={{
                  position: 'absolute',
                  left: drawn.left,
                  top: drawn.top,
                  width: drawn.width,
                  height: drawn.height,
                }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: frameTop }]} />
              <View
                pointerEvents="none"
                style={[styles.dim, { top: frameTop + frameHeight, left: 0, right: 0, bottom: 0 }]}
              />
              <View
                pointerEvents="none"
                style={[styles.dim, { top: frameTop, left: 0, width: frameLeft, height: frameHeight }]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.dim,
                  { top: frameTop, left: frameLeft + frameWidth, right: 0, height: frameHeight },
                ]}
              />
              <View
                {...panResponder.panHandlers}
                style={[
                  styles.frame,
                  { left: frameLeft, top: frameTop, width: frameWidth, height: frameHeight },
                ]}
              />
            </>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>

        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rotate left"
            disabled={busy}
            onPress={() => void rotateLeft()}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            <Text style={styles.toolText}>↺ Rotate</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tighten crop"
            disabled={busy}
            onPress={() => insetCrop(0.05)}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            <Text style={styles.toolText}>Tighten</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Widen crop"
            disabled={busy}
            onPress={expandCrop}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            <Text style={styles.toolText}>Widen</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset crop"
            disabled={busy}
            onPress={reset}
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
          >
            <Text style={styles.toolText}>Reset</Text>
          </Pressable>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
          </View>
          <View style={styles.flex}>
            <Button label={busy ? 'Applying…' : 'Apply crop'} disabled={busy} onPress={() => void apply()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
    help: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
    stage: {
      flex: 1,
      minHeight: 280,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: '#000',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
    frame: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: 'transparent',
    },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tool: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
    pressed: { opacity: 0.75 },
    actions: { flexDirection: 'row', gap: spacing.sm },
    flex: { flex: 1 },
    error: { color: colors.danger, fontWeight: '700' },
  });
