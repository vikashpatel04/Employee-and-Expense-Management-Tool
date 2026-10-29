import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Camera, Plus } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR, monthOf, weekday } from '@fincrew/core';
import { expenseDay, loadExpenseMonth, type ExpenseRow } from '@fincrew/data';
import { BottomBar, DayStepper, MonthStepper } from '@/components/form';
import { Button, Card, SectionTitle, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { categoryColour, categoryIcon, monthLabel, ym } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Month = Awaited<ReturnType<typeof loadExpenseMonth>>;
type View_ = 'day' | 'month' | 'categories';

/**
 * Money · Expenses (design: "Money · expenses"), loaded by `loadExpenseMonth` like the website.
 * Opens on **Day** (owner, 29/10/2026): the day's spending as a big figure and its expenses, with
 * ‹ › to go back through days. **Month**: the month's totals and every expense by day. **By
 * category**: the month's spend per category. Tap an expense to see or edit it.
 */
export function ExpensesSection() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const current = monthOf(today);
  const [view, setView] = useState<View_>('day');
  const [day, setDay] = useState(today);
  const [picked, setMonth] = useState(current);
  const { year, month } = view === 'day' ? monthOf(day) : picked;
  const [data, setData] = useState<Month | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setData(await loadExpenseMonth(supabase, me.shopId, year, month));
    setLoading(false);
  }, [me, year, month]);

  // Reload when coming back from adding or editing an expense.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const cats = new Map((data?.categories ?? []).map((x) => [x.id, x]));
  const names = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));
  const activeCats = (data?.categories ?? []).filter((x) => !x.archived);
  const meta = (e: ExpenseRow) => {
    const m = 'expenses.meta';
    const payer =
      e.paid_by_kind === 'staff'
        ? `${t(`${m}.staffPaid`, { name: names.get(e.paid_by_staff_id!) ?? '' })}${e.reimburse ? `, ${t(`${m}.paidBack`)}` : ''}`
        : t(`${m}.${e.paid_by_kind}`);
    const charged =
      e.charged_to_kind === 'staff'
        ? ` · ${t(`${m}.chargedTo`, { name: names.get(e.charged_to_staff_id!) ?? '' })}`
        : '';
    return `${payer} · ${modes[e.payment_mode] ?? e.payment_mode}${charged}`;
  };
  const byDay = new Map<string, ExpenseRow[]>();
  for (const e of data?.expenses ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const ranked = Object.entries(data?.totals.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 1;
  const mName = monthLabel(year, month);
  const spent = data ? expenseDay(data.expenses, day) : null;

  const dayGroup = (date: string, rows: ExpenseRow[]) => (
    <View key={date} style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: space['space-1'],
          paddingTop: space['space-2'],
        }}
      >
        <Text variant="caption" muted>
          {`${days[weekday(date)]} ${formatDisplayDate(date)}`}
        </Text>
        <Text variant="caption" muted>
          {formatINR(rows.reduce((a, e) => a + Number(e.amount_paise), 0))}
        </Text>
      </View>
      <Card>
        {rows.map((e) => {
          const cat = cats.get(e.category_id);
          const Icon = categoryIcon(cat?.icon ?? 'receipt');
          const col = categoryColour(cat?.colour ?? 'slate');
          const title = e.note || cat?.name || '';
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${formatINR(Number(e.amount_paise))}`}
              onPress={() => router.push({ pathname: '/expense', params: { id: e.id } })}
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
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c[col.soft],
                }}
              >
                <Icon size={20} color={c[col.fg]} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" muted numberOfLines={2}>
                  {e.note ? `${cat?.name ?? ''} · ` : ''}
                  {meta(e)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text
                  variant="money-md"
                  color={e.charged_to_kind === 'not_tracked' ? c['ink-muted'] : c.ink}
                >
                  {formatINR(Number(e.amount_paise))}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {e.bill_path && <Camera size={14} color={c['ink-muted']} />}
                  {e.charged_to_kind !== 'shop' && (
                    <Text
                      variant="micro"
                      color={e.charged_to_kind === 'staff' ? c['money-advance'] : c['ink-muted']}
                    >
                      {t(`expenses.tags.${e.charged_to_kind}`)}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-4'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Segmented<View_>
          label={t('expenses.views.label')}
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: t('expenses.views.day') },
            { value: 'month', label: t('expenses.views.list') },
            { value: 'categories', label: t('expenses.views.categories') },
          ]}
        />
        {view === 'day' ? (
          <DayStepper value={day} onChange={setDay} max={today} />
        ) : (
          <MonthStepper year={year} month={month} max={current} onChange={setMonth} />
        )}

        {data && view === 'day' && spent && (
          <>
            <Card style={{ padding: space['space-5'], gap: 4 }}>
              <Text variant="label-sm" muted>
                {day === today
                  ? t('expenses.day.today')
                  : t('expenses.day.on', { date: formatDisplayDate(day) })}
              </Text>
              <Text variant="money-hero" style={{ fontSize: 56, lineHeight: 64 }}>
                {formatINR(spent.spent)}
              </Text>
              <Text variant="caption" muted>
                {t('expenses.tiles.count', { count: spent.rows.length })}
                {spent.rows.length > 0 &&
                  ` · ${t('expenses.day.split', {
                    shop: formatINR(spent.shop),
                    staff: formatINR(spent.chargedToStaff),
                    notTracked: formatINR(spent.notTracked),
                  })}`}
              </Text>
              <Text variant="caption" muted>
                {t('expenses.day.monthSoFar', {
                  month: mName,
                  amount: formatINR(data.totals.total),
                })}
              </Text>
            </Card>
            {!can('expenses.view_all') && <Text muted>{t('expenses.ownOnly')}</Text>}
            {spent.rows.length === 0 ? (
              <Text muted>{t('expenses.day.empty', { date: formatDisplayDate(day) })}</Text>
            ) : (
              dayGroup(day, spent.rows)
            )}
          </>
        )}

        {data && view === 'month' && (
          <>
            <Card style={{ padding: space['space-5'], gap: 4 }}>
              <Text variant="label-sm" muted>
                {t('mobile.money.expenses.shopTotal', { month: mName })}
              </Text>
              <Text variant="money-hero">{formatINR(data.totals.total)}</Text>
              <View
                style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-3'] }}
              >
                {(
                  [
                    ['staff', data.totals.chargedToStaff, c['money-advance']],
                    ['reimbursed', data.totals.reimbursed, c['money-owed']],
                    ['notTracked', data.totals.notTracked, c.ink],
                  ] as const
                ).map(([k, v, color]) => (
                  <View key={k} style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" muted numberOfLines={2}>
                      {t(`expenses.tiles.${k}`)}
                    </Text>
                    <Text variant="money-sm" color={color}>
                      {formatINR(v)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
            {!can('expenses.view_all') && <Text muted>{t('expenses.ownOnly')}</Text>}
            <View style={{ gap: space['space-2'] }}>
              <SectionTitle title={t('expenses.list')} count={data.expenses.length} />
              {data.expenses.length === 0 ? (
                <Text muted>{t('expenses.empty', { month: mName })}</Text>
              ) : (
                [...byDay.entries()].map(([date, rows]) => dayGroup(date, rows))
              )}
            </View>
          </>
        )}

        {data && view === 'categories' && (
          <Card style={{ padding: space['space-4'], gap: space['space-3'] }}>
            <Text variant="title-md">{t('expenses.byCategory')}</Text>
            {ranked.length === 0 ? (
              <Text muted>{t('expenses.empty', { month: mName })}</Text>
            ) : (
              ranked.map(([id, v]) => {
                const cat = cats.get(id);
                const Icon = categoryIcon(cat?.icon ?? 'receipt');
                const col = categoryColour(cat?.colour ?? 'slate');
                return (
                  <View key={id} style={{ gap: 6 }}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'] }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: c[col.soft],
                        }}
                      >
                        <Icon size={16} color={c[col.fg]} />
                      </View>
                      <Text variant="label-sm" style={{ flex: 1 }} numberOfLines={1}>
                        {cat?.name ?? ''}
                      </Text>
                      <Text variant="money-sm">{formatINR(v)}</Text>
                    </View>
                    <View
                      style={{
                        height: 6,
                        borderRadius: radius['radius-pill'],
                        backgroundColor: c['surface-muted'],
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          height: 6,
                          width: `${Math.round((v / top) * 100)}%`,
                          backgroundColor: c[col.fg],
                        }}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        )}
      </ScrollView>

      {can('expenses.add') && data && (
        <BottomBar>
          {activeCats.length === 0 ? (
            <Text muted>
              {can('expenses.categories')
                ? t('mobile.money.expenses.noCategories')
                : t('expenses.noCategoriesAsk')}
            </Text>
          ) : (
            <Button
              label={t('expenses.add')}
              icon={Plus}
              block
              onPress={() =>
                router.push({
                  pathname: '/expense',
                  params:
                    view === 'day'
                      ? day === today
                        ? {}
                        : { date: day }
                      : ym(year, month) === ym(current.year, current.month)
                        ? {}
                        : { month: ym(year, month) },
                })
              }
            />
          )}
        </BottomBar>
      )}
    </>
  );
}
