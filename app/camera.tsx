import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { router } from 'expo-router';

import { useCapture } from '@/state/CaptureContext';
import { Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';

export default function CameraScreen(): React.JSX.Element {
  const camera = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setCapturedUri } = useCapture();

  if (!permission) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.state}>
        <Text style={styles.title}>Camera permission</Text>
        <Text style={styles.message}>
          ArtCloset only uses the camera when you choose to photograph artwork. You can continue without granting it.
        </Text>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const capture = async (): Promise<void> => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!picture?.uri) throw new Error('The camera did not return an image.');
      setCapturedUri(picture.uri);
      router.back();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Could not take the photo.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={camera} style={styles.camera} facing={facing} />
      <View style={styles.controls}>
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              label="Flip"
              variant="secondary"
              onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            />
          </View>
          <View style={styles.flex}>
            <Button label={busy ? 'Capturing…' : 'Take photo'} disabled={busy} onPress={() => void capture()} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  camera: { flex: 1 },
  controls: { padding: spacing.md, backgroundColor: '#000000', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  message: { color: colors.inkMuted, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  error: { color: '#FFD2D2', textAlign: 'center' },
});
