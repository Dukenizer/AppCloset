import { useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from 'react-native';

import { useTheme } from './ThemeProvider';
import { radii, spacing, type ColorTokens } from './theme';

const useStyles = (): ReturnType<typeof createStyles> => {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
};

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ label, variant = 'primary', disabled, style, ...props }: ButtonProps): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | undefined;
  help?: string | undefined;
}

export function Field({ label, error, help, style, ...props }: FieldProps): React.JSX.Element {
  const styles = useStyles();
  const { colors } = useTheme();
  const helpId = `${label.replace(/\s/g, '-').toLowerCase()}-help`;
  const locked = props.editable === false;
  return (
    <View style={[styles.field, locked && styles.fieldLocked]}>
      <Text style={[styles.label, locked && styles.labelLocked]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? help}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          error && styles.inputError,
          locked && styles.inputLocked,
          style,
        ]}
        placeholderTextColor={colors.placeholder}
        {...props}
      />
      {(error || help) && !locked ? (
        <Text nativeID={helpId} style={error ? styles.error : styles.help}>
          {error ?? help}
        </Text>
      ) : null}
    </View>
  );
}

export function ScreenState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  onRetry?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const { colors } = useTheme();
  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.help}>Loading your art vault…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View accessibilityRole="alert" style={styles.state}>
        <Text style={styles.stateTitle}>Something went wrong</Text>
        <Text style={styles.help}>{error}</Text>
        {onRetry && <Button label="Try again" onPress={onRetry} />}
      </View>
    );
  }
  return <View style={styles.state}>{empty}</View>;
}

export function Chip({
  label,
  selected = false,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: PressableProps['style'];
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [
        styles.chip,
        selected && styles.chipSelected,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  error?: string | undefined;
  onSelect: (value: string) => void;
}

export function SelectField({
  label,
  value,
  options,
  placeholder = 'Choose…',
  error,
  onSelect,
}: SelectFieldProps): React.JSX.Element {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const display = value.trim() || placeholder;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        onPress={() => setOpen(true)}
        style={[styles.selectTrigger, error && styles.inputError]}
      >
        <Text style={[styles.selectValue, !value.trim() && styles.selectPlaceholder]} numberOfLines={1}>
          {display}
        </Text>
        <Text style={styles.selectChevron}>⌄</Text>
      </Pressable>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {label}
            </Text>
            <ScrollView contentContainerStyle={styles.modalOptions}>
              {options.map((option) => {
                const selected = option === value;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                    style={[styles.modalOption, selected && styles.modalOptionSelected]}
                  >
                    <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>{option}</Text>
                    {selected && <Text style={styles.modalCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Card({ children }: PropsWithChildren): React.JSX.Element {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  buttonDanger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  buttonSecondaryText: { color: colors.accent, fontWeight: '800' },
  field: { gap: spacing.xs, marginBottom: spacing.md },
  fieldLocked: { opacity: 0.72 },
  label: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  labelLocked: { color: colors.inkMuted },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.inkMuted,
    borderRadius: radii.sm,
    // Recessed well — reads as editable, not a tap target.
    backgroundColor: colors.background,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputLocked: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    color: colors.inkMuted,
  },
  multiline: { minHeight: 108, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  error: { color: colors.danger, fontSize: 13 },
  help: { color: colors.inkMuted, fontSize: 14 },
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.ink, fontWeight: '600', textAlign: 'center' },
  chipTextSelected: { color: '#FFFFFF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  selectTrigger: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectValue: { flex: 1, color: colors.ink, fontSize: 16 },
  selectPlaceholder: { color: colors.placeholder },
  selectChevron: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.md,
  },
  modalTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginBottom: spacing.md },
  modalOptions: { gap: spacing.xs, paddingBottom: spacing.lg },
  modalOption: {
    minHeight: 48,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
  },
  modalOptionSelected: { backgroundColor: colors.accent },
  modalOptionText: { color: colors.ink, fontWeight: '600', flex: 1 },
  modalOptionTextSelected: { color: colors.onAccent },
  modalCheck: { color: colors.onAccent, fontWeight: '800' },
});
