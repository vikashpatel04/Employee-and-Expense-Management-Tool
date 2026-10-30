import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Fingerprint, LogOut } from 'lucide-react-native';
import { CodePad } from '@/components/code-pad';
import { Avatar, Button, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { pinRefusal } from '@/lib/pin-text';
import { radius, space, useTheme } from '@/lib/theme';

type Step = 'enter' | 'new' | 'confirm';
type Message = { text: string; banner: boolean };

/**
 * PIN to open (design: "PIN to open"): every time Staffora opens, the 4-digit PIN signs in again
 * through `staff-auth` (wrong PINs count; a wait, then a lock the shop lifts), or the fingerprint
 * when the person turned it on. After the shop resets the PIN (`no_pin`), the same screen asks
 * for a new one twice. "Not <name>? Sign out" forgets this phone's sign-in (back to Welcome).
 */
export default function Pin() {
  const { profile, unlock, unlockWithBiometric, biometricOn, setUp, forget } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('enter');
  const [first, setFirst] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [padKey, setPadKey] = useState(0);
  const k = 'staffora.signIn';

  const goTo = (s: Step, m: Message | null = null) => {
    setStep(s);
    setMessage(m);
    setPadKey((n) => n + 1);
  };

  const fingerprint = useCallback(async () => {
    const r = await unlockWithBiometric(t('staffora.pin.biometricPrompt'));
    if (r.ok) router.replace('/');
    else if (r.reason === 'left') setMessage({ text: t('staffora.pin.notOnStaff'), banner: true });
    else if (r.reason === 'wrong_device')
      setMessage({ text: t('staffora.pin.wrongDevice'), banner: true });
  }, [unlockWithBiometric]);

  useEffect(() => {
    if (biometricOn) void fingerprint();
  }, [biometricOn, fingerprint]);

  const onPin = async (pin: string) => {
    if (step === 'enter') {
      setBusy(true);
      setMessage(null);
      const r = await unlock(pin);
      setBusy(false);
      if (r.ok) return router.replace('/');
      if (r.reason === 'no_pin' && profile?.phone) return goTo('new');
      return goTo('enter', pinRefusal(r));
    }
    if (step === 'new') {
      setFirst(pin);
      return goTo('confirm');
    }
    if (pin !== first) return goTo('new', { text: t(`${k}.mismatch`), banner: false });
    setBusy(true);
    const r = await setUp(profile!.phone!, pin, {
      firstName: profile!.name,
      shopName: profile!.shopName,
    });
    setBusy(false);
    if (r.ok) return router.replace('/');
    goTo(r.reason === 'has_pin' ? 'enter' : 'new', pinRefusal(r));
  };

  const choosing = step !== 'enter';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{
          alignItems: 'center',
          gap: space['space-2'],
          paddingTop: 64,
          paddingHorizontal: space['space-6'],
        }}
      >
        <Avatar name={profile?.name ?? ''} size={64} />
        <Text variant="title-lg">{profile?.name ?? ''}</Text>
        <Text muted>{profile?.shopName ?? ''}</Text>
        {choosing && (
          <Text variant="body-lg" style={{ textAlign: 'center', marginTop: space['space-2'] }}>
            {t(step === 'confirm' ? `${k}.confirmTitle` : `${k}.resetSub`)}
          </Text>
        )}
      </View>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          padding: space['space-4'],
          gap: space['space-4'],
        }}
      >
        {message?.banner && (
          <View
            accessibilityRole="alert"
            style={{
              padding: space['space-3'],
              borderRadius: radius['radius-md'],
              backgroundColor: c['status-late-soft'],
            }}
          >
            <Text>{message.text}</Text>
          </View>
        )}
        <CodePad
          length={4}
          secret
          busy={busy}
          resetKey={padKey}
          title={t(choosing ? `${k}.resetTitle` : 'staffora.pin.title')}
          hint={
            busy
              ? t(choosing ? `${k}.saving` : 'staffora.pin.checking')
              : choosing
                ? t(`${k}.pinHint`)
                : undefined
          }
          error={message && !message.banner ? message.text : null}
          onComplete={(pin) => void onPin(pin)}
        />
        {biometricOn && !choosing && (
          <Button
            label={t('staffora.pin.useBiometric')}
            variant="secondary"
            icon={Fingerprint}
            block
            onPress={() => void fingerprint()}
          />
        )}
      </View>
      {!choosing && (
        <View style={{ padding: space['space-4'], paddingTop: 0, alignItems: 'center' }}>
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {t('staffora.pin.forgot')}
          </Text>
          {/* Someone else's sign-in on this phone (or one Android restored): forget it here. */}
          <Button
            label={t('staffora.pin.notYou', { name: profile?.name ?? '' })}
            variant="quiet"
            icon={LogOut}
            onPress={() => void forget()}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
