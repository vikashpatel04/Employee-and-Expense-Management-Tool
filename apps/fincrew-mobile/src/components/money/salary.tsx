import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR } from '@fincrew/core';
import {
  dayOfMonthText,
  daysLeft,
  leftToPay,
  loadSalaryPeople,
  type SalaryPersonRow,
} from '@fincrew/data';
import { Avatar, Card, SectionTitle, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Data = Awaited<ReturnType<typeof loadSalaryPeople>>;
const s = 'salaryPeople';

/**
 * Money · Salary by person (owner 13/11/2026; design "App · salary by person"): each person is on
 * their own pay day, so no months. What's to pay now and running so far, then the people who need
 * something and everyone else running; open someone for their salary (`/salary/<staff id>`).
 */
export function SalarySection() {
  const { me } = useSession();
  const { c } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const today = businessDateOf(new Date());

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setData(await loadSalaryPeople(supabase, me.shopId, today));
    setLoading(false);
  }, [me, today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const row = (p: SalaryPersonRow) => {
    const first = p.needs[0];
    const shown = first ?? p.current!;
    const stage = first ? first.stage : 'running';
    const amount = first ? p.needs.reduce((a, n) => a + leftToPay(n), 0) : leftToPay(p.current!);
    const line = first
      ? t(`${s}.${first.stage === 'finalize' ? 'rowFinalize' : 'rowPay'}`, {
          from: formatDisplayDate(first.period.from),
          to: formatDisplayDate(first.period.to),
        })
      : t(`${s}.rowRunning`, {
          from: formatDisplayDate(shown.period.from),
          to: formatDisplayDate(shown.period.to),
          payDate: formatDisplayDate(shown.period.payDate),
          count: daysLeft(shown, today),
        });
    return (
      <Pressable
        key={p.staffId}
        accessibilityRole="button"
        accessibilityLabel={t(`${s}.open`, { name: p.name })}
        onPress={() => router.push({ pathname: '/salary/[id]', params: { id: p.staffId } })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['space-3'],
          minHeight: 72,
          paddingLeft: space['space-3'],
          paddingRight: space['space-2'],
          paddingVertical: space['space-2'],
          borderBottomWidth: 1,
          borderBottomColor: c.line,
          backgroundColor: pressed ? c['surface-muted'] : 'transparent',
        })}
      >
        <Avatar name={p.name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>
            {p.name}
          </Text>
          <Text variant="caption" muted numberOfLines={2}>
            {t(`${s}.payDay`, { day: dayOfMonthText(p.payDay, t) })} · {line}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text variant="money-md">{formatINR(amount)}</Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 1,
              borderRadius: radius['radius-pill'],
              backgroundColor: stage === 'running' ? c['surface-muted'] : c['status-late-soft'],
            }}
          >
            <Text variant="caption" color={stage === 'running' ? c['ink-muted'] : c['status-late']}>
              {t(`${s}.badge.${stage}`)}
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={c['ink-muted']} />
      </Pressable>
    );
  };

  const needs = data?.people.filter((p) => p.needs.length > 0) ?? [];
  const running = data?.people.filter((p) => p.needs.length === 0) ?? [];

  return (
    <ScrollView
      contentContainerStyle={{
        padding: space['space-4'],
        paddingTop: space['space-2'],
        gap: space['space-3'],
      }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {data && data.people.length === 0 && <Text muted>{t(`${s}.empty`)}</Text>}
      {data && data.people.length > 0 && (
        <View
          style={{
            gap: 2,
            padding: space['space-4'],
            borderRadius: radius['radius-lg'],
            backgroundColor: c['accent-soft'],
          }}
        >
          <Text variant="label-sm" color={c['accent-ink']}>
            {t(`${s}.toPay`)} · {t(`${s}.toPaySub`, { count: data.toPayPeople }).split(' · ')[0]}
          </Text>
          <Text variant="money-hero">{formatINR(data.toPay)}</Text>
          <Text variant="caption" muted>
            {t(`${s}.runningSoFar`)} {formatINR(data.runningSoFar)}
          </Text>
        </View>
      )}
      {needs.length > 0 && (
        <>
          <SectionTitle title={t(`${s}.needs`)} count={needs.length} />
          <Card>{needs.map(row)}</Card>
        </>
      )}
      {running.length > 0 && (
        <>
          <SectionTitle title={t(`${s}.running`)} count={running.length} />
          <Card>{running.map(row)}</Card>
        </>
      )}
    </ScrollView>
  );
}
