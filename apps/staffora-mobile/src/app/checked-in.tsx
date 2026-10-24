import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { formatDisplayDate, formatTimeOfDay, minutesOfDayIST, weekday } from '@fincrew/core';
import { Button, Card, StatusPill, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { loadMyDay, type MyDay } from '@/lib/my-day';
import { space, useTheme } from '@/lib/theme';

/**
 * Checked in / out (design: "Checked in"): the time in large figures, present (and minutes late,
 * worked out by the shared grid rules), the day, shop, how, and from when check-out works.
 */
export default function CheckedIn() {
  const { kind, at, method } = useLocalSearchParams<{
    kind: 'in' | 'out';
    at: string;
    method: 'scan' | 'typed';
  }>();
  const { profile } = useAuth();
  const { c } = useTheme();
  const [day, setDay] = useState<MyDay | null>(null);
  const k = 'staffora.checked';

  useEffect(() => {
    if (profile) void loadMyDay(profile.shopId, profile.personId).then(setDay);
  }, [profile]);

  const when = new Date(at);
  const minutes = minutesOfDayIST(when);
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const late = day?.cell?.late ? (day.cell.lateMinutes ?? 0) : 0;
  // The shop's minimum gap between check-in and check-out.
  const outFrom = day ? minutes + day.minGapMinutes : null;
  const rows: [string, string][] = [
    [t(`${k}.date`), day ? `${days[weekday(day.today)]} ${formatDisplayDate(day.today)}` : ''],
    [t(`${k}.shop`), profile?.shopName ?? ''],
    [t(`${k}.how`), method === 'scan' ? t(`${k}.howScan`) : t(`${k}.howTyped`)],
    ...(kind === 'in' && outFrom !== null
      ? ([[t(`${k}.checkOutFrom`), t(`${k}.from`, { time: formatTimeOfDay(outFrom % 1440) })]] as [
          string,
          string,
        ][])
      : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
        style={{
          flex: 1,
          alignItems: 'center',
          gap: space['space-3'],
          paddingTop: 72,
          paddingHorizontal: space['space-6'],
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c['status-present-soft'],
          }}
        >
          <Check size={44} color={c['status-present']} strokeWidth={2.6} />
        </View>
        <Text variant="title-lg">{kind === 'out' ? t(`${k}.out`) : t(`${k}.in`)}</Text>
        <Text variant="money-hero">{formatTimeOfDay(minutes)}</Text>
        {kind === 'in' && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <StatusPill status="present" />
            {late > 0 && (
              <Text variant="label-sm" color={c['status-late']}>
                {t('mobile.today.lateMin', { minutes: late })}
              </Text>
            )}
          </View>
        )}
        <Text variant="body-lg" muted style={{ textAlign: 'center' }}>
          {kind === 'out'
            ? t(`${k}.bye`)
            : late > 0 && day?.shift
              ? t(`${k}.late`, { time: formatTimeOfDay(day.shift.start), minutes: late })
              : t(`${k}.onTime`)}
        </Text>
        <Card style={{ alignSelf: 'stretch', marginTop: space['space-4'] }}>
          {rows.map(([label, value], i) => (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: space['space-3'],
                padding: space['space-4'],
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderBottomColor: c.line,
              }}
            >
              <Text muted>{label}</Text>
              <Text variant="label-sm">{value}</Text>
            </View>
          ))}
        </Card>
      </View>
      <View style={{ padding: space['space-4'] }}>
        <Button label={t(`${k}.done`)} block onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}
