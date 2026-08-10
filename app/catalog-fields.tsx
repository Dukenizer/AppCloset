import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  archiveCatalogItem,
  createCatalogItem,
  deleteUnusedCatalogItem,
  listCatalogItems,
  renameCatalogItem,
  restoreCatalogItem,
  type CatalogItem,
  type CatalogKind,
} from '@/data/catalogRepository';
import { Button, Card, Chip } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

const CATALOGS: ReadonlyArray<{ kind: CatalogKind; label: string; singular: string }> = [
  { kind: 'medium', label: 'Mediums', singular: 'medium' },
  { kind: 'material', label: 'Materials', singular: 'material' },
  { kind: 'genre', label: 'Genres', singular: 'genre' },
];
const DEFAULT_CATALOG = { kind: 'medium', label: 'Mediums', singular: 'medium' } as const;

const emptyItems = (): Record<CatalogKind, CatalogItem[]> => ({
  medium: [],
  material: [],
  genre: [],
});

interface NameModalProps {
  visible: boolean;
  title: string;
  initialName: string;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

function NameModal({
  visible,
  title,
  initialName,
  busy,
  onClose,
  onSave,
}: NameModalProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setError(null);
  }, [initialName, visible]);

  const close = (): void => {
    if (!busy) onClose();
  };

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setError(null);
    try {
      await onSave(name.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this catalog item.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={close}>
        <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            {title}
          </Text>
          <TextInput
            accessibilityLabel="Catalog item name"
            value={name}
            onChangeText={setName}
            placeholder="Enter a name"
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
          <View style={styles.modalActions}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" disabled={busy} onPress={close} />
            </View>
            <View style={styles.flex}>
              <Button label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={() => void submit()} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CatalogFieldsScreen(): React.JSX.Element {
  const database = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [kind, setKind] = useState<CatalogKind>('medium');
  const [items, setItems] = useState<Record<CatalogKind, CatalogItem[]>>(emptyItems);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const catalog = CATALOGS.find((entry) => entry.kind === kind) ?? DEFAULT_CATALOG;

  const load = useCallback(async (): Promise<void> => {
    const [medium, material, genre] = await Promise.all([
      listCatalogItems(database, 'medium'),
      listCatalogItems(database, 'material'),
      listCatalogItems(database, 'genre'),
    ]);
    setItems({ medium, material, genre });
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openCreate = (): void => {
    setEditing(null);
    setModalOpen(true);
  };

  const openRename = (item: CatalogItem): void => {
    setEditing(item);
    setModalOpen(true);
  };

  const confirmRenameImpact = (item: CatalogItem, nextName: string): Promise<boolean> =>
    new Promise((resolve) => {
      if (item.usageCount <= 0 || nextName.toLowerCase() === item.name.toLowerCase()) {
        resolve(true);
        return;
      }
      Alert.alert(
        `Rename “${item.name}”?`,
        `This will update ${item.usageCount} artwork${item.usageCount === 1 ? '' : 's'} that use this ${
          catalog.singular
        }.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Rename', onPress: () => resolve(true) },
        ],
      );
    });

  const save = async (name: string): Promise<void> => {
    if (editing) {
      const confirmed = await confirmRenameImpact(editing, name);
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      if (editing) await renameCatalogItem(database, kind, editing.id, name);
      else await createCatalogItem(database, kind, name);
      await load();
      setModalOpen(false);
      setMessage(`${editing ? 'Renamed' : 'Created'} ${catalog.singular} “${name}”.`);
    } finally {
      setBusy(false);
    }
  };

  const archive = (item: CatalogItem): void => {
    Alert.alert(
      `Archive “${item.name}”?`,
      `It will be hidden from future artwork choices. ${item.usageCount} existing artwork assignment${
        item.usageCount === 1 ? '' : 's'
      } will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            void archiveCatalogItem(database, kind, item.id)
              .then(load)
              .then(() => setMessage(`Archived “${item.name}”.`));
          },
        },
      ],
    );
  };

  const restore = async (item: CatalogItem): Promise<void> => {
    await restoreCatalogItem(database, kind, item.id);
    await load();
    setMessage(`Restored “${item.name}”.`);
  };

  const remove = (item: CatalogItem): void => {
    Alert.alert(
      `Delete “${item.name}” permanently?`,
      'This unused catalog option will be removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteUnusedCatalogItem(database, kind, item.id)
              .then(load)
              .then(() => setMessage(`Deleted “${item.name}”.`));
          },
        },
      ],
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.help}>
          Create and rename choices without editing each artwork. Archiving hides a choice but preserves every existing
          assignment.
        </Text>
        <View style={styles.tabs}>
          {CATALOGS.map((entry) => (
            <Chip
              key={entry.kind}
              label={entry.label}
              selected={kind === entry.kind}
              onPress={() => setKind(entry.kind)}
            />
          ))}
        </View>
        <Button label={`Create ${catalog.singular}`} onPress={openCreate} />

        <Card>
          <View style={styles.cardBody}>
            {items[kind].map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.flex}>
                  <Text style={[styles.itemName, item.archivedAt && styles.archivedName]}>{item.name}</Text>
                  <Text style={styles.caption}>
                    {item.isProtected
                      ? 'Required default'
                      : `${item.usageCount} artwork${item.usageCount === 1 ? '' : 's'}${
                          item.archivedAt ? ' · Archived' : ''
                        }`}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  {item.archivedAt ? (
                    <>
                      <Pressable accessibilityRole="button" onPress={() => void restore(item)}>
                        <Text style={styles.action}>Restore</Text>
                      </Pressable>
                      {item.usageCount === 0 && !item.isProtected ? (
                        <Pressable accessibilityRole="button" onPress={() => remove(item)}>
                          <Text style={styles.dangerAction}>Delete</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : item.isProtected ? null : (
                    <>
                      <Pressable accessibilityRole="button" onPress={() => openRename(item)}>
                        <Text style={styles.action}>Rename</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => archive(item)}>
                        <Text style={styles.action}>Archive</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        </Card>
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
      <NameModal
        visible={modalOpen}
        title={editing ? `Rename ${catalog.singular}` : `New ${catalog.singular}`}
        initialName={editing?.name ?? ''}
        busy={busy}
        onClose={() => setModalOpen(false)}
        onSave={save}
      />
    </>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
    help: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cardBody: { padding: spacing.md, gap: spacing.md },
    itemRow: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingBottom: spacing.sm,
    },
    flex: { flex: 1 },
    itemName: { color: colors.ink, fontSize: 16, fontWeight: '700' },
    archivedName: { color: colors.inkMuted },
    caption: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
    rowActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.md },
    action: { color: colors.accent, fontWeight: '800', paddingVertical: spacing.sm },
    dangerAction: { color: colors.danger, fontWeight: '800', paddingVertical: spacing.sm },
    message: { color: colors.ink, fontWeight: '600' },
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    modalSheet: {
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
    modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
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
    modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  });
