import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft, IndianRupee, MessageCircle } from 'lucide-react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatINR,
  paiseToInput,
  parseDisplayDate,
  parseRupees,
  phoneKey,
  type PayslipLine,
} from '@fincrew/core';
import {
  addSalaryEntry,
  dayOfMonthText,
  daysLeft,
  finalizeSalary,
  leftToPay,
  loadMoneyNow,
  loadPersonSalary,
  PAYSLIP_MINUS_LINES,
  paySalary,
  removeSalaryEntry,
  type PersonSalary,
  type PersonSalaryView,
  type SalaryEntry,
  type SalaryWriteResult,
  type WeOwe,
} from '@fincrew/data';
import { AmountField, Checkbox, Field, FormMessage } from '@/components/form';
import { AddLess } from '@/components/money/add-less';
import { PayNow } from '@/components/money/pay-now';
import { Sheet } from '@/components/sheet';
import { Avatar, Button, Card, IconButton, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { sharePayslip } from '@/lib/share-payslip';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const s = 'salaryPeople';

/**
 * One person's salary (owner 13/11/2026; design "App · salary by person"): what needs doing first
 * (a salary that ended and isn't finalized: Finalize; one finalized and not fully paid: Pay), the
 * salary running now (Add or less, Pay now), and earlier salaries. Each salary by its own dates,
 * never by month. Every step goes through `@fincrew/data`, like the website.
 */
export default function PersonSalaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const canRun = can('salary.run');
  const [view, setView] = useState<PersonSalaryView | null | undefined>(undefined);
  const [owe, setOwe] = useState<WeOwe | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [finalizing, setFinalizing] = useState<PersonSalary | null>(null);
  const [paying, setPaying] = useState<PersonSalary | null>(null);
  const [payNow, setPayNow] = useState<PersonSalary | null>(null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [mode, setMode] = useState<string>('cash');
  const [sendWa, setSendWa] = useState(true);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;

  const load = useCallback(async () => {
    if (!me || !id) return;
    setLoading(true);
    const [v, o] = await Promise.all([
      loadPersonSalary(supabase, me.shopId, id, today),
      loadMoneyNow(supabase, me.shopId, id, today),
    ]);
    setView(v);
    setOwe(o);
    setLoading(false);
  }, [me, id, today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const errorText = (r: SalaryWriteResult) =>
    r.ok
      ? null
      : r.reason === 'no_permission'
        ? t('salary.errors.noPermission')
        : t('salary.errors.failed', { reason: r.message });

  const finalize = async (x: PersonSalary) => {
    if (!me || !id) return;
    setBusy(true);
    const r = await finalizeSalary(supabase, {
      ...me,
      year: x.year,
      month: x.month,
      staffIds: [id],
    });
    setBusy(false);
    setFinalizing(null);
    setMessage(
      r.ok
        ? { ok: true, text: t('salary.done.finalized', { count: 1 }) }
        : { ok: false, text: errorText(r)! },
    );
    await load();
  };

  const askPay = (x: PersonSalary) => {
    setAmount(paiseToInput(leftToPay(x)));
    setPaidOn(formatDisplayDate(today));
    setSendWa(true);
    setSheetError(null);
    setPaying(x);
  };
  const pay = async () => {
    if (!me || !paying?.runId) return;
    const left = leftToPay(paying);
    const date = parseDisplayDate(paidOn);
    if (!date) return setSheetError(t('salary.payNow.problems.date'));
    if (date > today)
      return setSheetError(t('salary.payNow.problems.future', { today: formatDisplayDate(today) }));
    const typed = parseRupees(amount);
    if (typed === null || typed <= 0 || typed > left)
      return setSheetError(t('mobile.money.salary.amountTooMuch', { amount: formatINR(left) }));
    setBusy(true);
    const r = await paySalary(supabase, {
      ...me,
      runId: paying.runId,
      payslipId: paying.id,
      mode,
      today,
      date,
      amount: typed < left ? typed : null,
    });
    setBusy(false);
    const slip = paying;
    setPaying(null);
    setMessage(
      r.ok
        ? { ok: true, text: t('salary.done.paid', { count: 1 }) }
        : { ok: false, text: errorText(r)! },
    );
    if (r.ok && sendWa) await send(slip.id);
    await load();
  };
  const send = async (payslipId: string) => {
    setSharing(payslipId);
    const ok = await sharePayslip(payslipId, view?.phone ?? null);
    setSharing(null);
    if (!ok) setMessage({ ok: false, text: t('mobile.money.salary.shareFailed') });
  };

  const addEntry =
    (x: PersonSalary) => async (kind: SalaryEntry['kind'], name: string, value: number) => {
      if (!me || !id) return null;
      const r = await addSalaryEntry(supabase, {
        ...me,
        staffId: id,
        year: x.year,
        month: x.month,
        kind,
        name,
        amount: value,
      });
      if (r.ok) await load();
      return errorText(r);
    };
  const removeEntry = async (entryId: string) => {
    if (!me) return null;
    const r = await removeSalaryEntry(supabase, { ...me, id: entryId });
    if (r.ok) await load();
    return errorText(r);
  };

  const entriesOf = (x: PersonSalary) =>
    x.state === 'draft'
      ? x.entries
      : x.lines
          .filter((l) => l.oneOff)
          .map((l) => ({
            kind: l.kind === 'deduction' ? ('less' as const) : ('add' as const),
            name: l.name ?? '',
            amount: l.amount,
          }));
  const days = (x: PersonSalary, soFar: boolean) =>
    t(`${s}.${soFar ? 'daysSoFar' : 'days'}`, {
      payable: x.summary.payableDays,
      employed: x.summary.employedDays,
    });
  const dates = (x: { from: string; to: string }) =>
    `${formatDisplayDate(x.from)} – ${formatDisplayDate(x.to)}`;

  const Lines = ({ x }: { x: PersonSalary }) => (
    <View>
      {x.lines
        .filter((l) => !l.oneOff)
        .map((l: PayslipLine, i) => {
          const minus = PAYSLIP_MINUS_LINES.includes(l.kind);
          return (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: space['space-3'],
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <Text style={{ flex: 1 }}>
                {t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: x.summary.payableDays })}
              </Text>
              <Text variant="money-sm" color={minus ? c['money-deduction'] : c.ink}>
                {minus ? '−' : ''}
                {formatINR(l.amount)}
              </Text>
            </View>
          );
        })}
    </View>
  );

  const first = view ? (view.name.trim().split(/\s+/)[0] ?? view.name) : '';
  const current = view?.current ?? null;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${s}.back`)}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/money'))}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t(`${s}.back`)}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-3'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {view === null && <Text muted>{t('mobile.staff.notFound')}</Text>}
        {view && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'] }}>
              <Avatar name={view.name} size={56} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="title-lg" numberOfLines={2}>
                  {view.name}
                </Text>
                <Text variant="caption" muted>
                  {t(`${s}.payDayLine`, { day: dayOfMonthText(view.payDay, t) })}
                </Text>
                {owe && owe.total !== 0 && (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 10,
                      paddingVertical: 2,
                      borderRadius: radius['radius-pill'],
                      backgroundColor: c['status-late-soft'],
                    }}
                  >
                    <Text variant="caption" color={c['money-owed']}>
                      {owe.total > 0
                        ? t('statement.tagOwe', { amount: formatINR(owe.total) })
                        : t('statement.tagOwes', { amount: formatINR(-owe.total) })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            {message && <FormMessage ok={message.ok} text={message.text} />}

            {view.needs.map((n) => (
              <View
                key={`${n.year}-${n.month}`}
                style={{
                  gap: space['space-2'],
                  padding: space['space-4'],
                  borderRadius: radius['radius-lg'],
                  backgroundColor: c['status-late-soft'],
                }}
              >
                <Text variant="caption" color={c['status-late']} style={{ fontWeight: '700' }}>
                  {n.stage === 'finalize' ? t(`${s}.ended`) : t(`${s}.stillToPay`)}
                </Text>
                <Text variant="label">{dates(n.period)}</Text>
                <Text variant="caption" muted>
                  {days(n, false)} ·{' '}
                  {n.stage === 'finalize'
                    ? t(`${s}.endedNote`, { date: formatDisplayDate(n.period.payDate) })
                    : t(`${s}.payNote`, { net: formatINR(n.net), paid: formatINR(n.paidAmount) })}
                </Text>
                <Text variant="money-hero">{formatINR(leftToPay(n))}</Text>
                {n.stage === 'finalize' && (
                  <View
                    style={{
                      gap: space['space-2'],
                      padding: space['space-3'],
                      borderRadius: radius['radius-md'],
                      backgroundColor: c.surface,
                    }}
                  >
                    <Lines x={n} />
                    <AddLess
                      canEdit={canRun}
                      entries={entriesOf(n)}
                      onAdd={addEntry(n)}
                      onRemove={removeEntry}
                    />
                  </View>
                )}
                {canRun && n.stage === 'finalize' && (
                  <Button
                    label={t('salary.finalizeOne')}
                    icon={Check}
                    block
                    disabled={busy}
                    onPress={() => setFinalizing(n)}
                  />
                )}
                {n.stage === 'pay' && (
                  <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={t('mobile.money.salary.sendOne')}
                        icon={MessageCircle}
                        variant="secondary"
                        busy={sharing === n.id}
                        block
                        onPress={() => void send(n.id)}
                      />
                    </View>
                    {canRun && (
                      <View style={{ flex: 1.2 }}>
                        <Button
                          label={t('mobile.money.salary.payOne', {
                            amount: formatINR(leftToPay(n)),
                          })}
                          icon={IndianRupee}
                          block
                          onPress={() => askPay(n)}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}

            <Card style={{ padding: space['space-4'], gap: space['space-2'] }}>
              {current ? (
                <>
                  <Text variant="caption" color={c['accent-ink']} style={{ fontWeight: '700' }}>
                    {t(`${s}.current`)}
                  </Text>
                  <Text variant="label">{dates(current.period)}</Text>
                  <Text variant="caption" muted>
                    {t(`${s}.pays`, {
                      date: formatDisplayDate(current.period.payDate),
                      count: daysLeft(current, today),
                    })}{' '}
                    · {days(current, true)}
                  </Text>
                  <Lines x={current} />
                  <AddLess
                    canEdit={canRun}
                    entries={entriesOf(current)}
                    onAdd={addEntry(current)}
                    onRemove={removeEntry}
                  />
                  {current.paidAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text>{t('salary.payNow.paidSoFar')}</Text>
                      <Text variant="money-sm" color={c['money-paid']}>
                        −{formatINR(current.paidAmount)}
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      paddingTop: space['space-2'],
                      borderTopWidth: 1,
                      borderTopColor: c.line,
                    }}
                  >
                    <Text variant="label-sm">
                      {current.paidAmount > 0
                        ? t('salary.payNow.stillToPaySoFar')
                        : t(`${s}.takeHomeSoFar`)}
                    </Text>
                    <Text variant="money-md">{formatINR(leftToPay(current))}</Text>
                  </View>
                  {canRun && (
                    <Button
                      label={t('salary.payNow.button')}
                      icon={IndianRupee}
                      block
                      onPress={() => setPayNow(current)}
                    />
                  )}
                </>
              ) : (
                <Text muted>{t(`${s}.noCurrent`)}</Text>
              )}
            </Card>

            <Text variant="label">{t(`${s}.earlier`)}</Text>
            <Card>
              {view.earlier.length === 0 && (
                <Text muted style={{ padding: space['space-4'] }}>
                  {t(`${s}.noEarlier`)}
                </Text>
              )}
              {view.earlier.map((r) => (
                <View
                  key={r.payslipId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space['space-3'],
                    padding: space['space-3'],
                    borderBottomWidth: 1,
                    borderBottomColor: c.line,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label-sm">
                      {r.from && r.to ? dates({ from: r.from, to: r.to }) : ''}
                    </Text>
                    <Text variant="caption" muted>
                      {t(`${s}.days`, { payable: r.payableDays, employed: r.employedDays })}
                      {r.newCycleFrom
                        ? ` · ${t('statement.closedEarly', { date: formatDisplayDate(r.newCycleFrom) })}`
                        : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="money-sm">{formatINR(r.net)}</Text>
                    <Text variant="caption" color={r.left > 0 ? c['money-owed'] : c['money-paid']}>
                      {r.left === 0 && r.paidOn
                        ? t(`${s}.paidOn`, { date: formatDisplayDate(r.paidOn) })
                        : r.paid > 0
                          ? t(`${s}.partPaid`)
                          : t(`${s}.notPaid`)}
                    </Text>
                  </View>
                  <IconButton
                    label={t('mobile.money.salary.sendOne')}
                    onPress={() => void send(r.payslipId)}
                    icon={<MessageCircle size={20} color={c['ink-muted']} />}
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      <Sheet
        open={!!finalizing}
        onClose={() => setFinalizing(null)}
        title={t('salary.confirm.finalizeOneTitle', { name: first })}
        subtitle={
          finalizing
            ? t('salary.confirm.finalizeOneBody', {
                amount: formatINR(finalizing.net),
                name: first,
              })
            : undefined
        }
      >
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-2'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setFinalizing(null)}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={t('salary.finalizeOne')}
              icon={Check}
              busy={busy}
              block
              onPress={() => finalizing && void finalize(finalizing)}
            />
          </View>
        </View>
      </Sheet>

      <Sheet
        open={!!paying}
        onClose={() => setPaying(null)}
        title={t(`${s}.payTitle`, { name: view?.name ?? '' })}
        subtitle={paying ? `${dates(paying.period)} · ${formatINR(leftToPay(paying))}` : undefined}
      >
        <AmountField
          label={t('mobile.money.salary.amount')}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setSheetError(null);
          }}
          hint={t('mobile.money.salary.amountHint')}
        />
        <View style={{ marginTop: space['space-2'] }}>
          <Field
            label={t('salary.payNow.paidOn')}
            value={paidOn}
            onChange={(v) => {
              setPaidOn(v);
              setSheetError(null);
            }}
            placeholder="DD/MM/YYYY"
            keyboardType="numbers-and-punctuation"
            hint={t('salary.payNow.paidOnHint', { date: formatDisplayDate(today) })}
          />
        </View>
        <View style={{ gap: space['space-2'], marginTop: space['space-2'] }}>
          <Text variant="label-sm">{t('salary.payMode')}</Text>
          <Segmented
            label={t('salary.payMode')}
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
          />
        </View>
        <Checkbox
          label={
            phoneKey(view?.phone ?? null)
              ? t('mobile.money.salary.sendWhatsApp')
              : t('mobile.money.salary.sendWhatsAppNoPhone')
          }
          value={sendWa}
          onChange={setSendWa}
        />
        {sheetError && <FormMessage ok={false} text={sheetError} />}
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-4'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setPaying(null)}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={t('salary.pay')}
              icon={IndianRupee}
              busy={busy}
              block
              onPress={() => void pay()}
            />
          </View>
        </View>
      </Sheet>

      <Sheet
        open={!!payNow}
        onClose={() => setPayNow(null)}
        title={t('salary.payNow.title', { name: view?.name ?? '' })}
        subtitle={payNow ? dates(payNow.period) : undefined}
      >
        {payNow && (
          <PayNow
            person={payNow}
            year={payNow.year}
            month={payNow.month}
            monthName=""
            onBack={() => setPayNow(null)}
            onDone={(text) => {
              setPayNow(null);
              setMessage({ ok: true, text });
              void load();
            }}
          />
        )}
      </Sheet>
    </SafeAreaView>
  );
}
