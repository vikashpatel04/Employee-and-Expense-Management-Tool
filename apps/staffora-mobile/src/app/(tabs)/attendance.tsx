import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Umbrella } from 'lucide-react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatTimeOfDay,
  monthDates,
  monthOf,
  weekday,
} from '@fincrew/core';
import { loadAttendanceMonth, type GridRow } from '@fincrew/data';
import { statusTokens, type StatusKey } from '@fincrew/ui';
import { Button, Card, IconButton, STATUS_ICONS, StatusPill, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

/** Monday first, like the design's calendar. */
const column = (wd: number) => (wd + 6) % 7;
/** How many months ahead the calendar goes (leave can be asked for up to a year ahead). */
const AHEAD_MONTHS = 12;
const key = (y: { year: number; month: number }) => y.year * 12 + y.month;

/**
 * Attendance (design: "Attendance", PLAN §6.3): my month as a calendar (status colour + icon,
 * late dot), the chosen day's status, minutes late and times, the month's counts, and "Ask for
 * leave". Worked out by the same shared code as FinCrew (`loadAttendanceMonth`); read-only here.
 * Months ahead show leave already marked, weekly offs and holidays (`upcoming`). The loaded row
 * is kept with its month, so switching months never draws one month's days from another's data.
 */
export default function Attendance() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const [ym, setYm] = useState(monthOf(today));
  const [loaded, setLoaded] = useState<{ key: number; row: GridRow | null } | null>(null);
  const [day, setDay] = useState(today);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const row = loaded?.key === key(ym) ? loaded.row : undefined;

  const load = useCallback(async () => {
    if (!profile) return;
    const asked = key(ym);
    latest.current = asked;
    setLoading(true);
    try {
      const { rows } = await loadAttendanceMonth(
        supabase,
        profile.shopId,
        ym.year,
        ym.month,
        today,
        { upcoming: true },
      );
      if (latest.current !== asked) return; // the person moved on to another month
      setLoaded({ key: asked, row: rows.find((r) => r.staffId === profile.personId) ?? null });
    } finally {
      if (latest.current === asked) setLoading(false);
    }
  }, [profile, ym, today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shift = (by: number) => {
    const d = new Date(Date.UTC(ym.year, ym.month - 1 + by, 1));
    const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    setYm(next);
    const all = monthDates(next.year, next.month);
    const dates = all.filter((x) => x <= today);
    setDay(dates.includes(today) ? today : (dates.at(-1) ?? all[0]!));
  };
  const current = monthOf(today);
  const hasNext = key(ym) < key(current) + AHEAD_MONTHS;

  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const tiny = t('weekdays.tiny', { returnObjects: true }) as unknown as string[];
  const short = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const status = t('status', { returnObjects: true }) as unknown as Record<string, string>;
  const dates = monthDates(ym.year, ym.month);
  const cell = row?.cells.find((x) => x.date === day);
  const sofar = row?.cells.filter((x) => !x.upcoming) ?? [];
  const n = (s: string) => sofar.filter((x) => x.status === s).length;
  const counts = row
    ? (
        [
          ['present', n('present')],
          ['late', row.lateDays],
          ['half_day', n('half_day')],
          ['absent', n('absent')],
          ['paid_leave', n('paid_leave')],
          ['unpaid_leave', n('unpaid_leave')],
          ['weekly_off', n('weekly_off')],
          ['holiday', n('holiday')],
          ['unmarked', n('unmarked')],
        ] as const
      ).filter(([, x]) => x > 0)
    : [];
  const leaveAhead =
    row?.cells.filter(
      (x) => x.upcoming && (x.status === 'paid_leave' || x.status === 'unpaid_leave'),
    ).length ?? 0;
  const started = monthDates(ym.year, ym.month)[0]! <= today;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space['space-4'], gap: space['space-4'] }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Text variant="title-xl" style={{ paddingTop: space['space-2'] }}>
          {t('staffora.tabs.attendance')}
        </Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center', padding: space['space-1'] }}>
          <IconButton
            label={t('attendance.prevMonth')}
            onPress={() => shift(-1)}
            icon={<ChevronLeft size={22} color={c.ink} />}
          />
          <View style={{ flex: 1, alignItems: 'center' }} accessibilityLiveRegion="polite">
            <Text variant="label-sm">{`${months[ym.month - 1]} ${ym.year}`}</Text>
          </View>
          <IconButton
            label={t('attendance.nextMonth')}
            disabled={!hasNext}
            onPress={() => shift(1)}
            icon={<ChevronRight size={22} color={c.ink} />}
          />
        </Card>

        {row === null && (
          <Text muted>
            {t('staffDetail.attendance.notEmployed', {
              month: `${months[ym.month - 1]} ${ym.year}`,
            })}
          </Text>
        )}

        {row && (
          <>
            <Card style={{ padding: space['space-2'] }}>
              <View style={{ flexDirection: 'row' }}>
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <Text key={wd} variant="micro" muted style={{ flex: 1, textAlign: 'center' }}>
                    {tiny[wd]}
                  </Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                {Array.from({ length: column(weekday(dates[0]!)) }, (_, i) => (
                  <View key={`pad-${i}`} style={{ width: `${100 / 7}%` }} />
                ))}
                {dates.map((d) => {
                  const x = row.cells.find((cc) => cc.date === d);
                  if (!x) return <View key={d} style={{ width: `${100 / 7}%` }} />;
                  const future = x.status === 'future' || x.status === 'not_employed';
                  const tok =
                    future || x.status === 'unmarked' ? null : statusTokens(x.status as StatusKey);
                  const Icon = STATUS_ICONS[x.status];
                  const selected = d === day;
                  return (
                    <View key={d} style={{ width: `${100 / 7}%`, padding: 2 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: future }}
                        accessibilityLabel={`${short[weekday(d)]} ${formatDisplayDate(d)}, ${status[x.status] ?? x.status}${x.late ? `, ${status.late}` : ''}`}
                        disabled={future}
                        onPress={() => setDay(d)}
                        style={{
                          minHeight: 52,
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                          borderRadius: radius['radius-sm'],
                          opacity: x.upcoming && !selected ? 0.7 : 1,
                          backgroundColor: tok?.bg ? c[tok.bg] : 'transparent',
                          borderWidth: selected
                            ? 2
                            : x.status === 'unmarked'
                              ? 1.5
                              : future
                                ? 1
                                : 0,
                          borderStyle: x.status === 'unmarked' && !selected ? 'dashed' : 'solid',
                          borderColor: selected
                            ? c['accent-ink']
                            : x.status === 'unmarked'
                              ? c['line-strong']
                              : c.line,
                        }}
                      >
                        <Text
                          variant="caption"
                          color={tok ? c[tok.fg] : c['ink-muted']}
                          style={{ fontWeight: d === today ? '700' : undefined }}
                        >
                          {Number(d.slice(8))}
                        </Text>
                        {Icon && !future && (
                          <Icon
                            size={14}
                            color={tok ? c[tok.fg] : c['ink-muted']}
                            strokeWidth={2.6}
                          />
                        )}
                        {x.late && (
                          <View
                            style={{
                              position: 'absolute',
                              top: 5,
                              right: 5,
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: c['status-late'],
                            }}
                          />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </Card>

            {cell && cell.status !== 'future' && (
              <Card style={{ padding: space['space-4'], gap: space['space-2'] }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <Text variant="title-md">{`${short[weekday(day)]} ${formatDisplayDate(day)}`}</Text>
                  <StatusPill status={cell.status as StatusKey} />
                </View>
                {(cell.checkIn !== undefined || cell.checkOut !== undefined) && (
                  <Text variant="money-sm">
                    {t('mobile.staff.times', {
                      in: cell.checkIn !== undefined ? formatTimeOfDay(cell.checkIn) : '—',
                      out: cell.checkOut !== undefined ? formatTimeOfDay(cell.checkOut) : '—',
                    })}
                  </Text>
                )}
                {cell.late && (
                  <Text variant="label-sm" color={c['status-late']}>
                    {t('mobile.today.lateMin', { minutes: cell.lateMinutes ?? 0 })}
                  </Text>
                )}
                {cell.upcoming ? (
                  <Text variant="caption" muted>
                    {t('staffora.attendance.planned')}
                  </Text>
                ) : (
                  !cell.marked &&
                  cell.status !== 'unmarked' && (
                    <Text variant="caption" muted>
                      {t('mobile.staff.fromRules')}
                    </Text>
                  )
                )}
              </Card>
            )}

            <View style={{ gap: space['space-2'] }}>
              {started && (
                <Text variant="label-sm">
                  {t('mobile.staff.payable', { days: row.payableDays })}
                </Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {counts.map(([s, x]) => (
                  <StatusPill key={s} status={s} label={`${x} ${status[s]}`} />
                ))}
              </View>
              {leaveAhead > 0 && (
                <Text muted>{t('staffora.attendance.leaveAhead', { count: leaveAhead })}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <View
        style={{
          padding: space['space-4'],
          paddingTop: space['space-3'],
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.line,
        }}
      >
        <Button
          label={t('staffora.ask.leaveTitle')}
          icon={Umbrella}
          block
          onPress={() => router.push({ pathname: '/ask', params: { kind: 'leave' } })}
        />
      </View>
    </SafeAreaView>
  );
}
