import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft, KeyRound, QrCode } from 'lucide-react-native';
import { parseScannedCode } from '@fincrew/core';
import { Button, IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { checkError } from '@/lib/check-text';
import { t } from '@/lib/i18n';
import { checkIn } from '@/lib/my-day';
import { radius, space, useTheme } from '@/lib/theme';

/**
 * Android reads the QR with Google's code scanner (Play services): it opens full screen, reads
 * and closes, and needs no camera permission. expo-camera's in-view reader analyses full-size
 * frames on the main thread and often never reports a code on Android phones (owner, 29/10/2026).
 * Elsewhere (iOS) the in-view camera is used.
 */
const GOOGLE_SCANNER = Platform.OS === 'android' && CameraView.isModernBarcodeScannerAvailable;

/**
 * Scan QR (design: "Scan QR"): reads any QR whose content is the plain 6-digit code (core
 * `parseScannedCode`) and checks in straight away through `check_in`.
 */
export default function Scan() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  // The camera reports the same QR many times a second: handle one at a time.
  const handling = useRef(false);
  const s = 'staffora.scan';

  const onScan = useCallback(
    async (data: string) => {
      if (handling.current || !profile) return;
      const code = parseScannedCode(data);
      if (!code) {
        setError(t(`${s}.notCode`));
        return;
      }
      handling.current = true;
      setReading(code);
      setError(null);
      try {
        const r = await checkIn(profile.shopId, code, 'scan');
        if (r.ok) {
          router.replace({
            pathname: '/checked-in',
            params: { kind: r.kind, at: r.at, method: 'scan' },
          });
          return;
        }
        setError(checkError(r));
      } catch (e) {
        setError(t(`${s}.failed`, { reason: e instanceof Error ? e.message : String(e) }));
      }
      setReading(null);
      // Let the person move the phone away before trying again.
      setTimeout(() => {
        handling.current = false;
      }, 2500);
    },
    [profile],
  );

  const openScanner = useCallback(() => {
    setError(null);
    void CameraView.launchScanner({ barcodeTypes: ['qr'] }).catch((e: unknown) =>
      setError(t(`${s}.failed`, { reason: e instanceof Error ? e.message : String(e) })),
    );
  }, []);

  useEffect(() => {
    if (!GOOGLE_SCANNER) return;
    const sub = CameraView.onModernBarcodeScanned((r) => void onScan(r.data));
    return () => sub.remove();
  }, [onScan]);

  // Open the scanner straight away; "Scan again" reopens it.
  useEffect(() => {
    if (GOOGLE_SCANNER && profile) openScanner();
  }, [openScanner, profile]);

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
          {reading ? (
            <View style={{ alignItems: 'center', gap: space['space-3'] }}>
              <ActivityIndicator color={c.accent} size="large" />
              <Text variant="title-lg" style={{ letterSpacing: 4 }}>
                {reading}
              </Text>
            </View>
          ) : GOOGLE_SCANNER ? (
            <View style={{ alignItems: 'center', gap: space['space-3'] }}>
              <QrCode size={96} color={c['ink-muted']} />
              <Button
                label={t(error ? `${s}.again` : `${s}.open`)}
                center
                onPress={openScanner}
              />
            </View>
          ) : permission?.granted ? (
            <CameraView
              style={{ width: 300, height: 300 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(r) => void onScan(r.data)}
            />
          ) : (
            <View
              style={{ padding: space['space-4'], gap: space['space-3'], alignItems: 'center' }}
            >
              <Text muted style={{ textAlign: 'center' }}>
                {permission && !permission.canAskAgain ? t(`${s}.noCamera`) : t(`${s}.permission`)}
              </Text>
              {(!permission || permission.canAskAgain) && (
                <Button label={t(`${s}.allow`)} center onPress={() => void requestPermission()} />
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
            {reading ? t(`${s}.checking`, { code: reading }) : t(`${s}.any`)}
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
