import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { CodePad } from '@/components/code-pad';
import { IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { pinRefusal } from '@/lib/pin-text';
import { radius, space, useTheme } from '@/lib/theme';

type Step = 'current' | 'new' | 'confirm';
type Message = { text: string; banner: boolean };

/**
 * Me → Change PIN. Same pad and steps as choosing the PIN in "Join · first run": the current
 * PIN, then the new one twice (a mismatch is caught on the phone). The server checks the current
 * PIN like a sign-in, so wrong ones count towards the wait / lock (`change_pin`).
 */
export default function ChangePin() {
  const { changePin } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('current');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const k = 'staffora.changePin';

  const goTo = (s: Step, m: Message | null = null) => {
    setStep(s);
    setMessage(m);
    setPadKey((n) => n + 1);
  };

  const onPin = async (pin: string) => {
    if (step === 'current') {
      setCurrent(pin);
      return goTo('new');
    }
    if (step === 'new') {
      setNext(pin);
      return goTo('confirm');
    }
    if (pin !== next) return goTo('new', { text: t(`${k}.mismatch`), banner: false });

    setBusy(true);
    const r = await changePin(current, next);
    setBusy(false);
    if (r.ok) return router.dismissTo({ pathname: '/me', params: { changed: '1' } });
    if (r.reason === 'same_pin') return goTo('new', { text: t(`${k}.samePin`), banner: false });
    if (r.reason === 'bad_pin') return goTo('new', { text: t(`${k}.badPin`), banner: false });
    goTo('current', pinRefusal(r));
  };

  const back = () => {
    if (step === 'current') router.back();
    else goTo(step === 'confirm' ? 'new' : 'current');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${k}.back`)}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t(`${k}.back`)}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space['space-4'], gap: 4 }}>
        <Text variant="title-lg">{t(`${k}.${step}Title`)}</Text>
        <Text variant="body-lg" muted>
          {t(`${k}.${step}Sub`)}
        </Text>
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
          hint={busy ? t(`${k}.saving`) : undefined}
          error={message && !message.banner ? message.text : null}
          onComplete={(pin) => void onPin(pin)}
        />
      </View>
    </SafeAreaView>
  );
}
