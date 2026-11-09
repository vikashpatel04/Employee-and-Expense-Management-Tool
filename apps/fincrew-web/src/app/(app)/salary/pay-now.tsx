'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  formatDisplayDate,
  formatINR,
  paiseToInput,
  parseDisplayDate,
  parseRupees,
  type BusinessDate,
} from '@fincrew/core';
import { dayOfMonthText, PAYSLIP_MINUS_LINES, type NewCyclePreview } from '@fincrew/data';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { inputClass } from '../../components';
import { payEarly, previewCycle, startNewCycle } from './actions';
import { usePersonDialog } from './add-less';

const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const p = 'salary.payNow';

/** "Pay now" in a person's pop-up while their month is running: switches it to the form below. */
export function PayNowButton() {
  const { openPay } = usePersonDialog();
  return <Button onClick={openPay}>{t(`${p}.button`)}</Button>;
}

/** One way to pay, as a choice card. */
function Choice({
  on,
  onPick,
  title,
  body,
  children,
}: {
  on: boolean;
  onPick: () => void;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border-[1.5px] px-3.5 py-3 ${
        on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]'
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={onPick}
        className="flex items-start gap-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${
            on ? 'border-[var(--accent)]' : 'border-[var(--line-strong)]'
          }`}
        >
          {on && <span className="size-2 rounded-full bg-[var(--accent)]" />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-[13px] leading-[18px] text-[var(--ink-muted)]">{body}</span>
        </span>
      </button>
      {on && children && <div className="flex flex-col gap-1.5 pl-7">{children}</div>}
    </div>
  );
}

/**
 * Pay now (design "Web · pay now: keep the 16th or a new cycle"; owner 09/11/2026): paid on (today
 * unless changed, never later), how, and what happens to the pay day: keep it, paying any amount
 * towards this salary, or start a new cycle from the date paid, closing this salary the day
 * before. Asks before paying.
 */
export function PayNowForm(props: {
  year: number;
  month: number;
  staffId: string;
  name: string;
  monthName: string;
  /** Their pay day now, a date of the month. */
  payDay: number;
  period: { from: BusinessDate; to: BusinessDate; payDate: BusinessDate };
  today: BusinessDate;
  /** Take-home so far, and what's been paid towards it already. */
  soFar: number;
  paid: number;
  additions: { name: string; amount: number }[];
}) {
  const router = useRouter();
  const { closePay } = usePersonDialog();
  const [paidOn, setPaidOn] = useState(formatDisplayDate(props.today));
  const [mode, setMode] = useState<string>('cash');
  const [choice, setChoice] = useState<'keep' | 'cycle'>('keep');
  const [amount, setAmount] = useState('');
  const [asking, setAsking] = useState(false);
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<{ date: string; data: NewCyclePreview } | null>(null);
  const [pending, start] = useTransition();
  const [loading, startLoading] = useTransition();
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const fmt = formatDisplayDate;

  const date = parseDisplayDate(paidOn);
  const dateError = !date
    ? t(`${p}.problems.date`)
    : date > props.today
      ? t(`${p}.problems.future`, { today: fmt(props.today) })
      : date < props.period.from
        ? t(`${p}.problems.before_period`, { month: props.monthName, from: fmt(props.period.from) })
        : '';
  const typed = parseRupees(amount);
  const keepAmount = typed !== null && typed > 0 ? typed : 0;
  const cycle = choice === 'cycle' && date && preview?.date === date ? preview.data : null;

  useEffect(() => {
    if (choice !== 'cycle' || !date || dateError || preview?.date === date) return;
    startLoading(async () => {
      const data = await previewCycle(props.year, props.month, props.staffId, date);
      setPreview({ date, data });
    });
  }, [choice, date, dateError, preview?.date, props.year, props.month, props.staffId]);

  const cycleProblem =
    cycle && !cycle.ok
      ? cycle.reason === 'too_early'
        ? t(`${p}.problems.too_early`, {
            date: fmt(cycle.earliest),
            day: dayOfMonthText(props.payDay, t),
          })
        : t(`${p}.problems.${cycle.reason}`, {
            today: fmt(props.today),
            month: props.monthName,
            from: fmt(props.period.from),
          })
      : '';
  const problem =
    dateError ||
    (choice === 'cycle' ? cycleProblem : '') ||
    (choice === 'keep' && tried && !keepAmount ? t(`${p}.problems.amount`) : '');
  const ready = cycle && cycle.ok ? cycle : null;
  const toPay = choice === 'cycle' ? (ready ? Math.max(0, ready.net - ready.paid) : 0) : keepAmount;

  const tryPay = () => {
    if (problem) return;
    if (choice === 'keep' && !keepAmount) return setTried(true);
    if (choice === 'cycle' && !ready) return;
    setAsking(true);
  };
  const pay = () =>
    start(async () => {
      if (!date) return;
      const r =
        choice === 'keep'
          ? await payEarly(props.year, props.month, props.staffId, keepAmount, date, mode)
          : await startNewCycle(props.year, props.month, props.staffId, date, mode);
      setAsking(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        choice === 'keep'
          ? t(`${p}.doneKeep`, {
              amount: formatINR(keepAmount),
              date: fmt(date),
              month: props.monthName,
            })
          : t(`${p}.doneCycle`, {
              month: props.monthName,
              closes: fmt(ready!.closesOn),
              day: dayOfMonthText(ready!.payDay, t),
            }),
      );
      closePay();
      router.refresh();
    });

  const lineLabel = (kind: string, name: string | undefined, days: number) =>
    t(`salary.lines.${kind}`, { name: name ?? '', days });

  return (
    <>
      <div className="flex flex-col pr-8">
        <span className="text-base font-semibold">{t(`${p}.title`, { name: props.name })}</span>
        <span className="text-xs text-[var(--ink-muted)]">
          {t('salary.period', {
            from: fmt(props.period.from),
            to: fmt(props.period.to),
            payDate: fmt(props.period.payDate),
          })}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[160px] flex-[1_1_160px] flex-col gap-0.5 text-xs font-medium text-[var(--ink-muted)]">
          {t(`${p}.paidOn`)}
          <input
            value={paidOn}
            onChange={(e) => {
              setPaidOn(e.target.value);
              setAsking(false);
            }}
            placeholder="DD/MM/YYYY"
            inputMode="numeric"
            className={`${inputClass} mt-0 tabular-nums`}
          />
          <span className="font-normal">{t(`${p}.paidOnHint`, { date: fmt(props.today) })}</span>
        </label>
        <div className="flex min-w-[200px] flex-[1_1_200px] flex-col gap-0.5 text-xs font-medium text-[var(--ink-muted)]">
          {t(`${p}.how`)}
          <div
            role="radiogroup"
            aria-label={t(`${p}.how`)}
            className="flex gap-0.5 rounded-lg bg-[var(--surface-muted)] p-[3px]"
          >
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`h-8 flex-1 rounded-md text-sm font-semibold text-[var(--ink)] ${
                  mode === m ? 'bg-[var(--surface)] shadow-[var(--elevation-1)]' : ''
                }`}
              >
                {modes[m] ?? m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div role="radiogroup" aria-label={t(`${p}.question`)} className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{t(`${p}.question`)}</span>
        <Choice
          on={choice === 'keep'}
          onPick={() => {
            setChoice('keep');
            setAsking(false);
          }}
          title={t(`${p}.keepTitle`, { day: dayOfMonthText(props.payDay, t) })}
          body={t(`${p}.keepBody`, {
            month: props.monthName,
            to: fmt(props.period.to),
            payDate: fmt(props.period.payDate),
          })}
        >
          <label className="text-xs font-medium text-[var(--ink-muted)]">
            {t(`${p}.amount`)}
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setTried(false);
                setAsking(false);
              }}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputClass} max-w-[220px] tabular-nums`}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[...props.additions, { name: t(`${p}.chipSoFar`), amount: props.soFar - props.paid }]
              .filter((c) => c.amount > 0)
              .map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setAmount(paiseToInput(c.amount));
                    setTried(false);
                  }}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[13px]"
                >
                  {c.name}
                  <span className="font-semibold tabular-nums">{formatINR(c.amount)}</span>
                </button>
              ))}
          </div>
          {keepAmount > props.soFar - props.paid && (
            <span className="text-xs text-[var(--status-late)]">
              {t(`${p}.over`, { amount: formatINR(props.soFar - props.paid) })}
            </span>
          )}
        </Choice>
        <Choice
          on={choice === 'cycle'}
          onPick={() => {
            setChoice('cycle');
            setAsking(false);
          }}
          title={
            date && !dateError ? t(`${p}.cycleTitle`, { date: fmt(date) }) : t(`${p}.cycleTitleAny`)
          }
          body={
            ready
              ? t(`${p}.cycleBody`, {
                  month: props.monthName,
                  closes: fmt(ready.closesOn),
                  days: ready.payableDays,
                  cycle: ready.cycleDays,
                  day: dayOfMonthText(ready.payDay, t),
                })
              : t(`${p}.cycleHint`)
          }
        >
          {loading && !ready && (
            <span className="text-xs text-[var(--ink-muted)]">{t(`${p}.loading`)}</span>
          )}
          {ready && (
            <div className="flex flex-col text-sm">
              {ready.lines.map((l, i) => {
                const minus = PAYSLIP_MINUS_LINES.includes(l.kind);
                return (
                  <div
                    key={i}
                    className="flex justify-between gap-3 border-b border-[var(--line)] py-1"
                  >
                    <span>{lineLabel(l.kind, l.name, ready.payableDays)}</span>
                    <span
                      className={`tabular-nums ${minus ? 'text-[var(--money-deduction)]' : l.oneOff ? 'text-[var(--status-present)]' : ''}`}
                    >
                      {minus ? '−' : l.oneOff ? '+' : ''}
                      {formatINR(l.amount)}
                    </span>
                  </div>
                );
              })}
              {ready.paid > 0 && (
                <div className="flex justify-between gap-3 border-b border-[var(--line)] py-1">
                  <span>{t(`${p}.paidAlready`)}</span>
                  <span className="text-[var(--money-paid)] tabular-nums">
                    −{formatINR(ready.paid)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3 pt-1.5 font-semibold">
                <span>{ready.paid > 0 ? t(`${p}.toPay`) : t(`${p}.takeHome`)}</span>
                <span className="tabular-nums">{formatINR(toPay)}</span>
              </div>
              <span className="pt-1 text-xs text-[var(--ink-muted)]">
                {t(`${p}.next`, {
                  from: fmt(ready.next.from),
                  to: fmt(ready.next.to),
                  payDate: fmt(ready.next.payDate),
                })}
              </span>
            </div>
          )}
        </Choice>
      </div>

      {problem && (
        <span role="alert" className="text-[13px] text-[var(--status-absent)]">
          {problem}
        </span>
      )}
      {asking && date && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-[var(--status-late-soft)] p-3">
          <span className="text-sm font-semibold">
            {choice === 'keep'
              ? t(`${p}.askKeep`, {
                  amount: formatINR(keepAmount),
                  date: fmt(date),
                  month: props.monthName,
                })
              : t(`${p}.askCycle`, {
                  month: props.monthName,
                  closes: fmt(ready!.closesOn),
                  amount: formatINR(toPay),
                })}
          </span>
          <span className="text-[13px] leading-[18px]">
            {choice === 'keep'
              ? t(`${p}.askKeepBody`, {
                  month: props.monthName,
                  to: fmt(props.period.to),
                  amount: formatINR(keepAmount),
                  payDate: fmt(props.period.payDate),
                })
              : t(`${p}.askCycleBody`, {
                  month: props.monthName,
                  days: ready!.payableDays,
                  cycle: ready!.cycleDays,
                  date: fmt(date),
                  name: props.name,
                  day: dayOfMonthText(ready!.payDay, t),
                  from: fmt(ready!.next.from),
                  to: fmt(ready!.next.to),
                  payDate: fmt(ready!.next.payDate),
                })}
          </span>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {asking ? (
          <>
            <Button variant="outline" disabled={pending} onClick={() => setAsking(false)}>
              {t(`${p}.goBack`)}
            </Button>
            <Button disabled={pending} aria-busy={pending} onClick={pay}>
              {pending ? t('salary.working') : t(`${p}.yes`)}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={closePay}>
              {t(`${p}.back`)}
            </Button>
            <Button onClick={tryPay} disabled={choice === 'cycle' && !ready}>
              {toPay ? t(`${p}.pay`, { amount: formatINR(toPay) }) : t(`${p}.payPlain`)}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
