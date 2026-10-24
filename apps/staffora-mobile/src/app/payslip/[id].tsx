import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import {
  formatDisplayDate,
  formatINR,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
} from '@fincrew/core';
import { loadPayslipView } from '@fincrew/data';
import { Card, IconButton, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type PayslipData = NonNullable<Awaited<ReturnType<typeof loadPayslipView>>>;
const MINUS = ['deduction', 'late_deduction', 'advance_cut'];

/**
 * One payslip (from Money → Payslips): the month, the days, each line, net pay, paid so far and
 * what's still due — the same numbers as the website's payslip page (`loadPayslipView`).
 */
export default function Payslip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [slip, setSlip] = useState<PayslipData | null | undefined>(undefined);

  useEffect(() => {
    void loadPayslipView(supabase, id).then(setSlip);
  }, [id]);

  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/money'));
  const row = (
    label: string,
    value: string,
    opts: { strong?: boolean; color?: string; key?: string } = {},
  ) => (
    <View
      key={opts.key ?? label}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: space['space-3'],
        paddingHorizontal: space['space-4'],
        paddingVertical: space['space-3'],
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <Text variant={opts.strong ? 'label' : 'body'} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant={opts.strong ? 'money-md' : 'money-sm'} color={opts.color}>
        {value}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('staffora.tabs.money')}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('staffora.tabs.money')}
        </Text>
      </View>
      {slip === null && (
        <Text muted style={{ padding: space['space-4'] }}>
          {t('staffora.money.notFound')}
        </Text>
      )}
      {slip && (
        <ScrollView contentContainerStyle={{ padding: space['space-4'], gap: space['space-4'] }}>
          <View style={{ gap: 2 }}>
            <Text muted>{slip.shopName}</Text>
            <Text variant="title-xl">{t('payslip.title')}</Text>
            <Text variant="title-md">{`${months[slip.month - 1]} ${slip.year}`}</Text>
            <Text variant="caption" muted>
              {`${formatDisplayDate(maxDate(monthStart(slip.year, slip.month), slip.joiningDate))} – ${formatDisplayDate(
                slip.leavingDate
                  ? minDate(monthEnd(slip.year, slip.month), slip.leavingDate)
                  : monthEnd(slip.year, slip.month),
              )} · ${t('salary.days.payable', { payable: slip.summary.payableDays, employed: slip.summary.employedDays })}`}
            </Text>
          </View>
          <Card>
            {slip.lines.map((l, i) =>
              row(
                t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: slip.summary.payableDays }),
                `${MINUS.includes(l.kind) ? '−' : ''}${formatINR(l.amount)}`,
                {
                  color: MINUS.includes(l.kind) ? c['money-deduction'] : undefined,
                  key: `line-${i}`,
                },
              ),
            )}
            {row(t('salary.lines.net'), formatINR(slip.net), { strong: true })}
            {row(t('staffora.money.paidSoFar'), formatINR(slip.paid), { color: c['money-paid'] })}
            {row(t('staffora.money.stillDue'), formatINR(Math.max(0, slip.net - slip.paid)), {
              strong: true,
              color: slip.net - slip.paid > 0 ? c['money-owed'] : undefined,
            })}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
