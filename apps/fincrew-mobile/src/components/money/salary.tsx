import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { businessDateOf, formatINR, monthOf } from '@fincrew/core';
import { loadSalaryRun } from '@fincrew/data';
import { Card, SectionTitle, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { monthLabel, shiftMonth, ym } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Overall = 'none' | 'draft' | 'finalized' | 'paid';
type MonthRow = {
  year: number;
  month: number;
  overall: Overall;
  count: number;
  net: number;
  due: number;
};

/** How many months the list shows (this one and the ones before). */
const MONTHS = 4;

/** State pill colours (design: Draft amber, Paid green, the rest neutral). */
export function useStatePill() {
  const { c } = useTheme();
  return (s: Overall) =>
    s === 'paid'
      ? { bg: c['status-present-soft'], fg: c['money-paid'] }
      : s === 'draft'
        ? { bg: c['status-late-soft'], fg: c.ink }
        : s === 'finalized'
          ? { bg: c['accent-soft'], fg: c['accent-ink'] }
          : { bg: c['surface-muted'], fg: c['ink-muted'] };
}

/**
 * Money · Salary (design: "Money · salary"): the last few months with their run state; open one
 * to work out, check, finalize and pay (`/salary/<YYYY-MM>`).
 */
export function SalarySection() {
  const { me } = useSession();
  const { c } = useTheme();
  const pill = useStatePill();
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const current = monthOf(businessDateOf(new Date()));
    const months = Array.from({ length: MONTHS }, (_, i) =>
      shiftMonth(current.year, current.month, -i),
    );
    setRows(
      await Promise.all(
        months.map(async ({ year, month }) => {
          const run = await loadSalaryRun(supabase, me.shopId, year, month);
          return {
            year,
            month,
            overall: run.overall,
            count: run.people.length,
            net: run.people.reduce((a, p) => a + p.net, 0),
            due: run.people.reduce((a, p) => a + Math.max(0, p.net - p.paidAmount), 0),
          };
        }),
      ),
    );
    setLoading(false);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView
      contentContainerStyle={{
        padding: space['space-4'],
        paddingTop: space['space-2'],
        gap: space['space-2'],
      }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <SectionTitle title={t('mobile.money.salary.byMonth')} />
      <Card>
        {(rows ?? []).map((r) => {
          const p = pill(r.overall);
          const name = monthLabel(r.year, r.month);
          const meta =
            r.overall === 'none'
              ? null
              : r.overall === 'finalized'
                ? t('mobile.money.salary.metaDue', { count: r.count, due: formatINR(r.due) })
                : t(`mobile.money.salary.meta.${r.overall}`, { count: r.count });
          return (
            <Pressable
              key={ym(r.year, r.month)}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${t(`salary.status.${r.overall}`)}`}
              onPress={() =>
                router.push({ pathname: '/salary/[month]', params: { month: ym(r.year, r.month) } })
              }
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space['space-3'],
                minHeight: 72,
                paddingLeft: space['space-4'],
                paddingRight: space['space-2'],
                paddingVertical: space['space-2'],
                borderBottomWidth: 1,
                borderBottomColor: c.line,
                backgroundColor: pressed ? c['surface-muted'] : 'transparent',
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label">{name}</Text>
                {meta && (
                  <Text variant="caption" muted>
                    {meta}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {r.overall !== 'none' && <Text variant="money-md">{formatINR(r.net)}</Text>}
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radius['radius-pill'],
                    backgroundColor: p.bg,
                  }}
                >
                  <Text variant="caption" color={p.fg}>
                    {t(`salary.status.${r.overall}`)}
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={c['ink-muted']} />
            </Pressable>
          );
        })}
      </Card>
      <Text variant="caption" muted style={{ paddingHorizontal: space['space-1'] }}>
        {t('mobile.money.salary.hint')}
      </Text>
    </ScrollView>
  );
}
