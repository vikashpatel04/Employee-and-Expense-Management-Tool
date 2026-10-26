import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, size, space, textStyle, useTheme } from '@/lib/theme';

/**
 * "Choose your password" (docs/features/helper-sign-in.md): a helper signed in with the first
 * password the shop gave (`must_change_password`) picks their own before using the app. Same
 * step as the website's /password; the root layout shows only this until it's done.
 */
export default function ChoosePassword() {
  const { c } = useTheme();
  const { signOut } = useSession();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password !== again) return setError(t('password.errors.mismatch'));
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (!e) await supabase.auth.refreshSession();
    setBusy(false);
    if (e) setError(t('password.errors.failed', { reason: e.message }));
  };

  const input = [
    textStyle('body-lg'),
    {
      minHeight: size['tap-min'],
      paddingHorizontal: space['space-3'],
      borderRadius: radius['radius-sm'],
      borderWidth: 1,
      borderColor: c['line-strong'],
      backgroundColor: c.surface,
      color: c.ink,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: space['space-4'] }}
      >
        <Card style={{ padding: space['space-6'], gap: space['space-4'] }}>
          <View style={{ gap: 4 }}>
            <Text variant="title-lg" color={c['accent-ink']}>
              {t('password.title')}
            </Text>
            <Text muted>{t('password.subtitle')}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label-sm">{t('password.new')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              accessibilityLabel={t('password.new')}
              style={input}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label-sm">{t('password.again')}</Text>
            <TextInput
              value={again}
              onChangeText={setAgain}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              accessibilityLabel={t('password.again')}
              onSubmitEditing={submit}
              style={input}
            />
          </View>
          {error && (
            <View accessibilityRole="alert">
              <Text color={c.danger}>{error}</Text>
            </View>
          )}
          <Button
            label={busy ? t('password.saving') : t('password.save')}
            onPress={submit}
            busy={busy}
            disabled={!password || !again}
            block
          />
          <Button label={t('auth.signOut')} variant="quiet" onPress={signOut} block />
        </Card>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
