import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpRight, ChevronRight, CircleCheck, Hourglass, Receipt } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR } from '@fincrew/core';
import { loadLedger, loadMyMoney, loadMyPayslips, type LedgerEntry } from '@fincrew/data';
import { Button, Card, Segmented, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Tab = 'ledger' | 'payslips';
type Payslips = Awaited<ReturnType<typeof loadMyPayslips>>;
type Money = NonNullable<Awaited<ReturnType<typeof loadMyMoney>>>;

/**
 * Money (design: "Money · ledger / payslips", PLAN §6.3): where my money stands now (owner
 * 30/10/2026: salary so far − advance ± expenses, `loadMyMoney`): each month not finalized yet
 * with its salary so far and a "Not finalized yet" tag, finalized salary not paid yet, the
 * advance to repay and its cut, expenses to get back or charged; once paid it shows 0 (plus the
 * new month so far). Then my ledger by month or my payslips; "Ask for an advance". Same shared
 * loaders as FinCrew; RLS returns only my rows.
 */
export default function Money() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('ledger');
  const [money, setMoney] = useState<Money | null>(null);
  const [lines, setLines] = useState<LedgerEntry[] | null>(null);
  const [slips, setSlips] = useState<Payslips | null>(null);
  const [loading, setLoading] = useState(false);
  const m = 'staffora.money';

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [o, l, p] = await Promise.all([
      loadMyMoney(supabase, profile.shopId, profile.personId, businessDateOf(new Date())),
      loadLedger(supabase, profile.personId),
      loadMyPayslips(supabase, profile.personId),
    ]);
    setMoney(o);
    setLines(l);
    setSlips(p);
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const monthName = (y: number, mo: number) => `${months[mo - 1]} ${y}`;
  const info = money?.overview;
  const now = money?.now;
  const balance = now?.total ?? 0;
  const tone = balance > 0 ? c['money-owed'] : balance < 0 ? c['money-advance'] : c['ink-muted'];
  const rowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['space-3'],
    paddingVertical: 4,
  } as const;
  const newest = [...(lines ?? [])].reverse();
  const byMonth = new Map<string, LedgerEntry[]>();
  for (const l of newest)
    byMonth.set(l.date.slice(0, 7), [...(byMonth.get(l.date.slice(0, 7)) ?? []), l]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space['space-4'], gap: space['space-4'] }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={{ gap: 2, paddingTop: space['space-2'] }}>
          <Text variant="title-xl">{t('staffora.tabs.money')}</Text>
          <Text muted>{t(`${m}.subtitle`, { shop: profile?.shopName ?? '' })}</Text>
        </View>

        {info && now && money && (
          <Card style={{ padding: space['space-5'], gap: space['space-2'] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Hourglass size={20} color={tone} />
              <Text variant="label-sm" color={tone}>
                {balance > 0 ? t(`${m}.due`) : balance < 0 ? t(`${m}.owe`) : t(`${m}.settled`)}
              </Text>
            </View>
            <Text variant="money-hero">{formatINR(Math.abs(balance))}</Text>
            <View
              style={{ height: 1, backgroundColor: c.line, marginVertical: space['space-2'] }}
            />
            {money.months.map((x) => (
              <View key={`${x.year}-${x.month}`} style={{ gap: 2 }}>
                <View style={rowStyle}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label-sm">
                      {t(`${m}.soFar`, { month: monthName(x.year, x.month) })}
                    </Text>
                    <Text variant="caption" muted>
                      {t(`${m}.soFarDays`, { payable: x.payableDays, employed: x.employedDays })}
                    </Text>
                  </View>
                  <Text variant="money-md" color={c['money-owed']}>
                    {formatINR(x.amount)}
                  </Text>
                </View>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 2,
                    borderRadius: radius['radius-pill'],
                    backgroundColor: c['status-late-soft'],
                  }}
                >
                  <Text variant="caption">{t(`${m}.notFinalized`)}</Text>
                </View>
              </View>
            ))}
            {now.finalizedDue !== 0 && (
              <View style={rowStyle}>
                <Text variant="label-sm" style={{ flex: 1 }}>
                  {now.finalizedDue > 0 ? t(`${m}.finalizedDue`) : t(`${m}.other`)}
                </Text>
                <Text
                  variant="money-md"
                  color={now.finalizedDue > 0 ? c['money-owed'] : c['money-deduction']}
                >
                  {now.finalizedDue < 0 ? '−' : ''}
                  {formatINR(Math.abs(now.finalizedDue))}
                </Text>
              </View>
            )}
            <View style={rowStyle}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <ArrowUpRight size={20} color={c['money-advance']} />
                <Text variant="label-sm" color={c['money-advance']}>
                  {t(`${m}.advance`)}
                </Text>
              </View>
              <Text variant="money-md" color={c['money-advance']}>
                {now.advance > 0 ? '−' : ''}
                {formatINR(now.advance)}
              </Text>
            </View>
            {now.advance > 0 && (
              <Text muted>
                {info.advanceMode === 'none'
                  ? t(`${m}.cutAtRun`)
                  : t(`${m}.cut`, {
                      amount: formatINR(
                        info.advanceMode === 'all'
                          ? now.advance
                          : Math.min(info.advanceCut ?? 0, now.advance),
                      ),
                    })}
              </Text>
            )}
            {now.expenseOwed > 0 && (
              <View style={rowStyle}>
                <Text variant="label-sm" style={{ flex: 1 }}>
                  {t(`${m}.expenseOwed`)}
                </Text>
                <Text variant="money-md" color={c['money-owed']}>
                  {formatINR(now.expenseOwed)}
                </Text>
              </View>
            )}
            {now.expenseCharged > 0 && (
              <View style={rowStyle}>
                <Text variant="label-sm" style={{ flex: 1 }}>
                  {t(`${m}.expenseCharged`)}
                </Text>
                <Text variant="money-md" color={c['money-deduction']}>
                  −{formatINR(now.expenseCharged)}
                </Text>
              </View>
            )}
            {money.months.length > 0 && (
              <Text variant="caption" muted>
                {t(`${m}.changes`)}
              </Text>
            )}
          </Card>
        )}

        <Segmented
          label={t(`${m}.tabsLabel`)}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ledger', label: t(`${m}.ledger`) },
            { value: 'payslips', label: t(`${m}.payslips`) },
          ]}
        />

        {tab === 'ledger' && lines && lines.length === 0 && <Text muted>{t(`${m}.noLines`)}</Text>}
        {tab === 'ledger' &&
          [...byMonth.entries()].map(([ym, rows]) => (
            <View key={ym} style={{ gap: space['space-2'] }}>
              <Text variant="title-md">
                {monthName(Number(ym.slice(0, 4)), Number(ym.slice(5)))}
              </Text>
              <Card>
                {rows.map((l, i) => (
                  <View
                    key={l.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space['space-3'],
                      paddingHorizontal: space['space-4'],
                      paddingVertical: space['space-3'],
                      borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                      borderBottomColor: c.line,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label-sm">
                        {t(`ledgerTypes.${l.type}`)}
                        {l.name ? ` · ${l.name}` : ''}
                      </Text>
                      <Text variant="caption" muted>
                        {formatDisplayDate(l.date)}
                        {l.mode ? ` · ${l.mode.toUpperCase()}` : ''}
                        {l.note ? ` · ${l.note}` : ''}
                        {l.undone ? ` · ${t('advances.undone')}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="money-sm" color={l.amount > 0 ? c['money-owed'] : c.ink}>
                        {l.amount > 0 ? '+' : ''}
                        {formatINR(l.amount)}
                      </Text>
                      <Text variant="caption" muted>
                        {t('staffDetail.ledger.runningBalance', { amount: formatINR(l.balance) })}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ))}

        {tab === 'payslips' && slips && slips.length === 0 && (
          <Text muted>{t(`${m}.noPayslips`)}</Text>
        )}
        {tab === 'payslips' && slips && slips.length > 0 && (
          <Card>
            {slips.map((s, i) => {
              const left = s.net - s.paid;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${monthName(s.year, s.month)}, ${formatINR(s.net)}`}
                  onPress={() => router.push({ pathname: '/payslip/[id]', params: { id: s.id } })}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space['space-3'],
                    minHeight: 72,
                    paddingLeft: space['space-4'],
                    paddingRight: space['space-2'],
                    borderBottomWidth: i < slips.length - 1 ? 1 : 0,
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
                      backgroundColor: c['surface-muted'],
                    }}
                  >
                    <Receipt size={20} color={c['ink-muted']} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{monthName(s.year, s.month)}</Text>
                    <Text variant="caption" muted>
                      {t(`${m}.netPay`)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="money-md">{formatINR(s.net)}</Text>
                    {left <= 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <CircleCheck size={14} color={c['money-paid']} />
                        <Text variant="caption" color={c['money-paid']}>
                          {t(`${m}.paid`)}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Hourglass size={14} color={c['money-owed']} />
                        <Text variant="caption" color={c['money-owed']}>
                          {t(`${m}.leftDue`, { amount: formatINR(left) })}
                        </Text>
                      </View>
                    )}
                  </View>
                  <ChevronRight size={20} color={c['ink-muted']} />
                </Pressable>
              );
            })}
          </Card>
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
          label={t('staffora.ask.advanceTitle')}
          icon={ArrowUpRight}
          block
          onPress={() => router.push({ pathname: '/ask', params: { kind: 'advance' } })}
        />
      </View>
    </SafeAreaView>
  );
}
