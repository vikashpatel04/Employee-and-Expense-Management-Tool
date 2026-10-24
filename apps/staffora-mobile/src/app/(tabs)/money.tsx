import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpRight, ChevronRight, CircleCheck, Hourglass, Receipt } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@fincrew/core';
import {
  loadLedger,
  loadMyPayslips,
  loadStaffOverview,
  type LedgerEntry,
  type StaffOverview,
} from '@fincrew/data';
import { Button, Card, Segmented, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type Tab = 'ledger' | 'payslips';
type Payslips = Awaited<ReturnType<typeof loadMyPayslips>>;

/**
 * Money (design: "Money · ledger / payslips", PLAN §6.3): what the shop owes me (or I owe), the
 * advance to repay and its cut, then my ledger by month or my payslips; "Ask for an advance".
 * Same shared loaders as FinCrew's staff detail; RLS returns only my rows.
 */
export default function Money() {
  const { profile } = useAuth();
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('ledger');
  const [info, setInfo] = useState<StaffOverview | null>(null);
  const [lines, setLines] = useState<LedgerEntry[] | null>(null);
  const [slips, setSlips] = useState<Payslips | null>(null);
  const [loading, setLoading] = useState(false);
  const m = 'staffora.money';

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [o, l, p] = await Promise.all([
      loadStaffOverview(supabase, profile.shopId, profile.personId, true),
      loadLedger(supabase, profile.personId),
      loadMyPayslips(supabase, profile.personId),
    ]);
    setInfo(o);
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
  const balance = info?.balance ?? 0;
  const tone = balance > 0 ? c['money-owed'] : balance < 0 ? c['money-advance'] : c['ink-muted'];
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

        {info && (
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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArrowUpRight size={20} color={c['money-advance']} />
                <Text variant="label-sm" color={c['money-advance']}>
                  {t(`${m}.advance`)}
                </Text>
              </View>
              <Text variant="money-md" color={c['money-advance']}>
                {formatINR(info.advance ?? 0)}
              </Text>
            </View>
            {(info.advance ?? 0) > 0 && (
              <Text muted>
                {info.advanceCut != null
                  ? t(`${m}.cut`, {
                      amount: formatINR(Math.min(info.advanceCut, info.advance ?? 0)),
                    })
                  : t(`${m}.cutAtRun`)}
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
