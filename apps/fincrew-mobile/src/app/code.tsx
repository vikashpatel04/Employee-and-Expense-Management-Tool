import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, Clock, QrCode, RefreshCw } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import {
  loadAttendanceCode,
  loadCheckIns,
  minutesUntil,
  regenerateAttendanceCode,
  type AttendanceCode,
} from '@fincrew/data';
import { FormMessage, Notice } from '@/components/form';
import { Qr } from '@/components/qr';
import { Avatar, Button, Card, IconButton, SectionTitle, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type CheckIns = Awaited<ReturnType<typeof loadCheckIns>>;
const time = (iso: string) => formatTimeOfDay(minutesOfDayIST(new Date(iso)));

function changeText(code: AttendanceCode) {
  if (!code.nextChange) return t('code.manual');
  const left = minutesUntil(code.nextChange);
  return t('code.changesAt', {
    time: time(code.nextChange),
    left:
      left >= 60
        ? t('code.hours', { h: Math.floor(left / 60), m: left % 60 })
        : t('code.minutes', { m: left }),
  });
}

/**
 * Attendance code (design: "Attendance code" and "· QR", PLAN §4.5): today's code in large
 * digits, a full-screen QR for the counter, a new code after a confirmation, and today's
 * check-ins by code. Needs attendance.code; the code itself comes from the database function.
 */
export default function CodeScreen() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const [code, setCode] = useState<AttendanceCode | null | undefined>(undefined);
  const [checkIns, setCheckIns] = useState<CheckIns | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const [a, b] = await Promise.all([
      loadAttendanceCode(supabase, me.shopId),
      loadCheckIns(supabase, me.shopId, today),
    ]);
    setCode(a);
    setCheckIns(b);
    setLoading(false);
  }, [me, today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const reasons = t('code.results', { returnObjects: true }) as unknown as Record<string, string>;

  const regenerate = async () => {
    if (!me) return;
    setBusy(true);
    const r = await regenerateAttendanceCode(supabase, me.shopId);
    setBusy(false);
    setAsking(false);
    if (r) {
      setCode(r);
      setMessage({ ok: true, text: t('code.made') });
    } else setMessage({ ok: false, text: t('code.failed') });
  };

  if (!can('attendance.code'))
    return (
      <SafeAreaView style={{ flex: 1, padding: space['space-4'], backgroundColor: c.canvas }}>
        <Text>{t('code.noPermission')}</Text>
      </SafeAreaView>
    );

  if (showQr && code)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
        <View
          style={{
            paddingHorizontal: space['space-2'],
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <IconButton
            label={t('code.back')}
            onPress={() => setShowQr(false)}
            icon={<ChevronLeft size={24} color={c['accent-ink']} />}
          />
          <Text variant="label-sm" color={c['accent-ink']}>
            {t('code.back')}
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space['space-4'],
            padding: space['space-4'],
          }}
        >
          <Text variant="title-xl">{t('code.scanTitle')}</Text>
          <Text muted>{me?.shopName}</Text>
          <Qr text={code.code} size={300} label={t('code.qrLabel', { code: code.code })} />
          <Text variant="code-digits">{`${code.code.slice(0, 3)} ${code.code.slice(3)}`}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={16} color={c['ink-muted']} />
            <Text variant="caption" muted>
              {changeText(code)}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('mobile.tabs.today')}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('mobile.tabs.today')}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-1'],
          gap: space['space-4'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={{ gap: 2 }}>
          <Text variant="title-xl">{t('code.title')}</Text>
          <Text muted>
            {t('code.subtitle', { shop: me?.shopName ?? '', date: formatDisplayDate(today) })}
          </Text>
        </View>

        {code === null && <Text color={c.danger}>{t('code.failed')}</Text>}
        {code && (
          <Card style={{ padding: space['space-5'], alignItems: 'center', gap: space['space-3'] }}>
            <Text variant="label-sm" muted>
              {t('code.today')}
            </Text>
            <View accessible accessibilityLabel={code.code.split('').join(' ')}>
              <Text variant="code-digits">{`${code.code.slice(0, 3)} ${code.code.slice(3)}`}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Clock size={16} color={c['ink-muted']} />
              <Text variant="caption" muted>
                {changeText(code)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
              <Button
                label={t('mobile.code.showQr')}
                variant="secondary"
                icon={QrCode}
                onPress={() => setShowQr(true)}
              />
              {!asking && (
                <Button
                  label={t('code.newCode')}
                  variant="quiet"
                  icon={RefreshCw}
                  onPress={() => setAsking(true)}
                />
              )}
            </View>
            {asking && (
              <Notice title={t('code.newConfirm')}>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: space['space-2'],
                    marginTop: space['space-2'],
                  }}
                >
                  <Button
                    label={t('code.cancel')}
                    variant="secondary"
                    onPress={() => setAsking(false)}
                  />
                  <Button label={t('code.newYes')} busy={busy} onPress={regenerate} />
                </View>
              </Notice>
            )}
            {message && <FormMessage ok={message.ok} text={message.text} />}
          </Card>
        )}

        <Text variant="caption" muted>
          {t('code.hint')}
        </Text>

        {checkIns && (
          <View style={{ gap: space['space-2'] }}>
            <SectionTitle
              title={t('code.checkedIn', { count: checkIns.rows.length, total: checkIns.working })}
            />
            {checkIns.rows.length === 0 ? (
              <Text muted>{t('code.none')}</Text>
            ) : (
              <Card>
                {checkIns.rows.map((r) => (
                  <View
                    key={r.staffId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space['space-3'],
                      minHeight: 64,
                      paddingHorizontal: space['space-4'],
                      paddingVertical: space['space-2'],
                      borderBottomWidth: 1,
                      borderBottomColor: c.line,
                    }}
                  >
                    <Avatar name={r.name} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text variant="caption" muted>
                        {[
                          r.method ? t(`code.how.${r.method}`) : null,
                          r.checkOut ? `${t('code.columns.out')} ${time(r.checkOut)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="money-sm">{r.checkIn ? time(r.checkIn) : '—'}</Text>
                      {r.lateMinutes ? (
                        <Text variant="micro" color={c['status-late']}>
                          {t('mobile.today.lateMin', { minutes: r.lateMinutes })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            )}
            {checkIns.refused.length > 0 && (
              <Text variant="caption" muted>
                {t('code.refused', {
                  count: checkIns.refused.length,
                  list: checkIns.refused
                    .slice(-5)
                    .map((x) =>
                      t('code.refusedItem', {
                        name: x.name,
                        reason: reasons[x.result] ?? x.result,
                        time: time(x.at),
                      }),
                    )
                    .join('; '),
                })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
