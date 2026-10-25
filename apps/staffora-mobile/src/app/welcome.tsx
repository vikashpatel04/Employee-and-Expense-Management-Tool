import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Calendar, Check, ChevronLeft, IndianRupee, Phone, QrCode } from 'lucide-react-native';
import { phoneKey } from '@fincrew/core';
import { CodePad } from '@/components/code-pad';
import { Avatar, Button, Card, IconButton, Text } from '@/components/ui';
import { useAuth, type Found } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { pinRefusal } from '@/lib/pin-text';
import { radius, space, textStyle, useTheme } from '@/lib/theme';

type Step = 'phone' | 'hello' | 'pin' | 'confirm' | 'enter';
type Message = { text: string; banner: boolean };

const PHONE_REASONS = ['not_found', 'left', 'many'];

/**
 * First open on a phone (design: "Sign in with phone · first run"): the mobile number the shop
 * saved is the user id. A number without a PIN yet greets the person ("Hi Priya") and they choose
 * a 4-digit PIN twice, which ties Staffora to this phone; a number that already has a PIN (a
 * removed or reinstalled Staffora) asks for it. All through `staff-auth`.
 */
export default function Welcome() {
  const { lookup, setUp, signIn } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const w = 'staffora.welcome';
  const k = 'staffora.signIn';

  const goTo = (s: Step, m: Message | null = null) => {
    setStep(s);
    setMessage(m);
    setPadKey((n) => n + 1);
  };

  const next = async () => {
    if (!phoneKey(phone)) return setError(t(`${w}.badNumber`));
    setBusy(true);
    setError(null);
    const r = await lookup(phone);
    setBusy(false);
    if (!r.ok) {
      return setError(t(`${w}.${PHONE_REASONS.includes(r.reason) ? r.reason : 'failed'}`));
    }
    setFound(r);
    goTo(r.hasPin ? 'enter' : 'hello');
  };

  const onPin = async (pin: string) => {
    if (!found) return;
    if (step === 'enter') {
      setBusy(true);
      const r = await signIn(phone, found, pin);
      setBusy(false);
      if (r.ok) return router.replace('/');
      return goTo('enter', pinRefusal(r));
    }
    if (step === 'pin') {
      setFirst(pin);
      return goTo('confirm');
    }
    if (pin !== first) return goTo('pin', { text: t(`${k}.mismatch`), banner: false });
    setBusy(true);
    const r = await setUp(phone, pin, { firstName: found.firstName, shopName: found.shopName });
    setBusy(false);
    if (r.ok) return router.replace('/');
    if (r.reason === 'has_pin') return goTo('enter', { text: t(`${k}.hasPin`), banner: true });
    if (r.reason === 'bad_pin') return goTo('pin', { text: t(`${k}.badPin`), banner: false });
    if (PHONE_REASONS.includes(r.reason)) {
      setError(t(`${w}.${r.reason}`));
      return goTo('phone');
    }
    goTo('pin', pinRefusal(r));
  };

  if (step === 'phone') {
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
            <Phone size={32} color={c['on-accent']} strokeWidth={2.6} />
          </View>
          <Text variant="title-xl">{t(`${w}.title`)}</Text>
          <Text variant="body-lg">{t(`${w}.body`)}</Text>
          <View style={{ gap: 6, marginTop: space['space-2'] }}>
            <Text variant="label-sm">{t(`${w}.phoneLabel`)}</Text>
            <View
              style={{
                flexDirection: 'row',
                minHeight: 56,
                borderRadius: radius['radius-md'],
                borderWidth: error ? 2 : 1,
                borderColor: error ? c.danger : c['line-strong'],
                backgroundColor: c.surface,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  backgroundColor: c['surface-muted'],
                }}
              >
                <Text variant="money-md" muted>
                  {t(`${w}.countryCode`)}
                </Text>
              </View>
              <TextInput
                accessibilityLabel={t(`${w}.phoneLabel`)}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setError(null);
                }}
                onSubmitEditing={() => void next()}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={16}
                style={[
                  textStyle('money-lg'),
                  { flex: 1, minWidth: 0, paddingHorizontal: 14, color: c.ink },
                ]}
              />
            </View>
            {error ? (
              <View accessibilityRole="alert">
                <Text color={c.danger}>{error}</Text>
              </View>
            ) : (
              <Text muted>{t(`${w}.phoneHint`)}</Text>
            )}
          </View>
        </View>
        <View style={{ padding: space['space-4'] }}>
          <Button
            label={busy ? t(`${w}.checking`) : t(`${w}.next`)}
            block
            busy={busy}
            disabled={!phone.trim()}
            onPress={() => void next()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'hello' && found) {
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
          <Text variant="title-xl">{t(`${k}.hello`, { name: found.firstName })}</Text>
          <Text variant="body-lg">{t(`${k}.onList`, { shop: found.shopName })}</Text>
          <Card>
            {(
              [
                [QrCode, 'code'],
                [Calendar, 'days'],
                [IndianRupee, 'money'],
              ] as const
            ).map(([Icon, f], i) => (
              <View
                key={f}
                style={{
                  flexDirection: 'row',
                  gap: space['space-3'],
                  padding: space['space-4'],
                  borderBottomWidth: i < 2 ? 1 : 0,
                  borderBottomColor: c.line,
                }}
              >
                <Icon size={22} color={c.ink} />
                <Text>{t(`${k}.features.${f}`)}</Text>
              </View>
            ))}
          </Card>
          <Text muted>{t(`${k}.notYou`)}</Text>
        </View>
        <View style={{ padding: space['space-4'], gap: space['space-2'] }}>
          <Button label={t(`${k}.itsMe`)} block onPress={() => goTo('pin')} />
          <Button label={t(`${k}.back`)} variant="quiet" block onPress={() => goTo('phone')} />
        </View>
      </SafeAreaView>
    );
  }

  const enter = step === 'enter';
  const confirm = step === 'confirm';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${k}.back`)}
          onPress={() => goTo(enter ? 'phone' : confirm ? 'pin' : 'hello')}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t(`${k}.back`)}
        </Text>
      </View>
      {enter && found ? (
        <View style={{ alignItems: 'center', gap: space['space-2'], paddingTop: space['space-4'] }}>
          <Avatar name={found.firstName} size={64} />
          <Text variant="title-lg">{found.firstName}</Text>
          <Text muted>{found.shopName}</Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: space['space-4'], gap: 4 }}>
          <Text variant="title-lg">{t(confirm ? `${k}.confirmTitle` : `${k}.pinTitle`)}</Text>
          <Text variant="body-lg" muted>
            {t(confirm ? `${k}.confirmSub` : `${k}.pinSub`)}
          </Text>
        </View>
      )}
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
          title={enter ? t(`${k}.enterTitle`) : undefined}
          hint={
            busy
              ? t(enter ? 'staffora.pin.checking' : `${k}.saving`)
              : enter
                ? undefined
                : t(`${k}.pinHint`)
          }
          error={message && !message.banner ? message.text : null}
          onComplete={(pin) => void onPin(pin)}
        />
      </View>
      {enter && (
        <View style={{ padding: space['space-4'], paddingTop: 0 }}>
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {t('staffora.pin.forgot')}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
