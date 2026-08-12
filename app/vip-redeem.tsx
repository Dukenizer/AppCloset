import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';

import { normalizeVipCode, useEntitlements } from '@/entitlements';
import { Button, Card } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';
import { spacing, type ColorTokens } from '@/ui/theme';

export default function VipRedeemScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { redeem, isPremiumActive, vipStatus, redemption } = useEntitlements();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onChange = (text: string): void => {
    setCode(normalizeVipCode(text));
    setMessage(null);
    setOk(false);
  };

  const onRedeem = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await redeem(code);
      setOk(result.ok);
      setMessage(result.message);
      if (result.ok) setCode('');
    } finally {
      setBusy(false);
    }
  };

  const expiryLabel = redemption
    ? new Date(redemption.expiry_date).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Redeem VIP code' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.cardBody}>
            <Text style={styles.title}>Redeem VIP code</Text>
            <Text style={styles.body}>
              Enter the 6-character code you received. VIP1 unlocks Premium for 3 months; VIP2 for 6 months from
              activation on this device.
            </Text>
            {isPremiumActive && expiryLabel ? (
              <Text style={styles.hint}>This device already has active VIP until {expiryLabel}.</Text>
            ) : null}
            {vipStatus === 'expired' && expiryLabel ? (
              <Text style={styles.hint}>Previous VIP ended {expiryLabel}. Enter a new unused code.</Text>
            ) : null}
            <TextInput
              accessibilityLabel="VIP code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              value={code}
              onChangeText={onChange}
              placeholder="XXXXXX"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
            />
            <Button
              label={busy ? 'Redeeming…' : 'Redeem'}
              disabled={busy || code.length !== 6}
              onPress={() => void onRedeem()}
            />
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[styles.message, ok ? styles.success : styles.error]}
              >
                {message}
              </Text>
            ) : null}
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    content: { padding: spacing.md, paddingBottom: 64, gap: spacing.md },
    cardBody: { padding: spacing.md, gap: spacing.md },
    title: { color: colors.ink, fontSize: 20, fontWeight: '800' },
    body: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
    hint: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      color: colors.ink,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 8,
      textAlign: 'center',
      paddingVertical: spacing.md,
      borderRadius: 8,
    },
    message: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
    success: { color: colors.success },
    error: { color: colors.danger },
  });
