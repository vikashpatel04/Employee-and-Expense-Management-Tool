import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatTimeOfDay,
  monthDates,
  monthOf,
  weekday,
} from '@fincrew/core';
import {
  loadAttendanceMonth,
  writeAttendance,
  type GridRow,
  type SettableStatus,
} from '@fincrew/data';
import { statusTokens, type StatusKey } from '@fincrew/ui';
import { attendanceError, StatusSheet } from '@/components/status-sheet';
import { Button, Card, IconButton, STATUS_ICONS, StatusPill, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

/** Monday first, like the design's calendar. */
const column = (wd: number) => (wd + 6) % 7;

/**
 * Staff detail · Attendance (design: Staff detail · Attendance): Monday-first month calendar,
 * the chosen day's status, lateness and times with Change, and the month's counts. Same rules as
 * the website's Attendance tab (`loadAttendanceMonth`, `writeAttendance`).
 */
export function AttendanceSection({
  staffId,
  name,
  onChanged,
}: {
  staffId: string;
  name: string;
  onChanged: () => void;
}) {
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const [ym, setYm] = useState(monthOf(today));
  const [row, setRow] = useState<GridRow | null | undefined>(undefined);
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const { rows } = await loadAttendanceMonth(supabase, me.shopId, ym.year, ym.month, today);
    setRow(rows.find((r) => r.staffId === staffId) ?? null);
  }, [me, ym, today, staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shift = (by: number) => {
    const d = new Date(Date.UTC(ym.year, ym.month - 1 + by, 1));
    const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    setYm(next);
    const dates = monthDates(next.year, next.month).filter((x) => x <= today);
    setDay(dates.includes(today) ? today : (dates.at(-1) ?? today));
  };
  const current = monthOf(today);
  const hasNext = ym.year * 12 + ym.month < current.year * 12 + current.month;

  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const tiny = t('weekdays.tiny', { returnObjects: true }) as unknown as string[];
  const short = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const status = t('status', { returnObjects: true }) as unknown as Record<string, string>;
  const dates = monthDates(ym.year, ym.month);
  const cell = row?.cells.find((x) => x.date === day);
  const editable =
    !!cell &&
    cell.status !== 'future' &&
    cell.status !== 'not_employed' &&
    can('attendance.mark') &&
    (day === today || (day < today && can('attendance.edit_past')));

  const pick = async (s: SettableStatus | 'clear') => {
    if (!me) return;
    setBusy(true);
    setError(null);
    const r = await writeAttendance(supabase, {
      shopId: me.shopId,
      cells: [{ staffId, date: day }],
      status: s,
      today,
      permissions: me.permissions,
    });
    setBusy(false);
    if (!r.ok) return setError(attendanceError(r));
    setOpen(false);
    await load();
    onChanged();
  };

  const counts = row
    ? (
        [
          ['present', row.cells.filter((x) => x.status === 'present').length],
          ['late', row.lateDays],
          ['half_day', row.cells.filter((x) => x.status === 'half_day').length],
          ['absent', row.cells.filter((x) => x.status === 'absent').length],
          ['paid_leave', row.cells.filter((x) => x.status === 'paid_leave').length],
          ['unpaid_leave', row.cells.filter((x) => x.status === 'unpaid_leave').length],
          ['weekly_off', row.cells.filter((x) => x.status === 'weekly_off').length],
          ['holiday', row.cells.filter((x) => x.status === 'holiday').length],
          ['unmarked', row.cells.filter((x) => x.status === 'unmarked').length],
        ] as const
      ).filter(([, n]) => n > 0)
    : [];

  return (
    <View style={{ gap: space['space-4'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          label={t('attendance.prevMonth')}
          onPress={() => shift(-1)}
          icon={<ChevronLeft size={22} color={c.ink} />}
        />
        <Text variant="title-md">{`${months[ym.month - 1]} ${ym.year}`}</Text>
        <IconButton
          label={t('attendance.nextMonth')}
          disabled={!hasNext}
          onPress={() => shift(1)}
          icon={<ChevronRight size={22} color={c.ink} />}
        />
      </View>

      {row === null && (
        <Text muted>
          {t('staffDetail.attendance.notEmployed', { month: `${months[ym.month - 1]} ${ym.year}` })}
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
                const x = row.cells.find((cc) => cc.date === d)!;
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
                        backgroundColor: tok?.bg ? c[tok.bg] : 'transparent',
                        borderWidth: selected ? 2 : x.status === 'unmarked' ? 1.5 : future ? 1 : 0,
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

          {cell && (
            <Card style={{ padding: space['space-4'], gap: space['space-2'] }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text variant="title-md">{`${short[weekday(day)]} ${formatDisplayDate(day)}`}</Text>
                {editable && (
                  <Button
                    label={t('mobile.staff.change')}
                    variant="quiet"
                    onPress={() => setOpen(true)}
                  />
                )}
              </View>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
              >
                <StatusPill status={cell.status as StatusKey} />
                {cell.late && (
                  <Text variant="micro" color={c['status-late']}>
                    {t('mobile.today.lateMin', { minutes: cell.lateMinutes ?? 0 })}
                  </Text>
                )}
              </View>
              {(cell.checkIn !== undefined || cell.checkOut !== undefined) && (
                <Text variant="money-sm">
                  {t('mobile.staff.times', {
                    in: cell.checkIn !== undefined ? formatTimeOfDay(cell.checkIn) : '—',
                    out: cell.checkOut !== undefined ? formatTimeOfDay(cell.checkOut) : '—',
                  })}
                </Text>
              )}
              {!cell.marked && cell.status !== 'unmarked' && (
                <Text variant="caption" muted>
                  {t('mobile.staff.fromRules')}
                </Text>
              )}
            </Card>
          )}

          <View style={{ gap: space['space-2'] }}>
            <Text variant="label-sm">{t('mobile.staff.payable', { days: row.payableDays })}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {counts.map(([s, n]) => (
                <StatusPill key={s} status={s} label={`${n} ${status[s]}`} />
              ))}
            </View>
          </View>
        </>
      )}

      <StatusSheet
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        dateLabel={`${short[weekday(day)]} ${formatDisplayDate(day)}`}
        current={cell?.status ?? null}
        marked={!!cell?.marked}
        busy={busy}
        error={error}
        onPick={pick}
      />
    </View>
  );
}
