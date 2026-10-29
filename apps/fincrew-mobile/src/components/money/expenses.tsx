import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Camera, Plus } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR, monthOf, weekday } from '@fincrew/core';
import {
  dailySpending,
  expenseDay,
  expenseSummary,
  loadExpenseDues,
  loadExpenseMonth,
  type ExpenseRow,
} from '@fincrew/data';
import { BottomBar, DayStepper, FormMessage, MonthStepper } from '@/components/form';
import { PayBackSheet } from '@/components/payback-sheet';
import { Button, Card, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { categoryColour, categoryIcon, monthLabel, ym } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Month = Awaited<ReturnType<typeof loadExpenseMonth>>;
type Dues = Awaited<ReturnType<typeof loadExpenseDues>>;
type Period = 'day' | 'month';
type Show = 'list' | 'categories';
const NO_BILL = 'nobill';

/**
 * Money · Expenses (redesign, owner 29/10/2026; design "Money · expenses, today first"): the
 * period's spending as a big figure, "Needs you" (what the shop owes staff with Pay back, what is
 * charged to staff, expenses without a bill photo), then the expenses. **Day | Month** picks the
 * period, **List | By category** how it shows; a category (or the chips) filters the list. Add
 * expense is the big button at the bottom. Loaded by `loadExpenseMonth` like the website.
 */
export function ExpensesSection() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const current = monthOf(today);
  const [period, setPeriod] = useState<Period>('day');
  const [show, setShow] = useState<Show>('list');
  const [filter, setFilter] = useState('');
  const [day, setDay] = useState(today);
  const [picked, setMonth] = useState(current);
  const { year, month } = period === 'day' ? monthOf(day) : picked;
  const [data, setData] = useState<Month | null>(null);
  const [dues, setDues] = useState<Dues>([]);
  const [loading, setLoading] = useState(false);
  const [payBack, setPayBack] = useState<Dues[number] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const seeDues = can('expenses.view_all') || can('salary.run');

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const [m, d] = await Promise.all([
      loadExpenseMonth(supabase, me.shopId, year, month),
      seeDues ? loadExpenseDues(supabase, me.shopId) : Promise.resolve([]),
    ]);
    setData(m);
    setDues(d);
    setLoading(false);
  }, [me, year, month, seeDues]);

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
  const mName = monthLabel(year, month);
  const sum = data
    ? period === 'day'
      ? expenseDay(data.expenses, day)
      : expenseSummary(data.expenses)
    : null;
  const noBill = (e: ExpenseRow) => !e.bill_path && e.charged_to_kind !== 'not_tracked';
  const rows = !sum
    ? []
    : filter === NO_BILL
      ? sum.rows.filter(noBill)
      : filter
        ? sum.rows.filter((e) => e.category_id === filter)
        : sum.rows;
  const byDay = new Map<string, ExpenseRow[]>();
  for (const e of rows) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const owed = dues.filter((d) => d.payback > 0);
  const charged = dues.filter((d) => d.charge > 0);
  const isCurrent = year === current.year && month === current.month;
  const bars = data ? dailySpending(data.expenses, year, month) : [];
  const daysSoFar = isCurrent ? Number(today.slice(8, 10)) : bars.length;
  const topBar = Math.max(1, ...bars);
  const periodCats = [...new Set((sum?.rows ?? []).map((e) => e.category_id))]
    .map((id) => cats.get(id))
    .filter((x) => !!x);

  const meta = (e: ExpenseRow) => {
    const m = 'expenses.meta';
    const payer =
      e.paid_by_kind === 'staff'
        ? `${t(`${m}.staffPaid`, { name: names.get(e.paid_by_staff_id!) ?? '' })}${e.reimburse ? `, ${t(`${m}.paidBack`)}` : ''}`
        : t(`${m}.${e.paid_by_kind}`);
    const ch =
      e.charged_to_kind === 'staff'
        ? ` · ${t(`${m}.chargedTo`, { name: names.get(e.charged_to_staff_id!) ?? '' })}`
        : '';
    return `${payer} · ${modes[e.payment_mode] ?? e.payment_mode}${ch}`;
  };

  const choosePeriod = (p: Period) => {
    setPeriod(p);
    setFilter('');
  };
  const chip = (key: string, label: string) => {
    const on = filter === key;
    return (
      <Pressable
        key={key || 'all'}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => setFilter(key)}
        style={{
          minHeight: 40,
          justifyContent: 'center',
          paddingHorizontal: space['space-3'],
          borderRadius: radius['radius-pill'],
          borderWidth: 1,
          borderColor: on ? c.accent : c['line-strong'],
          backgroundColor: on ? c['accent-soft'] : c.surface,
        }}
      >
        <Text variant="label-sm" color={on ? c['accent-ink'] : c.ink}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const dayGroup = (date: string, list: ExpenseRow[]) => (
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
          {formatINR(list.reduce((a, e) => a + Number(e.amount_paise), 0))}
        </Text>
      </View>
      <Card>
        {list.map((e) => {
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

  const split = sum
    ? (
        [
          ['shop', sum.shop],
          ['staff', sum.chargedToStaff],
          ['notTracked', sum.notTracked],
        ] as const
      )
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${formatINR(v)} ${t(`expenses.split.${k}`)}`)
    : [];

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-3'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Segmented<Period>
          label={t('expenses.period.label')}
          value={period}
          onChange={choosePeriod}
          options={[
            { value: 'day', label: t('expenses.period.day') },
            { value: 'month', label: t('expenses.period.month') },
          ]}
        />
        {period === 'day' ? (
          <DayStepper
            value={day}
            onChange={(d) => {
              setDay(d);
              setFilter('');
            }}
            max={today}
          />
        ) : (
          <MonthStepper
            year={year}
            month={month}
            max={current}
            onChange={(m) => {
              setMonth(m);
              setFilter('');
            }}
          />
        )}
        {message && <FormMessage ok text={message} />}

        {data && sum && (
          <>
            <Card style={{ padding: space['space-5'], gap: 4, alignItems: 'center' }}>
              <Text variant="label-sm" muted>
                {period === 'month'
                  ? t('expenses.month.spent', { month: mName })
                  : day === today
                    ? t('expenses.day.today')
                    : t('expenses.day.on', { date: formatDisplayDate(day) })}
              </Text>
              <Text variant="money-hero" style={{ fontSize: 52, lineHeight: 60 }}>
                {formatINR(sum.spent)}
              </Text>
              <Text variant="caption" muted style={{ textAlign: 'center' }}>
                {[t('expenses.tiles.count', { count: sum.rows.length }), ...split].join(' · ')}
              </Text>
              {period === 'day' ? (
                <Text variant="caption" muted>
                  {t('expenses.day.monthSoFar', {
                    month: mName,
                    amount: formatINR(data.totals.total),
                  })}
                </Text>
              ) : (
                sum.spent > 0 && (
                  <>
                    <View
                      accessibilityLabel={t('expenses.month.bars')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        gap: 2,
                        height: 64,
                        alignSelf: 'stretch',
                        marginTop: space['space-2'],
                      }}
                    >
                      {bars.map((v, i) => (
                        <View
                          key={i}
                          style={{
                            flex: 1,
                            height: `${Math.max(2, Math.round((v / topBar) * 100))}%`,
                            borderTopLeftRadius: 2,
                            borderTopRightRadius: 2,
                            backgroundColor:
                              v === topBar
                                ? c.accent
                                : i >= daysSoFar
                                  ? c['surface-muted']
                                  : c['accent-soft'],
                          }}
                        />
                      ))}
                    </View>
                    <Text variant="caption" muted>
                      {t('expenses.month.perDay', {
                        amount: formatINR(Math.round(sum.spent / Math.max(1, daysSoFar))),
                      })}
                    </Text>
                  </>
                )
              )}
            </Card>

            {owed.length > 0 && (
              <Card
                style={{
                  padding: space['space-4'],
                  gap: space['space-2'],
                  backgroundColor: c['status-late-soft'],
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label">{t('expenses.needs.owed')}</Text>
                  <Text variant="money-sm">
                    {formatINR(owed.reduce((a, d) => a + d.payback, 0))}
                  </Text>
                </View>
                <Text variant="caption" muted>
                  {t('expenses.needs.owedBody')}
                </Text>
                {owed.map((d) => (
                  <View
                    key={d.staffId}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'] }}
                  >
                    <Text style={{ flex: 1 }} numberOfLines={1}>
                      {`${names.get(d.staffId) ?? ''} · ${formatINR(d.payback)}`}
                    </Text>
                    {can('salary.run') && (
                      <Button
                        label={t('payBack.button')}
                        variant="secondary"
                        onPress={() => setPayBack(d)}
                      />
                    )}
                  </View>
                ))}
              </Card>
            )}
            {charged.length > 0 && (
              <Card style={{ padding: space['space-4'], gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label">{t('expenses.needs.charged')}</Text>
                  <Text variant="money-sm" color={c['money-advance']}>
                    {formatINR(charged.reduce((a, d) => a + d.charge, 0))}
                  </Text>
                </View>
                <Text variant="caption" muted>
                  {`${charged
                    .map((d) => `${names.get(d.staffId) ?? ''} ${formatINR(d.charge)}`)
                    .join(' · ')}. ${t('expenses.needs.chargedBody')}`}
                </Text>
              </Card>
            )}
            {!can('expenses.view_all') && <Text muted>{t('expenses.ownOnly')}</Text>}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space['space-2'],
                paddingTop: space['space-1'],
              }}
            >
              <Text variant="title-md">
                {period === 'day'
                  ? day === today
                    ? t('expenses.day.today_link')
                    : formatDisplayDate(day)
                  : mName}
              </Text>
              <View style={{ width: 210 }}>
                <Segmented<Show>
                  label={t('expenses.show.label')}
                  value={show}
                  onChange={(v) => {
                    setShow(v);
                    setFilter('');
                  }}
                  options={[
                    { value: 'list', label: t('expenses.show.list') },
                    { value: 'categories', label: t('expenses.show.categories') },
                  ]}
                />
              </View>
            </View>

            {show === 'categories' ? (
              <Card style={{ padding: space['space-4'], gap: space['space-3'] }}>
                {sum.byCategory.length === 0 ? (
                  <Text muted>
                    {period === 'day'
                      ? t('expenses.day.empty', { date: formatDisplayDate(day) })
                      : t('expenses.empty', { month: mName })}
                  </Text>
                ) : (
                  sum.byCategory.map(({ categoryId, amount }) => {
                    const cat = cats.get(categoryId);
                    const Icon = categoryIcon(cat?.icon ?? 'receipt');
                    const col = categoryColour(cat?.colour ?? 'slate');
                    const share = sum.shop > 0 ? Math.round((amount / sum.shop) * 100) : 0;
                    return (
                      <Pressable
                        key={categoryId}
                        accessibilityRole="button"
                        accessibilityLabel={`${cat?.name ?? ''}, ${formatINR(amount)}`}
                        onPress={() => {
                          setShow('list');
                          setFilter(categoryId);
                        }}
                        style={{ gap: 6, minHeight: 48, justifyContent: 'center' }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: space['space-2'],
                          }}
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
                          <Text variant="caption" muted>
                            {`${share}%`}
                          </Text>
                          <Text variant="money-sm">{formatINR(amount)}</Text>
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
                              width: `${Math.round((amount / (sum.byCategory[0]?.amount || 1)) * 100)}%`,
                              backgroundColor: c[col.fg],
                            }}
                          />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </Card>
            ) : (
              <>
                {sum.rows.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: space['space-2'] }}
                  >
                    {chip('', t('expenses.chips.all'))}
                    {periodCats.map((x) => chip(x.id, x.name))}
                    {sum.noBill > 0 && chip(NO_BILL, t('expenses.chips.noBill'))}
                  </ScrollView>
                )}
                {rows.length === 0 ? (
                  <Text muted>
                    {period === 'day'
                      ? t('expenses.day.empty', { date: formatDisplayDate(day) })
                      : t('expenses.empty', { month: mName })}
                  </Text>
                ) : (
                  [...byDay.entries()].map(([date, list]) => dayGroup(date, list))
                )}
                {sum.noBill > 0 && !filter && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFilter(NO_BILL)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space['space-2'],
                      minHeight: 44,
                    }}
                  >
                    <Camera size={16} color={c['ink-muted']} />
                    <Text variant="caption" muted style={{ flex: 1 }}>
                      {t('expenses.needs.noBill', { count: sum.noBill })}
                    </Text>
                    <Text variant="label-sm" color={c['accent-ink']}>
                      {t('expenses.needs.show')}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </>
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
                    period === 'day'
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

      {payBack && (
        <PayBackSheet
          open
          onClose={() => setPayBack(null)}
          onSaved={(m) => {
            setMessage(m);
            void load();
          }}
          staffId={payBack.staffId}
          name={names.get(payBack.staffId) ?? ''}
          owed={payBack.payback}
          amount={payBack.payback}
        />
      )}
    </>
  );
}
