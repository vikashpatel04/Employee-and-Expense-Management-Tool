import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Check, ChevronLeft, IndianRupee, QrCode } from 'lucide-react-native';
import { CodePad } from '@/components/code-pad';
import { Button, Card, IconButton, Text } from '@/components/ui';
import { staffAuth, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { space, useTheme } from '@/lib/theme';

type Invite = { name: string; shopName: string };
type Step = 'welcome' | 'pin' | 'confirm';

const reasonText = (reason: string) =>
  ['invalid', 'used', 'expired', 'bad_pin'].includes(reason)
    ? t(`staffora.join.${reason === 'bad_pin' ? 'badPin' : reason}`)
    : t('staffora.join.failed');

/**
 * First run from the invite link (design: "Join · first run"): who it's for, then a 4-digit PIN
 * typed twice. Accepting goes through `staff-auth`, which links the sign-in, saves the PIN and
 * ties Staffora to this phone; then Home opens. A later link for the same person resets the PIN.
 */
export default function Join() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { join } = useAuth();
  const { c } = useTheme();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [first, setFirst] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const j = 'staffora.join';

  useEffect(() => {
    void staffAuth({ action: 'invite', token }).then((r) => {
      if (r.ok) setInvite({ name: String(r.name), shopName: String(r.shopName) });
      else setError(reasonText(String(r.reason)));
    });
  }, [token]);

  const onPin = async (pin: string) => {
    if (step === 'pin') {
      setFirst(pin);
      setMismatch(false);
      setStep('confirm');
      setPadKey((k) => k + 1);
      return;
    }
    if (pin !== first) {
      setMismatch(true);
      setStep('pin');
      setPadKey((k) => k + 1);
      return;
    }
    setBusy(true);
    const r = await join(token, pin, invite!);
    setBusy(false);
    if (r.ok) router.replace('/');
    else {
      setError(reasonText(r.reason));
      setStep('welcome');
    }
  };

  if (!invite)
    return (
      <SafeAreaView
        style={{ flex: 1, padding: space['space-6'], paddingTop: 96, backgroundColor: c.canvas }}
      >
        <Text variant="body-lg" muted={!error} color={error ? c.danger : undefined}>
          {error ?? t(`${j}.checking`)}
        </Text>
      </SafeAreaView>
    );

  if (step === 'welcome') {
    const first = invite.name.split(' ')[0] ?? invite.name;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
        <View style={{ flex: 1, padding: space['space-6'], paddingTop: 72, gap: space['space-4'] }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={32} color={c['on-accent']} strokeWidth={2.6} />
          </View>
          <Text variant="title-xl">{t(`${j}.hello`, { name: first })}</Text>
          <Text variant="body-lg">{t(`${j}.invited`, { shop: invite.shopName })}</Text>
          <Card>
            {(
              [
                [QrCode, 'code'],
                [Calendar, 'days'],
                [IndianRupee, 'money'],
              ] as const
            ).map(([Icon, k], i) => (
              <View
                key={k}
                style={{
                  flexDirection: 'row',
                  gap: space['space-3'],
                  padding: space['space-4'],
                  borderBottomWidth: i < 2 ? 1 : 0,
                  borderBottomColor: c.line,
                }}
              >
                <Icon size={22} color={c.ink} />
                <Text>{t(`${j}.features.${k}`)}</Text>
              </View>
            ))}
          </Card>
          <Text muted>{t(`${j}.notYou`)}</Text>
          {error && <Text color={c.danger}>{error}</Text>}
        </View>
        <View style={{ padding: space['space-4'] }}>
          <Button label={t(`${j}.itsMe`)} block onPress={() => setStep('pin')} />
        </View>
      </SafeAreaView>
    );
  }

  const confirm = step === 'confirm';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${j}.back`)}
          onPress={() => {
            setStep('welcome');
            setMismatch(false);
          }}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t(`${j}.back`)}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space['space-4'], gap: 4 }}>
        <Text variant="title-lg">{t(confirm ? `${j}.confirmTitle` : `${j}.pinTitle`)}</Text>
        <Text variant="body-lg" muted>
          {t(confirm ? `${j}.confirmSub` : `${j}.pinSub`)}
        </Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: space['space-4'] }}>
        <CodePad
          length={4}
          secret
          busy={busy}
          resetKey={padKey}
          hint={busy ? t(`${j}.saving`) : t(`${j}.pinHint`)}
          error={mismatch ? t(`${j}.mismatch`) : null}
          onComplete={onPin}
        />
      </View>
    </SafeAreaView>
  );
}
