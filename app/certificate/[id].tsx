import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getDisplayUnit, getUserProfile } from '@/data/artworkRepository';
import { getActiveCertificate } from '@/data/certificateRepository';
import type { Artwork } from '@/domain/artwork';
import {
  buildCertificateSnapshot,
  certificateBlocker,
  certificateDetailsChanged,
  certificatePriceAvailable,
  formatCertificateDate,
  type CertificateRecord,
  type CertificateSnapshot,
} from '@/domain/certificate';
import type { DisplayUnit, UserProfile } from '@/domain/profile';
import { useEntitlements } from '@/entitlements';
import { printCertificate, shareCertificatePdf } from '@/services/certificatePdfService';
import {
  certificateScreenMode,
  issueArtworkCertificate,
  isUserCancellation,
} from '@/services/certificateService';
import { imageExists } from '@/services/imageStorage';
import { useArtworks } from '@/state/ArtworkContext';
import { Button, Card, Chip, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

type BusyAction = 'preview' | 'issue' | 'share' | 'print';

const errorText = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export default function CertificateScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const { can } = useEntitlements();
  const { findById } = useArtworks();
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Number(Array.isArray(idParam) ? idParam[0] : idParam);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('cm');
  const [active, setActive] = useState<CertificateRecord | null>(null);
  const [includePrice, setIncludePrice] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Blocks a second Issue tap before the first confirmation has finished. */
  const issuing = useRef(false);

  const canCertificate = can('CAN_GENERATE_CERTIFICATE');

  const load = useCallback(async (): Promise<void> => {
    if (!Number.isInteger(id) || id <= 0) {
      setError('Invalid artwork ID.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextArtwork, nextProfile, unit, certificate] = await Promise.all([
        findById(id),
        getUserProfile(database),
        getDisplayUnit(database),
        getActiveCertificate(database, id),
      ]);
      setArtwork(nextArtwork);
      setProfile(nextProfile);
      setDisplayUnit(unit);
      setActive(certificate);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this artwork.');
    } finally {
      setLoading(false);
    }
  }, [database, findById, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading || error || !artwork || !profile) {
    return (
      <ScreenState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={<Text style={styles.body}>This artwork no longer exists.</Text>}
      />
    );
  }

  const blocker = certificateBlocker(artwork);
  const draft = buildCertificateSnapshot(artwork, profile, displayUnit, { includePrice });
  const shown: CertificateSnapshot = active?.snapshot ?? draft;
  const changed = active ? certificateDetailsChanged(active.snapshot, artwork) : false;
  const hasImage = imageExists(artwork.primaryImageUri);
  const priceAvailable = certificatePriceAvailable(artwork);
  const isWeb = Platform.OS === 'web';
  const mode = certificateScreenMode(canCertificate, active !== null);

  const run = async (action: BusyAction, task: () => Promise<void>): Promise<void> => {
    setBusy(action);
    setMessage(null);
    try {
      await task();
    } catch (taskError) {
      if (!isUserCancellation(taskError)) {
        setMessage(errorText(taskError, 'Something went wrong. Please try again.'));
      }
    } finally {
      setBusy(null);
    }
  };

  const issue = async (): Promise<void> => {
    setBusy('issue');
    setMessage(null);
    try {
      let record: CertificateRecord;
      try {
        record = await issueArtworkCertificate(database, artwork.id, draft);
      } catch (issueError) {
        setMessage(`The certificate was not issued: ${errorText(issueError, 'please try again.')}`);
        return;
      }
      setActive(record);
      try {
        await shareCertificatePdf(
          { snapshot: record.snapshot, number: record.number, issuedAt: record.issuedAt },
          artwork.primaryImageUri,
        );
        setMessage(
          `Issued certificate ${record.number}. Back up to Google Drive soon so it is kept in your backup.`,
        );
      } catch (shareError) {
        setMessage(
          isUserCancellation(shareError)
            ? `Issued certificate ${record.number}. Tap Share PDF whenever you are ready to send it.`
            : `Certificate ${record.number} was issued, but the PDF could not be created (${errorText(shareError, 'unknown error')}). Tap Share PDF to try again.`,
        );
      }
    } finally {
      issuing.current = false;
      setBusy(null);
    }
  };

  const confirm = (title: string, body: string, action: string, destructive: boolean): void => {
    if (issuing.current) return;
    issuing.current = true;
    Alert.alert(
      title,
      body,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => (issuing.current = false) },
        { text: action, style: destructive ? 'destructive' : 'default', onPress: () => void issue() },
      ],
      { cancelable: true, onDismiss: () => (issuing.current = false) },
    );
  };

  const confirmIssue = (): void =>
    confirm(
      'Issue certificate?',
      `"${draft.title}" will get the next certificate number. Reprints keep the same number and details.`,
      'Issue',
      false,
    );

  const confirmReissue = (): void => {
    if (!active) return;
    confirm(
      'Reissue certificate?',
      `Certificate ${active.number} will be marked void and a new number issued with the current details. Tell anyone holding the old certificate that it has been replaced.`,
      'Reissue',
      true,
    );
  };

  const preview = (): Promise<void> =>
    run('preview', () =>
      printCertificate(
        { snapshot: draft, number: null, issuedAt: new Date().toISOString() },
        artwork.primaryImageUri,
      ),
    );

  const shareIssued = (): Promise<void> =>
    run('share', async () => {
      if (!active) return;
      await shareCertificatePdf(
        { snapshot: active.snapshot, number: active.number, issuedAt: active.issuedAt },
        artwork.primaryImageUri,
      );
    });

  const printIssued = (): Promise<void> =>
    run('print', async () => {
      if (!active) return;
      await printCertificate(
        { snapshot: active.snapshot, number: active.number, issuedAt: active.issuedAt },
        artwork.primaryImageUri,
      );
    });

  const rows: [string, string][] = [
    ['Title', shown.title],
    ['Artist', shown.artist],
    ['Year', shown.year],
    ['Medium', shown.medium],
    ['Size', shown.size],
    ['Artwork ID', shown.artworkId],
    ['Price', shown.price],
    ['Signed by', shown.issuer],
  ];

  if (mode === 'locked') {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Certificate of Authenticity</Text>
            <Text style={styles.body}>
              Certificates are a Premium feature. Redeem a VIP code or Get Premium to issue a numbered certificate for
              this artwork.
            </Text>
            <Button label="Unlock with VIP code" onPress={() => router.push('/vip-redeem' as Href)} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        A one-page certificate with the artwork photo, its details, a certificate number and space for your signature.
        Print it and sign by hand, or share the PDF with the buyer.
      </Text>

      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.eyebrow}>{active ? 'Issued' : 'Not issued yet'}</Text>
          <Text style={styles.cardTitle}>
            {active ? `Certificate ${active.number}` : 'New certificate'}
          </Text>
          {active ? <Text style={styles.body}>Issued {formatCertificateDate(active.issuedAt)}</Text> : null}

          <View style={styles.rows}>
            {rows
              .filter(([, value]) => value.trim())
              .map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text selectable style={styles.rowValue}>
                    {value}
                  </Text>
                </View>
              ))}
          </View>

          {changed ? (
            <Text style={styles.notice}>
              This artwork has been edited since the certificate was issued. Reprints keep the original details;
              reissue to print the current ones.
            </Text>
          ) : null}
          {!hasImage ? (
            <Text style={styles.notice}>
              This artwork has no photo, so the certificate will show a blank space. Add a photo with Edit first for a
              stronger certificate.
            </Text>
          ) : null}
          {mode === 'reprint-only' ? (
            <Text style={styles.notice}>
              Premium has ended. You can still share and print this certificate; issuing a new one or reissuing needs
              Premium.
            </Text>
          ) : null}
          {blocker && canCertificate ? <Text style={styles.warning}>{blocker}</Text> : null}
          {isWeb ? <Text style={styles.notice}>Certificates require the Android or iOS app.</Text> : null}
          {message ? (
            <Text accessibilityRole="alert" style={styles.message}>
              {message}
            </Text>
          ) : null}

          {priceAvailable && !blocker && canCertificate ? (
            <View style={styles.chipRow}>
              <Chip
                label={includePrice ? 'Price included' : 'Include price'}
                selected={includePrice}
                onPress={() => setIncludePrice((value) => !value)}
              />
              <Text style={styles.chipHint}>
                {active ? 'Applies when you reissue.' : 'Off by default.'}
              </Text>
            </View>
          ) : null}

          {active ? (
            <>
              <Button
                label={busy === 'share' ? 'Preparing…' : 'Share PDF'}
                disabled={busy !== null || isWeb}
                onPress={() => void shareIssued()}
              />
              <Button
                label={busy === 'print' ? 'Preparing…' : 'Print'}
                variant="secondary"
                disabled={busy !== null || isWeb}
                onPress={() => void printIssued()}
              />
              {mode === 'issued' && !blocker ? (
                <Button
                  label={busy === 'issue' ? 'Issuing…' : 'Reissue with current details'}
                  variant="secondary"
                  disabled={busy !== null || isWeb}
                  onPress={confirmReissue}
                />
              ) : null}
              {mode === 'reprint-only' ? (
                <Button
                  label="Unlock with VIP code"
                  variant="secondary"
                  onPress={() => router.push('/vip-redeem' as Href)}
                />
              ) : null}
            </>
          ) : blocker ? (
            <Button
              label="Edit artwork"
              onPress={() => router.push({ pathname: '/artwork/[id]/edit', params: { id: artwork.id } })}
            />
          ) : (
            <>
              <Button
                label={busy === 'issue' ? 'Issuing…' : 'Issue certificate'}
                disabled={busy !== null || isWeb}
                onPress={confirmIssue}
              />
              <Button
                label={busy === 'preview' ? 'Preparing…' : 'Preview draft'}
                variant="secondary"
                disabled={busy !== null || isWeb}
                onPress={() => void preview()}
              />
            </>
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },
    lead: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    cardBody: { padding: spacing.md, gap: spacing.sm },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    cardTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
    body: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    rows: { marginVertical: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.md, paddingVertical: 6 },
    rowLabel: { width: 92, color: colors.inkMuted, fontWeight: '700' },
    rowValue: { flex: 1, color: colors.ink },
    notice: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    warning: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 20 },
    message: { color: colors.ink, fontWeight: '700', fontSize: 14 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    chipHint: { color: colors.inkMuted, fontSize: 13 },
  });
