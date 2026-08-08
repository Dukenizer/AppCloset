import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getSetting } from '@/data/artworkRepository';
import { colors } from '@/ui/theme';

export default function IndexScreen(): React.JSX.Element {
  const database = useSQLiteContext();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void getSetting(database, 'onboarding_complete').then((value) => {
      if (active) setOnboardingComplete(value === 'true');
    });
    return () => {
      active = false;
    };
  }, [database]);

  if (onboardingComplete === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return <Redirect href={onboardingComplete ? '/(tabs)/index' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
