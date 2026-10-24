import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, QrCode } from 'lucide-react-native';
import { CodePad } from '@/components/code-pad';
import { Button, IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { checkError } from '@/lib/check-text';
import { t } from '@/lib/i18n';
import { checkIn } from '@/lib/my-day';
import { space, useTheme } from '@/lib/theme';

/**
 * Enter code (design: "Enter code" / "· wrong code"): the 6-digit pad; the last digit checks in
 * (or out) through `check_in`, which applies the shop's rules.
 */
export default function EnterCode() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);
  const s = 'staffora.code';

  const onCode = async (code: string) => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const r = await checkIn(profile.shopId, code, 'typed');
    setBusy(false);
    if (r.ok)
      router.replace({
        pathname: '/checked-in',
        params: { kind: r.kind, at: r.at, method: 'typed' },
      });
    else {
      setError(checkError(r));
      setPadKey((k) => k + 1);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${s}.back`)}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t(`${s}.back`)}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space['space-4'], gap: 4 }}>
        <Text variant="title-lg">{t(`${s}.title`)}</Text>
        <Text variant="body-lg" muted>
          {t(`${s}.sub`)}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          padding: space['space-4'],
          gap: space['space-3'],
        }}
      >
        <CodePad
          length={6}
          busy={busy}
          resetKey={padKey}
          hint={busy ? t(`${s}.checking`) : t(`${s}.hint`)}
          error={error}
          onChange={() => error && setError(null)}
          onComplete={onCode}
        />
        <View style={{ alignItems: 'center' }}>
          <Button
            label={t(`${s}.scanInstead`)}
            variant="quiet"
            icon={QrCode}
            onPress={() => router.replace('/scan')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
