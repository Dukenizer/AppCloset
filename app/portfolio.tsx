import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  getDisplayUnit,
  getUserProfile,
  listArtworks,
  type CollectionRecord,
  listCollections,
} from '@/data/artworkRepository';
import type { Artwork, ArtworkQuery } from '@/domain/artwork';
import { profileArtistName, type DisplayUnit, type UserProfile } from '@/domain/profile';
import { useEntitlements } from '@/entitlements';
import { exportPortfolioPdf } from '@/services/portfolioPdfService';
import { Button, Card, ScreenState } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

const collectionMembersQuery = (collectionId: number): ArtworkQuery => ({
  search: '',
  status: null,
  sort: 'title-asc',
  year: '',
  dateFrom: '',
  dateTo: '',
  artist: '',
  genre: '',
  tag: '',
  medium: '',
  material: '',
  collection: '',
  collectionId,
  orientation: null,
  sizeBucket: null,
});

export default function PortfolioScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const database = useSQLiteContext();
  const { can } = useEntitlements();
  const params = useLocalSearchParams<{ collectionId?: string | string[]; name?: string | string[] }>();
  const collectionIdRaw = Array.isArray(params.collectionId) ? params.collectionId[0] : params.collectionId;
  const nameParam = Array.isArray(params.name) ? params.name[0] : params.name;
  const collectionId = Number(collectionIdRaw);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [collectionName, setCollectionName] = useState(nameParam?.trim() || 'Collection');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('cm');
  const [coverArtist, setCoverArtist] = useState('');
  const [profile, setProfile] = useState<UserProfile | undefined>(undefined);

  const canPortfolio = can('CAN_GENERATE_PORTFOLIO');

  const load = useCallback(async (): Promise<void> => {
    if (!Number.isFinite(collectionId) || collectionId <= 0) {
      setError('Collection not found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [members, collections, unit, profile] = await Promise.all([
        listArtworks(database, collectionMembersQuery(collectionId)),
        listCollections(database),
        getDisplayUnit(database),
        getUserProfile(database),
      ]);
      const record: CollectionRecord | undefined = collections.find((row) => row.id === collectionId);
      setArtworks(members);
      setCollectionName(record?.name ?? nameParam?.trim() ?? 'Collection');
      setDisplayUnit(unit);
      setCoverArtist(profileArtistName(profile));
      setProfile(profile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collection.');
    } finally {
      setLoading(false);
    }
  }, [collectionId, database, nameParam]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const showGetPremium = (): void => {
    Alert.alert(
      'Premium feature',
      'Portfolio PDF is included with Premium. Testers can unlock it now with a VIP code.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem VIP code', onPress: () => router.push('/vip-redeem' as Href) },
      ],
    );
  };

  const generate = async (): Promise<void> => {
    if (!canPortfolio) {
      showGetPremium();
      return;
    }
    if (Platform.OS === 'web') {
      setMessage('Portfolio PDF requires the Android or iOS app.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await exportPortfolioPdf(artworks, {
        collectionName,
        displayUnit,
        coverArtist,
        ...(profile ? { profile } : {}),
      });
      setMessage(`Created portfolio PDF with ${artworks.length} artwork${artworks.length === 1 ? '' : 's'}.`);
    } catch (exportError) {
      setMessage(exportError instanceof Error ? exportError.message : 'Unable to create portfolio PDF.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || error) {
    return <ScreenState loading={loading} error={error} onRetry={() => void load()} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Generate a shareable PDF of every artwork in this collection. Each painting is shown in full (not cropped),
        with title and details below. Status is never included; price only if you set it and did not hide it.
      </Text>

      <Card>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{collectionName}</Text>
          <Text style={styles.body}>
            {artworks.length === 0
              ? 'This collection is empty.'
              : `${artworks.length} artwork${artworks.length === 1 ? '' : 's'} will be included.`}
          </Text>
          {!canPortfolio ? (
            <Text style={styles.body}>
              Portfolio PDF is a Premium feature. Redeem a VIP code or Get Premium to generate and share.
            </Text>
          ) : null}
          {Platform.OS === 'web' ? (
            <Text style={styles.notice}>Portfolio PDF requires the Android or iOS app.</Text>
          ) : null}
          {message ? (
            <Text accessibilityRole="alert" style={styles.message}>
              {message}
            </Text>
          ) : null}
          {canPortfolio ? (
            <Button
              label={busy ? 'Preparing…' : 'Generate & share PDF'}
              disabled={busy || artworks.length === 0 || Platform.OS === 'web'}
              onPress={() => void generate()}
            />
          ) : (
            <>
              <Button label="Unlock with VIP code" onPress={() => router.push('/vip-redeem' as Href)} />
              <Button label="Get Premium" variant="secondary" onPress={showGetPremium} />
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
    cardTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
    body: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    notice: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    message: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  });
