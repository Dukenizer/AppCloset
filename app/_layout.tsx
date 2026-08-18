import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { migrateDatabase } from '@/data/database';
import { EntitlementsProvider } from '@/entitlements';
import { initDiagnostics, logDiagnostic } from '@/services/debugLog';
import { playOpenChime } from '@/services/openSound';
import { checkForArtClosetUpdate } from '@/services/updateCheck';
import { ArtworkProvider } from '@/state/ArtworkContext';
import { CaptureProvider } from '@/state/CaptureContext';
import {
  CatalogReloadProvider,
  useCatalogReload,
} from '@/state/CatalogReloadContext';
import { AppErrorBoundary } from '@/ui/AppErrorBoundary';
import { HeaderHomeButton } from '@/ui/StackHeaderActions';
import { ThemePreferenceSync } from '@/ui/ThemePreferenceSync';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';

function LoadingDatabase(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

function CatalogTree(): React.JSX.Element {
  const { colors, isDark, theme } = useTheme();
  const { catalogEpoch, catalogSuspended } = useCatalogReload();
  // Do not use SQLiteProvider suspense: it caches the open DB by name, so Home
  // kept the empty pre-restore handle. Non-suspense remounts a new connection.
  const onInit = useCallback(
    async (database: SQLiteDatabase) => {
      await logDiagnostic('catalog.open', { epoch: catalogEpoch });
      await migrateDatabase(database);
      const row = await database.getFirstAsync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM artworks WHERE deleted_at IS NULL`,
      );
      await logDiagnostic('catalog.ready', { epoch: catalogEpoch, artworkCount: row?.c ?? 0 });
    },
    [catalogEpoch],
  );
  const sqliteOptions = useMemo(() => ({ useNewConnection: true }), [catalogEpoch]);

  if (catalogSuspended) {
    return <LoadingDatabase />;
  }

  return (
    <SQLiteProvider
      key={catalogEpoch}
      databaseName="artcloset.db"
      options={sqliteOptions}
      onInit={onInit}
      onError={(error) => {
        void logDiagnostic('catalog.providerError', { message: error.message });
        if (!/unable to open database file|finalizeAsync|closed resource/i.test(error.message)) {
          throw error;
        }
      }}
    >
      <ThemePreferenceSync />
      <EntitlementsProvider>
        <CaptureProvider>
          <ArtworkProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack
              key={`${theme}-${catalogEpoch}`}
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.ink,
                headerTitleStyle: { color: colors.ink },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
                headerBackButtonDisplayMode: 'minimal',
                headerRight: () => <HeaderHomeButton />,
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="artwork/new" options={{ title: 'Add artwork', presentation: 'modal' }} />
              <Stack.Screen name="artwork/batch" options={{ title: 'Batch upload', presentation: 'modal' }} />
              <Stack.Screen name="artwork/[id]/index" options={{ title: 'Artwork details' }} />
              <Stack.Screen name="artwork/[id]/edit" options={{ title: 'Edit artwork' }} />
              <Stack.Screen name="filters" options={{ title: 'Filters', presentation: 'modal' }} />
              <Stack.Screen name="exhibit" options={{ title: 'Exhibit Mode', headerShown: false }} />
              <Stack.Screen name="labels" options={{ title: 'Exhibit labels' }} />
              <Stack.Screen name="share-card/[id]" options={{ title: 'Share artwork' }} />
              <Stack.Screen name="calling-card" options={{ title: 'Calling card' }} />
              <Stack.Screen name="catalog-fields" options={{ title: 'Catalog fields' }} />
              <Stack.Screen name="about" options={{ title: 'About ArtCloset' }} />
              <Stack.Screen name="vip-redeem" options={{ title: 'Redeem VIP code' }} />
              <Stack.Screen
                name="camera"
                options={{ title: 'Photograph artwork', presentation: 'fullScreenModal' }}
              />
            </Stack>
          </ArtworkProvider>
        </CaptureProvider>
      </EntitlementsProvider>
    </SQLiteProvider>
  );
}

function RootContent(): React.JSX.Element {
  useEffect(() => {
    void initDiagnostics();
    void checkForArtClosetUpdate();
    void playOpenChime();
  }, []);

  return (
    <AppErrorBoundary>
      <CatalogReloadProvider>
        <CatalogTree />
      </CatalogReloadProvider>
    </AppErrorBoundary>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <ThemeProvider>
      <RootContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
