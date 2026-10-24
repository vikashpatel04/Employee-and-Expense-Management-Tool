import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import { CodePad } from '@/components/code-pad';
import { Avatar, Text } from '@/components/ui';
import { useAuth, type AuthReply } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { radius, space, useTheme } from '@/lib/theme';

function refusal(r: Exclude<AuthReply, { ok: true }>): { text: string; banner: boolean } {
  const p = 'staffora.pin';
  switch (r.reason) {
    case 'wrong_pin':
      return { text: t(`${p}.wrong`, { count: r.triesLeft ?? 0 }), banner: false };
    case 'wait':
      return {
        text: t(`${p}.wait`, {
          time: r.retryAt ? formatTimeOfDay(minutesOfDayIST(new Date(r.retryAt))) : '',
        }),
        banner: true,
      };
    case 'locked':
      return { text: t(`${p}.locked`), banner: true };
    case 'wrong_device':
      return { text: t(`${p}.wrongDevice`), banner: true };
    case 'left':
      return { text: t(`${p}.left`), banner: true };
    case 'no_login':
      return { text: t(`${p}.noLogin`), banner: true };
    default:
      return { text: t(`${p}.failed`), banner: false };
  }
}

/**
 * PIN to open (design: "PIN to open"): every time Staffora opens, the 4-digit PIN signs in again
 * through `staff-auth` (wrong PINs count; a wait, then a lock the shop lifts).
 */
export default function Pin() {
  const { profile, unlock } = useAuth();
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; banner: boolean } | null>(null);
  const [padKey, setPadKey] = useState(0);

  const onPin = async (pin: string) => {
    setBusy(true);
    setMessage(null);
    const r = await unlock(pin);
    setBusy(false);
    if (r.ok) router.replace('/');
    else {
      setMessage(refusal(r));
      setPadKey((k) => k + 1);
    }
  };

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
          title={t('staffora.pin.title')}
          hint={busy ? t('staffora.pin.checking') : undefined}
          error={message && !message.banner ? message.text : null}
          onComplete={onPin}
        />
      </View>
      <View style={{ padding: space['space-4'], paddingTop: 0 }}>
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          {t('staffora.pin.forgot')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
