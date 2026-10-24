import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { radius, size, space, textStyle, useTheme } from '@/lib/theme';

/** Email and password sign-in (the owner's FinCrew login, same as the website). */
export default function SignIn() {
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(t('auth.invalidCredentials'));
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
              {t('auth.signInTitle')}
            </Text>
            <Text muted>{t('auth.signInSubtitle')}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label-sm">{t('auth.email')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel={t('auth.email')}
              style={input}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label-sm">{t('auth.password')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              accessibilityLabel={t('auth.password')}
              onSubmitEditing={submit}
              style={input}
            />
          </View>
          {error && <Text color={c.danger}>{error}</Text>}
          <Button
            label={busy ? t('auth.signingIn') : t('auth.signIn')}
            onPress={submit}
            busy={busy}
            disabled={!email || !password}
            block
          />
        </Card>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
