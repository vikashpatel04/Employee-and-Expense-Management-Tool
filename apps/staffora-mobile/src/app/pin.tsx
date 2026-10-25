import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CodePad } from '@/components/code-pad';
import { Avatar, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { pinRefusal } from '@/lib/pin-text';
import { radius, space, useTheme } from '@/lib/theme';

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
      setMessage(pinRefusal(r));
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
