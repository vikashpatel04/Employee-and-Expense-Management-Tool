import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  addDays,
  businessDateOf,
  formatDisplayDate,
  formatTimeOfDay,
  monthOf,
  weekday,
} from '@fincrew/core';
import {
  loadAttendanceMonth,
  writeAttendance,
  type GridCell,
  type GridRow,
  type SettableStatus,
} from '@fincrew/data';
import type { StatusKey } from '@fincrew/ui';
import { ShopHeader } from '@/components/shop-header';
import { attendanceError, StatusSheet } from '@/components/status-sheet';
import {
  Avatar,
  Button,
  Card,
  IconButton,
  SectionTitle,
  StatusPill,
  SummaryChip,
  Text,
} from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type Person = { row: GridRow; cell: GridCell };
type Filter = 'present' | 'absent' | 'late' | 'unmarked' | null;

const todayIST = () => businessDateOf(new Date());

/**
 * Today (design: "Today", PLAN §6.1): pick a day, see who is present, absent, late or not
 * marked, tap a person to set their status, "Mark all present" for the rest. Days are worked
 * out by the same code as the website grid (`loadAttendanceMonth`), writes go through
 * `writeAttendance` (same date and paid-leave rules).
 */
export default function Today() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const [picked, setPicked] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const { year, month } = monthOf(date);
    const { rows } = await loadAttendanceMonth(supabase, me.shopId, year, month, today);
    setPeople(
      rows
        .map((row) => ({ row, cell: row.cells.find((x) => x.date === date)! }))
        .filter((p) => p.cell && p.cell.status !== 'not_employed' && p.cell.status !== 'future'),
    );
    setLoading(false);
  }, [me, date, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable =
    can('attendance.mark') && (date === today || (date < today && can('attendance.edit_past')));

  const save = async (
    cells: { staffId: string; date: string }[],
    status: SettableStatus | 'clear',
  ) => {
    if (!me) return;
    setBusy(true);
    setMessage(null);
    const r = await writeAttendance(supabase, {
      shopId: me.shopId,
      cells,
      status,
      today,
      permissions: me.permissions,
    });
    setBusy(false);
    if (r.ok) {
      setPicked(null);
      if (status === 'present' && cells.length > 1)
        setMessage({ ok: true, text: t('home.marked', { count: r.count }) });
      await load();
    } else {
      setMessage({ ok: false, text: attendanceError(r) });
    }
  };

  const groups = useMemo(() => {
    const list = people ?? [];
    const is = (p: Person, ...s: string[]) => s.includes(p.cell.status);
    return {
      counts: {
        present: list.filter((p) => is(p, 'present', 'half_day')).length,
        absent: list.filter((p) => is(p, 'absent')).length,
        late: list.filter((p) => p.cell.late).length,
        unmarked: list.filter((p) => is(p, 'unmarked')).length,
      },
      match: (p: Person) =>
        filter === 'present'
          ? is(p, 'present', 'half_day')
          : filter === 'absent'
            ? is(p, 'absent')
            : filter === 'late'
              ? p.cell.late
              : filter === 'unmarked'
                ? is(p, 'unmarked')
                : true,
      unmarked: list.filter((p) => is(p, 'unmarked')),
      marked: list.filter((p) => !is(p, 'unmarked')),
    };
  }, [people, filter]);

  if (!me)
    return (
      <SafeAreaView style={{ flex: 1, padding: space['space-4'] }}>
        <Text>{t('mobile.noShop')}</Text>
      </SafeAreaView>
    );

  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const label = (d: string) => `${days[weekday(d)]} ${formatDisplayDate(d)}`;
  const rowsFor = (list: Person[]) =>
    list.map((p) => (
      <StaffRow
        key={p.row.staffId}
        person={p}
        onPress={editable ? () => setPicked(p) : undefined}
      />
    ));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space['space-4'], gap: space['space-4'] }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <ShopHeader />
        <Text variant="title-xl">{t('mobile.today.title')}</Text>

        <Card style={{ flexDirection: 'row', alignItems: 'center', padding: space['space-1'] }}>
          <IconButton
            label={t('mobile.today.prevDay')}
            onPress={() => setDate(addDays(date, -1))}
            icon={<ChevronLeft size={22} color={c.ink} />}
          />
          <View style={{ flex: 1, alignItems: 'center' }} accessibilityLiveRegion="polite">
            <Text variant="label-sm">{label(date)}</Text>
            {date === today && (
              <Text variant="caption" muted>
                {t('mobile.today.isToday')}
              </Text>
            )}
          </View>
          <IconButton
            label={t('mobile.today.nextDay')}
            disabled={date >= today}
            onPress={() => setDate(addDays(date, 1))}
            icon={<ChevronRight size={22} color={c.ink} />}
          />
        </Card>

        <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
          {(['present', 'absent', 'late', 'unmarked'] as const).map((k) => (
            <SummaryChip
              key={k}
              status={k}
              count={groups.counts[k]}
              selected={filter === k}
              onPress={() => setFilter(filter === k ? null : k)}
            />
          ))}
        </View>

        {message && <Text color={message.ok ? c['status-present'] : c.danger}>{message.text}</Text>}
        {!editable && <Text muted>{t('mobile.today.readOnly')}</Text>}

        {people && people.length === 0 && <Text muted>{t('mobile.today.nobody')}</Text>}

        {filter ? (
          <View style={{ gap: space['space-2'] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <SectionTitle
                title={t(`home.today.chips.${filter}`)}
                count={(people ?? []).filter(groups.match).length}
              />
              <Pressable onPress={() => setFilter(null)} accessibilityRole="button">
                <Text variant="label-sm" color={c['accent-ink']}>
                  {t('mobile.today.showAll')}
                </Text>
              </Pressable>
            </View>
            <Card>{rowsFor((people ?? []).filter(groups.match))}</Card>
          </View>
        ) : (
          <>
            {groups.unmarked.length > 0 && (
              <View style={{ gap: space['space-2'] }}>
                <SectionTitle title={t('mobile.today.notMarked')} count={groups.unmarked.length} />
                <Card>{rowsFor(groups.unmarked)}</Card>
              </View>
            )}
            {groups.marked.length > 0 && (
              <View style={{ gap: space['space-2'] }}>
                <SectionTitle title={t('mobile.today.marked')} count={groups.marked.length} />
                <Card>{rowsFor(groups.marked)}</Card>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {editable && groups.unmarked.length > 0 && (
        <View
          style={{
            padding: space['space-4'],
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          <Button
            label={busy ? t('mobile.today.marking') : t('mobile.today.markAll')}
            icon={Check}
            busy={busy}
            block
            onPress={() =>
              save(
                groups.unmarked.map((p) => ({ staffId: p.row.staffId, date })),
                'present',
              )
            }
          />
        </View>
      )}

      <StatusSheet
        open={!!picked}
        onClose={() => setPicked(null)}
        name={picked?.row.name ?? ''}
        dateLabel={label(date)}
        current={picked?.cell.status ?? null}
        marked={!!picked?.cell.marked}
        busy={busy}
        error={message && !message.ok ? message.text : null}
        onPick={(s) => picked && save([{ staffId: picked.row.staffId, date }], s)}
      />
    </SafeAreaView>
  );
}

/** One person on Today (design system StaffRow): avatar, name, times, status, late badge. */
function StaffRow({ person, onPress }: { person: Person; onPress?: () => void }) {
  const { c } = useTheme();
  const { row, cell } = person;
  const offs = row.offWeekdays.length
    ? t('home.today.offs', {
        days: row.offWeekdays
          .map((w) => (t('weekdays.short', { returnObjects: true }) as unknown as string[])[w])
          .join(', '),
      })
    : '';
  const meta =
    cell.checkIn !== undefined
      ? t('mobile.today.checkIn', { time: formatTimeOfDay(cell.checkIn) })
      : offs;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${row.name}, ${t(`status.${cell.status}`)}${cell.late ? `, ${t('status.late')}` : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['space-3'],
        minHeight: 72,
        paddingHorizontal: space['space-4'],
        paddingVertical: space['space-2'],
        borderBottomWidth: 1,
        borderBottomColor: c.line,
        backgroundColor: pressed ? c['surface-muted'] : 'transparent',
      })}
    >
      <Avatar name={row.name} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" numberOfLines={1}>
          {row.name}
        </Text>
        {meta ? (
          <Text variant="caption" muted numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <StatusPill status={cell.status as StatusKey} />
        {cell.late && (
          <Text variant="micro" color={c['status-late']}>
            {t('mobile.today.lateMin', { minutes: cell.lateMinutes ?? 0 })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
