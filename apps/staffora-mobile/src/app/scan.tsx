import { useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft, KeyRound } from 'lucide-react-native';
import { parseScannedCode } from '@fincrew/core';
import { Button, IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { checkError } from '@/lib/check-text';
import { t } from '@/lib/i18n';
import { checkIn } from '@/lib/my-day';
import { radius, space, useTheme } from '@/lib/theme';

/**
 * Scan QR (design: "Scan QR"): the camera reads any QR whose content is the plain 6-digit code
 * (core `parseScannedCode`) and checks in straight away through `check_in`.
 */
export default function Scan() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The camera reports the same QR many times a second: handle one at a time.
  const handling = useRef(false);
  const s = 'staffora.scan';

  const onScan = async (data: string) => {
    if (handling.current || !profile) return;
    const code = parseScannedCode(data);
    if (!code) {
      setError(t(`${s}.notCode`));
      return;
    }
    handling.current = true;
    setBusy(true);
    setError(null);
    const r = await checkIn(profile.shopId, code, 'scan');
    setBusy(false);
    if (r.ok) {
      router.replace({
        pathname: '/checked-in',
        params: { kind: r.kind, at: r.at, method: 'scan' },
      });
      return;
    }
    setError(checkError(r));
    // Let the person move the phone away before trying again.
    setTimeout(() => {
      handling.current = false;
    }, 2500);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('staffora.code.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('staffora.code.back')}
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
          alignItems: 'center',
          justifyContent: 'center',
          padding: space['space-4'],
          gap: space['space-3'],
        }}
      >
        <View
          style={{
            width: 300,
            height: 300,
            borderRadius: radius['radius-lg'],
            overflow: 'hidden',
            backgroundColor: c['surface-muted'],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {permission?.granted ? (
            <CameraView
              style={{ width: 300, height: 300 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : (r) => void onScan(r.data)}
            />
          ) : (
            <View
              style={{ padding: space['space-4'], gap: space['space-3'], alignItems: 'center' }}
            >
              <Text muted style={{ textAlign: 'center' }}>
                {permission && !permission.canAskAgain ? t(`${s}.noCamera`) : t(`${s}.permission`)}
              </Text>
              {(!permission || permission.canAskAgain) && (
                <Button label={t(`${s}.allow`)} onPress={() => void requestPermission()} />
              )}
            </View>
          )}
        </View>
        {error ? (
          <View accessibilityLiveRegion="assertive">
            <Text color={c.danger} style={{ textAlign: 'center' }}>
              {error}
            </Text>
          </View>
        ) : (
          <Text muted style={{ textAlign: 'center' }}>
            {t(`${s}.any`)}
          </Text>
        )}
      </View>
      <View style={{ padding: space['space-4'], gap: space['space-2'] }}>
        <Button
          label={t(`${s}.enterInstead`)}
          variant="secondary"
          icon={KeyRound}
          block
          onPress={() => router.replace('/enter-code')}
        />
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          {t(`${s}.cameraOnly`)}
        </Text>
      </View>
    </SafeAreaView>
  );
}
