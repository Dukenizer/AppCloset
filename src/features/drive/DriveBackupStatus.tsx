import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  backupReminderAdvice,
  formatBytesLabel,
  type DriveProgressState,
} from '@/services/drive/driveBackupProgress';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { radii, spacing, type ColorTokens } from '@/ui/theme';

export type DriveConnectionHealth = 'disconnected' | 'connected' | 'checking' | 'error';

interface DriveBackupStatusProps {
  email: string | null;
  health: DriveConnectionHealth;
  lastBackupAt: string | null;
  lastBackupSizeBytes: number | null;
  stale: boolean;
  progress: DriveProgressState;
  onRetry?: (() => void) | undefined;
  onBackupNow?: (() => void) | undefined;
}

export function DriveBackupStatus({
  email,
  health,
  lastBackupAt,
  lastBackupSizeBytes,
  stale,
  progress,
  onRetry,
  onBackupNow,
}: DriveBackupStatusProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const busy = progress.kind !== 'idle' && progress.step !== 'done' && progress.step !== 'failed';
  const failed = progress.step === 'failed';
  const reminder =
    email && health === 'connected' && !busy && !failed ? backupReminderAdvice(lastBackupAt) : null;

  const chip = (() => {
    if (busy) return { label: 'In progress', tone: styles.chipBusy, text: styles.chipTextOnAccent };
    if (failed || health === 'error') {
      return { label: 'Needs attention', tone: styles.chipDanger, text: styles.chipTextOnAccent };
    }
    if (health === 'disconnected') {
      return { label: 'Disconnected', tone: styles.chipMuted, text: styles.chipTextMuted };
    }
    if (health === 'checking') {
      return { label: 'Checking…', tone: styles.chipBusy, text: styles.chipTextOnAccent };
    }
    if (stale || reminder?.tone === 'stale') {
      return { label: 'Backup overdue', tone: styles.chipWarn, text: styles.chipTextOnAccent };
    }
    if (reminder?.tone === 'remind' && lastBackupAt) {
      return { label: 'Backup recommended', tone: styles.chipWarn, text: styles.chipTextOnAccent };
    }
    if (!lastBackupAt) {
      return { label: 'No Drive backup yet', tone: styles.chipMuted, text: styles.chipTextMuted };
    }
    return { label: 'Connected', tone: styles.chipOk, text: styles.chipTextOnAccent };
  })();

  const lastBackupLine = (() => {
    if (!email) return 'Connect Google to enable Drive backup.';
    // A failed backup already has a specific error below — don't stack a generic connectivity line.
    if (failed) {
      if (!lastBackupAt) return 'Backup did not finish.';
    } else if (health === 'error') {
      return 'Could not reach Google Drive. Check connectivity and try again.';
    }
    if (!lastBackupAt) return 'No backup on Drive yet for this account.';
    const when = new Date(lastBackupAt).toLocaleString();
    const size =
      lastBackupSizeBytes != null && lastBackupSizeBytes > 0
        ? ` · ${formatBytesLabel(lastBackupSizeBytes)}`
        : '';
    return `Last backup ${when}${size}`;
  })();

  return (
    <View style={styles.wrap}>
      <View style={[styles.chip, chip.tone]}>
        <Text style={chip.text}>{chip.label}</Text>
      </View>
      <Text style={styles.account}>{email ? `Account: ${email}` : 'Account: Not connected'}</Text>
      <Text style={styles.meta}>{lastBackupLine}</Text>

      {reminder && reminder.tone !== 'ok' ? (
        <View style={styles.adviceBox}>
          <Text style={reminder.tone === 'stale' ? styles.warn : styles.advice}>{reminder.message}</Text>
          {onBackupNow ? <Button label="Backup now" variant="secondary" onPress={onBackupNow} /> : null}
        </View>
      ) : null}
      {reminder?.tone === 'ok' ? <Text style={styles.meta}>{reminder.message}</Text> : null}

      {(busy || progress.step === 'done') && progress.message ? (
        <Text style={styles.status}>{progress.message}</Text>
      ) : null}
      {failed && !onRetry && progress.message && progress.message !== progress.error ? (
        <Text style={styles.error}>{progress.message}</Text>
      ) : null}

      {progress.estimateLabel ? <Text style={styles.estimate}>{progress.estimateLabel}</Text> : null}
      {progress.overnightRecommended ? (
        <Text style={styles.warn}>
          This may take a long time. Prefer Wi‑Fi and leave ArtCloset open overnight if you can.
        </Text>
      ) : null}

      {busy ? (
        <View style={styles.progressBlock}>
          <View style={styles.track}>
            {progress.progress == null ? (
              <View style={[styles.fill, styles.fillIndeterminate]}>
                <ActivityIndicator color={colors.onAccent} size="small" />
              </View>
            ) : (
              <View style={[styles.fill, { width: `${Math.round(progress.progress * 100)}%` }]} />
            )}
          </View>
          <Text style={styles.progressCaption}>
            {progress.progress == null
              ? 'Working…'
              : `${Math.round(progress.progress * 100)}% · keep ArtCloset open`}
          </Text>
        </View>
      ) : null}

      {failed && onRetry ? (
        <View style={styles.retryRow}>
          {progress.error ? <Text style={styles.error}>{progress.error}</Text> : null}
          <Button label="Retry" onPress={onRetry} />
        </View>
      ) : null}

      {failed && !onRetry && progress.error ? <Text style={styles.error}>{progress.error}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    chip: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      borderWidth: 1,
    },
    chipOk: { backgroundColor: colors.success, borderColor: colors.success },
    chipWarn: { backgroundColor: colors.statusReserved, borderColor: colors.statusReserved },
    chipDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
    chipBusy: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipMuted: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    chipTextOnAccent: { color: colors.onAccent, fontWeight: '800', fontSize: 12 },
    chipTextMuted: { color: colors.ink, fontWeight: '800', fontSize: 12 },
    account: { color: colors.ink, fontWeight: '700', fontSize: 14 },
    meta: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    adviceBox: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    advice: { color: colors.ink, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    status: { color: colors.ink, fontWeight: '600', fontSize: 14 },
    estimate: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    warn: { color: colors.statusReserved, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    error: { color: colors.danger, fontWeight: '700', fontSize: 13, lineHeight: 18 },
    progressBlock: { gap: spacing.xs },
    track: {
      height: 10,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    fill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
    },
    fillIndeterminate: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressCaption: { color: colors.inkMuted, fontSize: 12 },
    retryRow: { gap: spacing.sm },
  });
