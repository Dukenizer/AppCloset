import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from './ThemeProvider';
import { fonts, radii, spacing, type ColorTokens } from './theme';

interface State {
  error: Error | null;
}

type BoundaryProps = PropsWithChildren<{ colors: ColorTokens }>;

class ErrorBoundaryImpl extends Component<BoundaryProps, State> {
  public override state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ArtCloset root error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  public override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const styles = createStyles(this.props.colors);

    return (
      <View accessibilityRole="alert" style={styles.screen}>
        <Text style={styles.eyebrow}>ARTCLOSET</Text>
        <Text style={styles.title}>The vault could not open</Text>
        <Text selectable style={styles.message}>
          {this.state.error.message || 'An unexpected startup error occurred.'}
        </Text>
        <Text style={styles.help}>
          Your local catalog has not been deleted. Try again, then restart the app if the problem continues.
        </Text>
        <Pressable accessibilityRole="button" onPress={this.reset} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

export function AppErrorBoundary({ children }: PropsWithChildren): React.JSX.Element {
  const { colors } = useTheme();
  return <ErrorBoundaryImpl colors={colors}>{children}</ErrorBoundaryImpl>;
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, fontWeight: '600' },
  message: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.danger,
    lineHeight: 21,
  },
  help: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
});
