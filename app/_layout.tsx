import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { migrateDatabase } from '@/data/database';
import { ArtworkProvider } from '@/state/ArtworkContext';
import { CaptureProvider } from '@/state/CaptureContext';
import { colors } from '@/ui/theme';

function LoadingDatabase(): React.JSX.Element {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <Suspense fallback={<LoadingDatabase />}>
      <SQLiteProvider databaseName="artcloset.db" onInit={migrateDatabase} useSuspense>
        <CaptureProvider>
          <ArtworkProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.ink,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="artwork/new" options={{ title: 'Add artwork', presentation: 'modal' }} />
              <Stack.Screen name="artwork/[id]" options={{ title: 'Artwork details' }} />
              <Stack.Screen name="artwork/[id]/edit" options={{ title: 'Edit artwork' }} />
              <Stack.Screen name="filters" options={{ title: 'Search filters', presentation: 'modal' }} />
              <Stack.Screen name="exhibit" options={{ title: 'Exhibit Mode', headerShown: false }} />
              <Stack.Screen name="share-card/[id]" options={{ title: 'Share artwork' }} />
              <Stack.Screen name="camera" options={{ title: 'Photograph artwork', presentation: 'fullScreenModal' }} />
            </Stack>
          </ArtworkProvider>
        </CaptureProvider>
      </SQLiteProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
