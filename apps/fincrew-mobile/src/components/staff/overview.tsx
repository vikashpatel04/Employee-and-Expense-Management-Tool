import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { ArrowUpRight, Hourglass, MessageCircle, Phone } from 'lucide-react-native';
import { businessDateOf, formatINR, monthOf } from '@fincrew/core';
import { loadAttendanceMonth, type GridRow, type StaffOverview } from '@fincrew/data';
import { Button, Card, SummaryChip, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

/** Overview (design: Staff detail · Overview): balance, advance, call/WhatsApp, this month's days. */
export function OverviewSection({ info }: { info: StaffOverview }) {
  const { me } = useSession();
  const { c } = useTheme();
  const [row, setRow] = useState<GridRow | null>(null);
  const today = businessDateOf(new Date());
  const { year, month } = monthOf(today);

  useEffect(() => {
    if (!me) return;
    void loadAttendanceMonth(supabase, me.shopId, year, month, today).then(({ rows }) =>
      setRow(rows.find((r) => r.staffId === info.id) ?? null),
    );
  }, [me, info.id, year, month, today]);

  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const digits = (info.phone ?? '').replace(/\D/g, '');
  const wa = digits.length === 10 ? `91${digits}` : digits;
  const count = (s: string) => row?.cells.filter((x) => x.status === s).length ?? 0;
  const balance = info.balance;
  const tone =
    balance == null || balance === 0
      ? c['ink-muted']
      : balance > 0
        ? c['money-owed']
        : c['money-advance'];

  return (
    <View style={{ gap: space['space-4'] }}>
      {balance != null && (
        <Card style={{ padding: space['space-5'], gap: space['space-2'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Hourglass size={20} color={tone} />
            <Text variant="label-sm" color={tone}>
              {balance > 0
                ? t('staffDetail.balance.due', { name: info.name })
                : balance < 0
                  ? t('staffDetail.balance.owes', { name: info.name })
                  : t('staffDetail.balance.settled')}
            </Text>
          </View>
          <Text variant="money-hero">{formatINR(Math.abs(balance))}</Text>
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: space['space-2'] }} />
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ArrowUpRight size={20} color={c['money-advance']} />
              <Text variant="label-sm" color={c['money-advance']}>
                {t('staffDetail.advance.title')}
              </Text>
            </View>
            <Text variant="money-md">{formatINR(info.advance ?? 0)}</Text>
          </View>
          <Text variant="caption" muted>
            {info.advanceCut != null
              ? t('staffDetail.advance.cut', { amount: formatINR(info.advanceCut) })
              : t('staffDetail.advance.noCut')}
            {' · '}
            {info.advanceLimit != null
              ? t('staffDetail.advance.limit', { amount: formatINR(info.advanceLimit) })
              : t('staffDetail.advance.noLimit')}
          </Text>
        </Card>
      )}
      {balance == null && <Text muted>{t('mobile.staff.noMoney')}</Text>}

      {info.phone && (
        <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('staffDetail.actions.call')}
              variant="secondary"
              icon={Phone}
              block
              onPress={() => void Linking.openURL(`tel:${digits}`)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('staffDetail.actions.whatsapp')}
              variant="secondary"
              icon={MessageCircle}
              block
              onPress={() => void Linking.openURL(`https://wa.me/${wa}`)}
            />
          </View>
        </View>
      )}

      {row && (
        <View style={{ gap: space['space-2'] }}>
          <Text variant="title-md">
            {t('mobile.staff.monthSoFar', { month: `${months[month - 1]} ${year}` })}
          </Text>
          <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
            <SummaryChip status="present" count={count('present')} />
            <SummaryChip status="late" count={row.lateDays} />
            <SummaryChip status="paid_leave" count={count('paid_leave')} />
            <SummaryChip status="half_day" count={count('half_day')} />
          </View>
          <Text variant="caption" muted>
            {t('mobile.staff.payable', { days: row.payableDays })}
          </Text>
        </View>
      )}
    </View>
  );
}
