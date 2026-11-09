import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatINR,
  paiseToInput,
  parseDisplayDate,
  parseRupees,
  type BusinessDate,
} from '@fincrew/core';
import {
  dayOfMonthText,
  PAYSLIP_MINUS_LINES,
  payEarly,
  previewNewCycle,
  startNewCycle,
  type NewCyclePreview,
  type SalaryPerson,
} from '@fincrew/data';
import { AmountField, Field, FormMessage } from '@/components/form';
import { Button, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const p = 'salary.payNow';

/**
 * Pay now in the salary sheet while a month is running (design "App · pay now"; owner 09/11/2026):
 * paid on (today unless changed, never later), how, and what happens to the pay day: keep it and
 * pay any amount towards this salary, or start a new cycle from the date paid. Asks before paying.
 * `onDone` gets the message to show, once paid.
 */
export function PayNow({
  person,
  year,
  month,
  monthName,
  onBack,
  onDone,
}: {
  person: SalaryPerson;
  year: number;
  month: number;
  monthName: string;
  onBack: () => void;
  onDone: (message: string) => void;
}) {
  const { me } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const fmt = formatDisplayDate;
  const payDay = Number(person.period.payDate.slice(8, 10));
  const soFar = person.net - person.paidAmount;
  const [paidOn, setPaidOn] = useState(fmt(today));
  const [mode, setMode] = useState<string>('cash');
  const [choice, setChoice] = useState<'keep' | 'cycle'>('keep');
  const [amount, setAmount] = useState('');
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ date: BusinessDate; data: NewCyclePreview } | null>(
    null,
  );
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;

  const date = parseDisplayDate(paidOn);
  const dateError = !date
    ? t(`${p}.problems.date`)
    : date > today
      ? t(`${p}.problems.future`, { today: fmt(today) })
      : date < person.period.from
        ? t(`${p}.problems.before_period`, { month: monthName, from: fmt(person.period.from) })
        : '';
  const typed = parseRupees(amount);
  const keepAmount = typed !== null && typed > 0 ? typed : 0;
  const cycle = choice === 'cycle' && date && preview?.date === date ? preview.data : null;
  const ready = cycle && cycle.ok ? cycle : null;

  useEffect(() => {
    if (!me || choice !== 'cycle' || !date || dateError || preview?.date === date) return;
    let live = true;
    void previewNewCycle(supabase, me.shopId, person.staffId, year, month, date, today).then(
      (data) => {
        if (live) setPreview({ date, data });
      },
    );
    return () => {
      live = false;
    };
  }, [me, choice, date, dateError, preview?.date, person.staffId, year, month, today]);

  const cycleProblem =
    cycle && !cycle.ok
      ? cycle.reason === 'too_early'
        ? t(`${p}.problems.too_early`, {
            date: fmt(cycle.earliest),
            day: dayOfMonthText(payDay, t),
          })
        : t(`${p}.problems.${cycle.reason}`, {
            today: fmt(today),
            month: monthName,
            from: fmt(person.period.from),
          })
      : '';
  const problem =
    dateError ||
    (choice === 'cycle' ? cycleProblem : '') ||
    (choice === 'keep' && tried && !keepAmount ? t(`${p}.problems.amount`) : '') ||
    failed ||
    '';
  const toPay = choice === 'cycle' ? (ready ? Math.max(0, ready.net - ready.paid) : 0) : keepAmount;

  const tryPay = () => {
    setFailed(null);
    if (dateError || (choice === 'cycle' && cycleProblem)) return;
    if (choice === 'keep' && !keepAmount) return setTried(true);
    if (choice === 'cycle' && !ready) return;
    setAsking(true);
  };
  const pay = async () => {
    if (!me || !date) return;
    setBusy(true);
    const r =
      choice === 'keep'
        ? await payEarly(supabase, {
            ...me,
            staffId: person.staffId,
            year,
            month,
            amount: keepAmount,
            date,
            mode,
            today,
          })
        : await startNewCycle(supabase, {
            ...me,
            staffId: person.staffId,
            year,
            month,
            paidOn: date,
            mode,
            today,
          });
    setBusy(false);
    setAsking(false);
    if (!r.ok)
      return setFailed(
        r.reason === 'no_permission'
          ? t('salary.errors.noPermission')
          : t('salary.errors.failed', { reason: r.message }),
      );
    onDone(
      choice === 'keep'
        ? t(`${p}.doneKeep`, { amount: formatINR(keepAmount), date: fmt(date), month: monthName })
        : t(`${p}.doneCycle`, {
            month: monthName,
            closes: fmt(ready!.closesOn),
            day: dayOfMonthText(ready!.payDay, t),
          }),
    );
  };

  const card = (on: boolean) => ({
    gap: space['space-2'],
    padding: space['space-3'],
    borderRadius: radius['radius-md'],
    borderWidth: 1.5,
    borderColor: on ? c.accent : c.line,
    backgroundColor: on ? c['accent-soft'] : c.surface,
  });
  const Radio = ({ on, title, body }: { on: boolean; title: string; body: string }) => (
    <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
      <View
        style={{
          width: 20,
          height: 20,
          marginTop: 2,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: on ? c.accent : c['line-strong'],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent }} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label-sm">{title}</Text>
        <Text variant="caption" muted>
          {body}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ gap: space['space-3'] }}>
      <Field
        label={t(`${p}.paidOn`)}
        value={paidOn}
        onChange={(v) => {
          setPaidOn(v);
          setAsking(false);
        }}
        placeholder="DD/MM/YYYY"
        keyboardType="numbers-and-punctuation"
        hint={t(`${p}.paidOnHint`, { date: fmt(today) })}
      />
      <View style={{ gap: space['space-1'] }}>
        <Text variant="caption" muted>
          {t(`${p}.how`)}
        </Text>
        <Segmented
          label={t(`${p}.how`)}
          value={mode}
          onChange={setMode}
          options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
        />
      </View>
      <Text variant="label-sm">{t(`${p}.question`)}</Text>
      <View accessibilityRole="radiogroup" style={{ gap: space['space-2'] }}>
        <View style={card(choice === 'keep')}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === 'keep' }}
            onPress={() => {
              setChoice('keep');
              setAsking(false);
            }}
          >
            <Radio
              on={choice === 'keep'}
              title={t(`${p}.keepTitle`, { day: dayOfMonthText(payDay, t) })}
              body={t(`${p}.keepBody`, {
                month: monthName,
                to: fmt(person.period.to),
                payDate: fmt(person.period.payDate),
              })}
            />
          </Pressable>
          {choice === 'keep' && (
            <View style={{ gap: space['space-2'] }}>
              <AmountField
                label={t(`${p}.amount`)}
                value={amount}
                onChange={(v) => {
                  setAmount(v);
                  setTried(false);
                  setAsking(false);
                }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] }}>
                {[
                  ...person.entries
                    .filter((e) => e.kind === 'add')
                    .map((e) => ({ name: e.name, amount: e.amount })),
                  { name: t(`${p}.chipSoFar`), amount: soFar },
                ]
                  .filter((x) => x.amount > 0)
                  .map((x) => (
                    <Pressable
                      key={x.name}
                      accessibilityRole="button"
                      onPress={() => {
                        setAmount(paiseToInput(x.amount));
                        setTried(false);
                      }}
                      style={{
                        minHeight: 40,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: space['space-3'],
                        borderRadius: radius['radius-pill'],
                        borderWidth: 1,
                        borderColor: c['line-strong'],
                        backgroundColor: c.surface,
                      }}
                    >
                      <Text variant="caption">{x.name}</Text>
                      <Text variant="caption" style={{ fontWeight: '600' }}>
                        {formatINR(x.amount)}
                      </Text>
                    </Pressable>
                  ))}
              </View>
              {keepAmount > soFar && (
                <Text variant="caption" color={c['status-late']}>
                  {t(`${p}.over`, { amount: formatINR(soFar) })}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={card(choice === 'cycle')}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === 'cycle' }}
            onPress={() => {
              setChoice('cycle');
              setAsking(false);
            }}
          >
            <Radio
              on={choice === 'cycle'}
              title={
                date && !dateError
                  ? t(`${p}.cycleTitle`, { date: fmt(date) })
                  : t(`${p}.cycleTitleAny`)
              }
              body={
                ready
                  ? t(`${p}.cycleBody`, {
                      month: monthName,
                      closes: fmt(ready.closesOn),
                      days: ready.payableDays,
                      cycle: ready.cycleDays,
                      day: dayOfMonthText(ready.payDay, t),
                    })
                  : t(`${p}.cycleHint`)
              }
            />
          </Pressable>
          {choice === 'cycle' && !cycle && !dateError && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'] }}>
              <ActivityIndicator color={c.accent} />
              <Text variant="caption" muted>
                {t(`${p}.loading`)}
              </Text>
            </View>
          )}
          {ready && (
            <View>
              {ready.lines.map((l, i) => {
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
                      {t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: ready.payableDays })}
                    </Text>
                    <Text
                      variant="money-sm"
                      color={minus ? c['money-deduction'] : l.oneOff ? c['status-present'] : c.ink}
                    >
                      {minus ? '−' : l.oneOff ? '+' : ''}
                      {formatINR(l.amount)}
                    </Text>
                  </View>
                );
              })}
              {ready.paid > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 6,
                  }}
                >
                  <Text>{t(`${p}.paidAlready`)}</Text>
                  <Text variant="money-sm" color={c['money-paid']}>
                    −{formatINR(ready.paid)}
                  </Text>
                </View>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingTop: space['space-2'],
                }}
              >
                <Text variant="label-sm">
                  {ready.paid > 0 ? t(`${p}.toPay`) : t(`${p}.takeHome`)}
                </Text>
                <Text variant="money-md">{formatINR(toPay)}</Text>
              </View>
              <Text variant="caption" muted>
                {t(`${p}.next`, {
                  from: fmt(ready.next.from),
                  to: fmt(ready.next.to),
                  payDate: fmt(ready.next.payDate),
                })}
              </Text>
            </View>
          )}
        </View>
      </View>

      {problem ? <FormMessage ok={false} text={problem} /> : null}
      {asking && date && (
        <View
          style={{
            gap: 4,
            padding: space['space-3'],
            borderRadius: radius['radius-md'],
            backgroundColor: c['status-late-soft'],
          }}
        >
          <Text variant="label-sm">
            {choice === 'keep'
              ? t(`${p}.askKeep`, {
                  amount: formatINR(keepAmount),
                  date: fmt(date),
                  month: monthName,
                })
              : t(`${p}.askCycle`, {
                  month: monthName,
                  closes: fmt(ready!.closesOn),
                  amount: formatINR(toPay),
                })}
          </Text>
          <Text variant="caption">
            {choice === 'keep'
              ? t(`${p}.askKeepBody`, {
                  month: monthName,
                  to: fmt(person.period.to),
                  amount: formatINR(keepAmount),
                  payDate: fmt(person.period.payDate),
                })
              : t(`${p}.askCycleBody`, {
                  month: monthName,
                  days: ready!.payableDays,
                  cycle: ready!.cycleDays,
                  date: fmt(date),
                  name: person.name,
                  day: dayOfMonthText(ready!.payDay, t),
                  from: fmt(ready!.next.from),
                  to: fmt(ready!.next.to),
                  payDate: fmt(ready!.next.payDate),
                })}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
        <View style={{ flex: 1 }}>
          <Button
            label={asking ? t(`${p}.goBack`) : t(`${p}.back`)}
            variant="secondary"
            block
            disabled={busy}
            onPress={() => (asking ? setAsking(false) : onBack())}
          />
        </View>
        <View style={{ flex: 1.5 }}>
          <Button
            label={
              asking
                ? t(`${p}.yes`)
                : toPay
                  ? t(`${p}.pay`, { amount: formatINR(toPay) })
                  : t(`${p}.payPlain`)
            }
            busy={busy}
            disabled={!asking && choice === 'cycle' && !ready}
            block
            onPress={() => (asking ? void pay() : tryPay())}
          />
        </View>
      </View>
    </View>
  );
}
