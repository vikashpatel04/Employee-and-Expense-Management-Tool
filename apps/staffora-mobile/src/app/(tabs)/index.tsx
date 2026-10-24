import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Check, Clock, KeyRound, QrCode, Umbrella } from 'lucide-react-native';
import { formatTimeOfDay, minutesOfDayIST, weekday, formatDisplayDate } from '@fincrew/core';
import type { StatusKey } from '@fincrew/ui';
import { Button, Card, StatusPill, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { loadMyDay, type MyDay } from '@/lib/my-day';
import { radius, space, useTheme } from '@/lib/theme';

/**
 * Home (design: "Home · before check-in / checked in", PLAN §6.3): greeting, today's status and
 * times, this month at a glance, and the check-in card with Scan QR / Enter code when the shop
 * lets this person check in themselves.
 */
export default function Home() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [day, setDay] = useState<MyDay | null>(null);
  const [loading, setLoading] = useState(false);
  const h = 'staffora.home';

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setDay(await loadMyDay(profile.shopId, profile.personId));
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const minutes = minutesOfDayIST(new Date());
  const greeting = minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening';
  const firstName = profile?.name.split(' ')[0] ?? '';
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const cell = day?.cell;
  const inAt = cell?.checkIn;
  const outAt = cell?.checkOut;
  const count = (s: string) => day?.row?.cells.filter((x) => x.status === s).length ?? 0;
  const statusKey: StatusKey =
    !cell ||
    cell.status === 'future' ||
    cell.status === 'not_employed' ||
    cell.status === 'unmarked'
      ? 'unmarked'
      : (cell.status as StatusKey);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space['space-4'], gap: space['space-4'] }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={{ gap: 2, paddingTop: space['space-2'] }}>
          <Text muted>{profile?.shopName}</Text>
          <Text variant="title-xl">{t(`${h}.greeting.${greeting}`, { name: firstName })}</Text>
        </View>

        {day && (
          <Card style={{ padding: space['space-4'], gap: space['space-2'] }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Text variant="label-sm">
                {t(`${h}.today`, {
                  date: `${days[weekday(day.today)]} ${formatDisplayDate(day.today)}`,
                })}
              </Text>
              <StatusPill
                status={statusKey}
                label={statusKey === 'unmarked' ? t(`${h}.notCheckedIn`) : undefined}
              />
            </View>
            {inAt === undefined && cell?.marked ? (
              <Text variant="body-lg">
                {t(`${h}.markedByShop`, { status: t(`status.${cell.status}`) })}
              </Text>
            ) : inAt === undefined ? (
              <>
                {day.shift && (
                  <Text variant="body-lg">
                    {t(`${h}.shiftStarts`, { time: formatTimeOfDay(day.shift.start) })}
                  </Text>
                )}
                <Text muted>{t(`${h}.checkInHint`)}</Text>
              </>
            ) : (
              <>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
                >
                  <Text variant="money-md">{t(`${h}.inAt`, { time: formatTimeOfDay(inAt) })}</Text>
                  {outAt !== undefined && (
                    <Text variant="money-md">{` · ${t(`${h}.outAt`, { time: formatTimeOfDay(outAt) })}`}</Text>
                  )}
                  {cell?.late && (
                    <Text variant="caption" color={c['status-late']}>
                      {t('mobile.today.lateMin', { minutes: cell.lateMinutes ?? 0 })}
                    </Text>
                  )}
                </View>
                <Text muted>
                  {[
                    day.shift
                      ? t(`${h}.shift`, {
                          from: formatTimeOfDay(day.shift.start),
                          to: formatTimeOfDay(day.shift.end),
                        })
                      : null,
                    outAt === undefined ? t(`${h}.notOut`) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </>
            )}
          </Card>
        )}

        {day?.row && (
          <Card style={{ padding: space['space-4'], gap: space['space-3'] }}>
            <Text variant="title-md">
              {t(`${h}.monthSoFar`, { month: months[Number(day.today.slice(5, 7)) - 1] })}
            </Text>
            <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
              {(
                [
                  [
                    Check,
                    c['status-present'],
                    c['status-present-soft'],
                    count('present') + count('half_day') * 0.5,
                    `${h}.present`,
                  ],
                  [Clock, c['status-late'], c['status-late-soft'], day.row.lateDays, `${h}.late`],
                  [
                    Umbrella,
                    c['status-paid-leave'],
                    c['status-paid-leave-soft'],
                    day.row.payableDays,
                    `${h}.payable`,
                  ],
                ] as const
              ).map(([Icon, fg, bg, n, label]) => (
                <View key={label} style={{ flex: 1, gap: 4 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: bg,
                    }}
                  >
                    <Icon size={16} color={fg} strokeWidth={2.6} />
                  </View>
                  <Text variant="money-md">{String(n)}</Text>
                  <Text variant="caption" muted>
                    {t(label)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>

      {day && !day.selfAttendance && (
        <View
          style={{
            margin: space['space-3'],
            padding: space['space-4'],
            borderRadius: radius['radius-lg'],
            backgroundColor: c['surface-muted'],
          }}
        >
          <Text muted>{t(`${h}.selfOff`)}</Text>
        </View>
      )}
      {day?.selfAttendance && (
        <View
          style={{
            margin: space['space-3'],
            padding: space['space-4'],
            gap: space['space-3'],
            borderRadius: radius['radius-lg'],
            backgroundColor: c.accent,
          }}
        >
          <View style={{ gap: 2 }}>
            <Text variant="title-md" color={c['on-accent']}>
              {inAt === undefined
                ? t(`${h}.checkIn`)
                : outAt === undefined
                  ? t(`${h}.checkOut`)
                  : t(`${h}.doneToday`)}
            </Text>
            <Text color={c['on-accent']}>
              {inAt === undefined
                ? t(`${h}.checkInSub`)
                : outAt === undefined
                  ? day.shift
                    ? t(`${h}.shift`, {
                        from: formatTimeOfDay(day.shift.start),
                        to: formatTimeOfDay(day.shift.end),
                      })
                    : ''
                  : t(`${h}.doneSub`, { in: formatTimeOfDay(inAt), out: formatTimeOfDay(outAt) })}
            </Text>
          </View>
          {outAt === undefined && (
            <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t(`${h}.scan`)}
                  variant="secondary"
                  icon={QrCode}
                  block
                  onPress={() => router.push('/scan')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t(`${h}.enter`)}
                  variant="secondary"
                  icon={KeyRound}
                  block
                  onPress={() => router.push('/enter-code')}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
