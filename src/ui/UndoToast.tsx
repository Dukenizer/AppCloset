import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';
import { radii, spacing, type ColorTokens } from './theme';

const UNDO_TIMEOUT_MS = 6000;
/** Keeps the toast above the bottom tab bar. */
const TAB_BAR_CLEARANCE = 64;

interface UndoRequest {
  message: string;
  onUndo: () => Promise<void>;
}

interface UndoToastContextValue {
  showUndo: (request: UndoRequest) => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

export function UndoToastProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<UndoRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const showUndo = useCallback(
    (next: UndoRequest): void => {
      clearTimer();
      setRequest(next);
      timerRef.current = setTimeout(() => setRequest(null), UNDO_TIMEOUT_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const undo = async (): Promise<void> => {
    if (!request || busy) return;
    clearTimer();
    setBusy(true);
    try {
      await request.onUndo();
    } finally {
      setBusy(false);
      setRequest(null);
    }
  };

  const value = useMemo(() => ({ showUndo }), [showUndo]);

  return (
    <UndoToastContext.Provider value={value}>
      {children}
      {request ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}
        >
          <Text style={styles.message} numberOfLines={2}>
            {request.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo delete"
            disabled={busy}
            hitSlop={8}
            onPress={() => void undo()}
            style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
          >
            <Text style={styles.undoText}>{busy ? 'Undoing…' : 'Undo'}</Text>
          </Pressable>
        </View>
      ) : null}
    </UndoToastContext.Provider>
  );
}

export function useUndoToast(): UndoToastContextValue {
  const context = useContext(UndoToastContext);
  if (!context) throw new Error('useUndoToast must be used inside UndoToastProvider.');
  return context;
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.surface,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    message: { flex: 1, color: colors.ink, fontWeight: '600', fontSize: 15 },
    undo: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    undoText: { color: colors.accent, fontWeight: '800', fontSize: 15, textTransform: 'uppercase' },
    pressed: { opacity: 0.7 },
  });
