import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import {
  ArrowUpRight,
  Hourglass,
  IndianRupee,
  MessageCircle,
  Phone,
  Receipt,
} from 'lucide-react-native';
import { businessDateOf, formatINR, monthOf } from '@fincrew/core';
import {
  loadAttendanceMonth,
  loadPayslipsDue,
  paySalary,
  type GridRow,
  type StaffOverview,
} from '@fincrew/data';
import { AdvanceSheet } from '@/components/advance-sheet';
import { PayBackSheet } from '@/components/payback-sheet';
import { FormMessage } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Button, Card, Segmented, SummaryChip, Text } from '@/components/ui';
import { monthLabel } from '@/lib/money';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type Due = Awaited<ReturnType<typeof loadPayslipsDue>>;
const MODES = ['cash', 'upi', 'bank', 'card'] as const;

/**
 * Overview (design: Staff detail · Overview): balance, advance, quick actions (give advance,
 * call, WhatsApp), this month's days, and "Pay" for finalized salary still due. Giving and paying
 * go through `@fincrew/data` (recordAdvance / paySalary) like the Money tab.
 */
export function OverviewSection({
  info,
  onChanged,
}: {
  info: StaffOverview;
  onChanged: () => void;
}) {
  const { me, can } = useSession();
  const { c } = useTheme();
  const [row, setRow] = useState<GridRow | null>(null);
  const [due, setDue] = useState<Due>([]);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payBackOpen, setPayBackOpen] = useState(false);
  const [mode, setMode] = useState<string>('cash');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const today = businessDateOf(new Date());
  const { year, month } = monthOf(today);
  const canPay = can('salary.run');

  useEffect(() => {
    if (!me) return;
    void loadAttendanceMonth(supabase, me.shopId, year, month, today).then(({ rows }) =>
      setRow(rows.find((r) => r.staffId === info.id) ?? null),
    );
  }, [me, info.id, year, month, today]);

  useEffect(() => {
    if (canPay) void loadPayslipsDue(supabase, info.id).then(setDue);
  }, [canPay, info.id, info.balance]);

  const dueTotal = due.reduce((a, d) => a + d.due, 0);
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;

  /** Pay every month still due, oldest first. */
  const pay = async () => {
    if (!me) return;
    setBusy(true);
    setMessage(null);
    for (const d of due) {
      const r = await paySalary(supabase, {
        ...me,
        runId: d.runId,
        payslipId: d.payslipId,
        mode,
        today,
      });
      if (!r.ok) {
        setBusy(false);
        setPayOpen(false);
        setMessage({
          ok: false,
          text:
            r.reason === 'no_permission'
              ? t('salary.errors.noPermission')
              : t('salary.errors.failed', { reason: r.message }),
        });
        onChanged();
        return;
      }
    }
    setBusy(false);
    setPayOpen(false);
    setMessage({ ok: true, text: t('mobile.staff.paid', { amount: formatINR(dueTotal) }) });
    onChanged();
  };

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
            {info.advanceMode === 'all'
              ? t('staffDetail.advance.cutAll')
              : info.advanceMode === 'fixed'
                ? t('staffDetail.advance.cut', { amount: formatINR(info.advanceCut ?? 0) })
                : t('staffDetail.advance.noCut')}
            {' · '}
            {info.advanceLimit != null
              ? t('staffDetail.advance.limit', { amount: formatINR(info.advanceLimit) })
              : t('staffDetail.advance.noLimit')}
          </Text>
          {(info.expenseOwed ?? 0) > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: space['space-2'],
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Receipt size={20} color={c['money-owed']} />
                <Text variant="label-sm" color={c['money-owed']}>
                  {t('payBack.owed')}
                </Text>
              </View>
              <Text variant="money-md">{formatINR(info.expenseOwed ?? 0)}</Text>
            </View>
          )}
        </Card>
      )}
      {balance == null && <Text muted>{t('mobile.staff.noMoney')}</Text>}

      {message && <FormMessage ok={message.ok} text={message.text} />}

      {canPay && dueTotal > 0 && (
        <Button
          label={t('mobile.staff.pay', { amount: formatINR(dueTotal) })}
          icon={IndianRupee}
          block
          onPress={() => setPayOpen(true)}
        />
      )}

      {canPay && (info.expenseOwed ?? 0) > 0 && (
        <Button
          label={t('payBack.button')}
          variant="secondary"
          icon={Receipt}
          block
          onPress={() => setPayBackOpen(true)}
        />
      )}

      {can('advances.give') && info.status === 'active' && (
        <Button
          label={t('advances.give')}
          variant="secondary"
          icon={ArrowUpRight}
          block
          onPress={() => setAdvanceOpen(true)}
        />
      )}

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
      <AdvanceSheet
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        person={{
          staffId: info.id,
          name: info.name,
          outstanding: info.advance ?? undefined,
          limit: info.advanceLimit,
        }}
        onSaved={(text) => {
          setMessage({ ok: true, text });
          onChanged();
        }}
      />

      <PayBackSheet
        open={payBackOpen}
        onClose={() => setPayBackOpen(false)}
        staffId={info.id}
        name={info.name}
        owed={info.expenseOwed ?? 0}
        amount={info.expenseOwed ?? 0}
        onSaved={(text) => {
          setMessage({ ok: true, text });
          onChanged();
        }}
      />

      <Sheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('mobile.money.salary.payTitle', { name: info.name })}
        subtitle={due.map((d) => `${monthLabel(d.year, d.month)} · ${formatINR(d.due)}`).join('\n')}
      >
        <Text variant="label-sm">{t('salary.payMode')}</Text>
        <Segmented
          label={t('salary.payMode')}
          value={mode}
          onChange={setMode}
          options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
        />
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-4'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setPayOpen(false)}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={t('mobile.staff.pay', { amount: formatINR(dueTotal) })}
              icon={IndianRupee}
              busy={busy}
              block
              onPress={pay}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
