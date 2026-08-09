import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

interface CreateCollectionModalProps {
  visible: boolean;
  busy?: boolean;
  title?: string;
  confirmLabel?: string;
  initialName?: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function CreateCollectionModal({
  visible,
  busy = false,
  title = 'New collection',
  confirmLabel = 'Create collection',
  initialName = '',
  onClose,
  onCreate,
}: CreateCollectionModalProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setError(null);
  }, [initialName, visible]);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a collection name.');
      return;
    }
    setError(null);
    try {
      await onCreate(trimmed);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not save collection.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.help}>Collection names are unique. Artworks can belong to many collections.</Text>
          <TextInput
            accessibilityLabel="Collection name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Inspiration, Sold 2026, Gallery show"
            placeholderTextColor={colors.placeholder}
            autoFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={styles.input}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
            </View>
            <View style={styles.flex}>
              <Button
                label={busy ? 'Saving…' : confirmLabel}
                disabled={busy}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    sheet: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
    help: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
    input: {
      minHeight: 48,
      borderWidth: 1.5,
      borderColor: colors.inkMuted,
      borderRadius: radii.sm,
      backgroundColor: colors.background,
      color: colors.ink,
      fontSize: 16,
      paddingHorizontal: spacing.md,
    },
    error: { color: colors.danger, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    flex: { flex: 1 },
  });
