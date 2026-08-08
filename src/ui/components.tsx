import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from 'react-native';

import { colors, radii, spacing } from './theme';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ label, variant = 'primary', disabled, style, ...props }: ButtonProps): React.JSX.Element {
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
  const helpId = `${label.replace(/\s/g, '-').toLowerCase()}-help`;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? help}
        style={[styles.input, props.multiline && styles.multiline, error && styles.inputError, style]}
        placeholderTextColor={colors.inkMuted}
        {...props}
      />
      {(error || help) && (
        <Text nativeID={helpId} style={error ? styles.error : styles.help}>
          {error ?? help}
        </Text>
      )}
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
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children }: PropsWithChildren): React.JSX.Element {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonSecondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  buttonSecondaryText: { color: colors.ink },
  field: { gap: spacing.xs, marginBottom: spacing.md },
  label: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.ink, fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
