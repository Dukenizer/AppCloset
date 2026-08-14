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
type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Props = {
  visible: boolean;
  uri: string;
  onCancel: () => void;
  onDone: (uri: string) => void;
};

const MIN_NORM = 0.12;
const HANDLE = 28;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Slightly inset so freeform handles are usable immediately. */
const FREEFORM_START: NormRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.84 };

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
 * Freeform: drag the frame to move; drag corners to resize any aspect ratio.
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
  const [crop, setCrop] = useState<NormRect>(FREEFORM_START);
  const [freeform, setFreeform] = useState(true);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const dragOrigin = useRef<NormRect>(FREEFORM_START);
  const drawnRef = useRef({ width: 0, height: 0 });

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
    setCrop(FREEFORM_START);
    setFreeform(true);
    loadSize(uri);
  }, [visible, uri, loadSize]);

  const drawn = useMemo(
    () => containRect(box.width, box.height, natural.width, natural.height),
    [box, natural],
  );
  drawnRef.current = drawn;

  const onBoxLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setBox({ width, height });
  };

  const movePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragOrigin.current = cropRef.current;
        },
        onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const d = drawnRef.current;
          if (d.width <= 0 || d.height <= 0) return;
          const origin = dragOrigin.current;
          const dx = gesture.dx / d.width;
          const dy = gesture.dy / d.height;
          setCrop({
            ...origin,
            x: clamp(origin.x + dx, 0, 1 - origin.width),
            y: clamp(origin.y + dy, 0, 1 - origin.height),
          });
        },
      }),
    [],
  );

  const makeCornerPan = useCallback((corner: Corner) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragOrigin.current = cropRef.current;
      },
      onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const d = drawnRef.current;
        if (d.width <= 0 || d.height <= 0) return;
        const origin = dragOrigin.current;
        const dx = gesture.dx / d.width;
        const dy = gesture.dy / d.height;

        let left = origin.x;
        let top = origin.y;
        let right = origin.x + origin.width;
        let bottom = origin.y + origin.height;

        if (corner === 'nw' || corner === 'sw') left = origin.x + dx;
        if (corner === 'ne' || corner === 'se') right = origin.x + origin.width + dx;
        if (corner === 'nw' || corner === 'ne') top = origin.y + dy;
        if (corner === 'sw' || corner === 'se') bottom = origin.y + origin.height + dy;

        left = clamp(left, 0, 1);
        top = clamp(top, 0, 1);
        right = clamp(right, 0, 1);
        bottom = clamp(bottom, 0, 1);

        if (right - left < MIN_NORM) {
          if (corner === 'nw' || corner === 'sw') left = right - MIN_NORM;
          else right = left + MIN_NORM;
        }
        if (bottom - top < MIN_NORM) {
          if (corner === 'nw' || corner === 'ne') top = bottom - MIN_NORM;
          else bottom = top + MIN_NORM;
        }

        left = clamp(left, 0, 1 - MIN_NORM);
        top = clamp(top, 0, 1 - MIN_NORM);
        right = clamp(right, left + MIN_NORM, 1);
        bottom = clamp(bottom, top + MIN_NORM, 1);

        setCrop({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        });
      },
    });
  }, []);

  const cornerPans = useMemo(
    () => ({
      nw: makeCornerPan('nw'),
      ne: makeCornerPan('ne'),
      sw: makeCornerPan('sw'),
      se: makeCornerPan('se'),
    }),
    [makeCornerPan],
  );

  const enableFreeform = (): void => {
    setFreeform(true);
    setCrop((current) => {
      const nearlyFull =
        current.width > 0.98 && current.height > 0.98 && current.x < 0.01 && current.y < 0.01;
      return nearlyFull ? FREEFORM_START : current;
    });
  };

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
      setCrop(FREEFORM_START);
      setFreeform(true);
      loadSize(result.uri);
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : 'Could not rotate this photo.');
    } finally {
      setBusy(false);
    }
  };

  const reset = (): void => {
    setWorkingUri(uri);
    setCrop(FREEFORM_START);
    setFreeform(true);
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

  const handleStyle = (corner: Corner) => {
    const half = HANDLE / 2;
    const base = {
      position: 'absolute' as const,
      width: HANDLE,
      height: HANDLE,
      marginLeft: -half,
      marginTop: -half,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.background,
      zIndex: 3,
    };
    if (corner === 'nw') return { ...base, left: frameLeft, top: frameTop };
    if (corner === 'ne') return { ...base, left: frameLeft + frameWidth, top: frameTop };
    if (corner === 'sw') return { ...base, left: frameLeft, top: frameTop + frameHeight };
    return { ...base, left: frameLeft + frameWidth, top: frameTop + frameHeight };
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
        <Text style={styles.title}>Re-crop photo</Text>
        <Text style={styles.help}>
          Same photo — drag the frame to move, drag corners to freeform resize, then Apply.
        </Text>

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
                {...movePan.panHandlers}
                style={[
                  styles.frame,
                  { left: frameLeft, top: frameTop, width: frameWidth, height: frameHeight },
                ]}
              />
              {freeform
                ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                    <View
                      key={corner}
                      {...cornerPans[corner].panHandlers}
                      style={handleStyle(corner)}
                      accessibilityLabel={`Resize ${corner} corner`}
                    />
                  ))
                : null}
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
            accessibilityLabel="Freeform crop"
            accessibilityState={{ selected: freeform }}
            disabled={busy}
            onPress={enableFreeform}
            style={({ pressed }) => [
              styles.tool,
              freeform && styles.toolSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.toolText, freeform && styles.toolTextSelected]}>Freeform</Text>
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
      // Keep visible so corner freeform handles are not clipped at the frame edges.
      overflow: 'visible',
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
    toolSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    toolText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
    toolTextSelected: { color: colors.onAccent },
    pressed: { opacity: 0.75 },
    actions: { flexDirection: 'row', gap: spacing.sm },
    flex: { flex: 1 },
    error: { color: colors.danger, fontWeight: '700' },
  });
