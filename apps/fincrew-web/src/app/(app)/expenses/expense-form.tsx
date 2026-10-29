'use client';

import { startTransition, useActionState, useState, useTransition } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useRouter } from 'next/navigation';
import { Camera, Check, ChevronRight } from 'lucide-react';
import {
  defaultChargedTo,
  formatDisplayDate,
  formatINR,
  paiseToInput,
  parseRupees,
} from '@fincrew/core';
import { compressImage } from '@/lib/compress-image';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { t } from '@/lib/i18n';
import { buttonClass, dateFieldProps, inputClass, quietButtonClass } from '../../components';
import { deleteExpense, saveExpense, type ExpenseState } from './actions';

export type FormExpense = {
  id: string;
  date: string;
  amount: number;
  categoryId: string;
  mode: string;
  note: string | null;
  paidBy: string;
  paidByStaff: string | null;
  chargedTo: string;
  chargedToStaff: string | null;
  reimburse: boolean;
  hasBill: boolean;
};

type GiveBack = 'salary' | 'now' | 'none';

const f = 'expenses.form';
const segment =
  'text-label-sm flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] px-2 text-center has-[:checked]:bg-[var(--surface)] has-[:checked]:shadow-[var(--elevation-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]';

function Segmented<T extends string>({
  name,
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly T[];
  labels: Record<string, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-label-sm mb-1">{legend}</legend>
      <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1">
        {options.map((o) => (
          <label key={o} className={segment}>
            <input
              type="radio"
              name={name}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="sr-only"
            />
            {labels[o]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Add or edit an expense. Adding goes in three steps (owner, 29/10/2026; design "Web · expenses,
 * today first + add in steps"): 1 amount and category (Save now keeps today, shop cash), 2 who
 * paid, give it back (with salary / now / not needed), whose expense, paid with, date, 3 bill
 * photo and note with a summary. Editing shows every field at once. Every field stays in the form
 * while hidden, so Save now on any step sends them all. Below the shop's small-expense limit
 * "whose expense" starts as Not tracked until the person picks one. The bill photo is shrunk here.
 */
export function ExpenseForm({
  expense,
  categories,
  staff,
  today,
  monthName,
  smallLimit,
  canDelete,
  canPayBack,
}: {
  expense: FormExpense | null;
  categories: { id: string; name: string; icon: string; colour: string }[];
  staff: { id: string; name: string }[];
  today: string;
  monthName: string;
  smallLimit: number | null;
  /** Unused since the form moved into a dialog / sheet (Escape is theirs); kept for callers. */
  closeHref?: string;
  canDelete: boolean;
  /** Offer "give it back now" (needs salary.run). */
  canPayBack: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ExpenseState, FormData>(
    saveExpense.bind(null, expense?.id ?? null),
    {},
  );
  const adding = !expense;
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [amount, setAmount] = useState(expense ? paiseToInput(expense.amount) : '');
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [date, setDate] = useState(formatDisplayDate(expense?.date ?? today));
  const [paidBy, setPaidBy] = useState(
    (expense?.paidBy ?? 'shop_cash') as 'owner' | 'shop_cash' | 'staff',
  );
  const [paidStaff, setPaidStaff] = useState(expense?.paidByStaff ?? '');
  const [giveBack, setGiveBack] = useState<GiveBack>(
    expense && !expense.reimburse ? 'none' : 'salary',
  );
  const [charged, setCharged] = useState(
    (expense?.chargedTo ?? 'shop') as 'shop' | 'staff' | 'not_tracked',
  );
  const [chargedStaff, setChargedStaff] = useState(expense?.chargedToStaff ?? '');
  const [chargedTouched, setChargedTouched] = useState(!!expense);
  const [mode, setMode] = useState((expense?.mode ?? 'cash') as 'cash' | 'upi' | 'bank' | 'card');
  const [billName, setBillName] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [asking, setAsking] = useState(false);

  const paise = parseRupees(amount);
  const autoCharged =
    paise && smallLimit != null ? defaultChargedTo(paise, smallLimit) : ('shop' as const);
  const chargedNow = chargedTouched ? charged : autoCharged;
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? '';
  const giveBackOptions: GiveBack[] =
    adding && canPayBack ? ['salary', 'now', 'none'] : ['salary', 'none'];

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPrepError(null);
    const data = new FormData(e.currentTarget);
    const file = data.get('bill');
    if (file instanceof File && file.size > 0) {
      const small = await compressImage(file);
      if (!small) {
        setPrepError(t(`${f}.billBad`));
        return;
      }
      data.set('bill', new File([small], 'bill.jpg', { type: 'image/jpeg' }));
    } else {
      data.delete('bill');
    }
    startTransition(() => dispatch(data));
  };

  const goNext = () => {
    setStepError(null);
    if (step === 1 && !paise) return setStepError(t(`${f}.errors.amount`));
    if (step === 1 && !categoryId) return setStepError(t(`${f}.errors.category`));
    if (step === 2 && paidBy === 'staff' && !paidStaff)
      return setStepError(t(`${f}.errors.staffPaid`));
    if (step === 2 && chargedNow === 'staff' && !chargedStaff)
      return setStepError(t(`${f}.errors.staffCharged`));
    setStep(step + 1);
  };

  const error = stepError ?? prepError ?? state.error;
  // Adding: only the current step shows; editing: everything.
  const shows = (n: number) => !adding || step === n;
  const s = `${f}.steps`;
  const category = categories.find((c) => c.id === categoryId);
  const summary = [
    paidBy === 'staff'
      ? t(`${f}.summaryPaid.staff`, { name: nameOf(paidStaff) })
      : t(`${f}.summaryPaid.${paidBy}`),
    (t('salary.modes', { returnObjects: true }) as Record<string, string>)[mode],
    paidBy === 'staff' ? t(`${f}.summaryBack.${giveBack}`) : null,
    t(`${f}.summaryCharged.${chargedNow}`, { name: nameOf(chargedStaff) }),
    date,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <form onSubmit={onSubmit} noValidate={adding} className="flex flex-col gap-5">
      {adding && (
        <ol aria-label={t(`${s}.label`)} className="grid grid-cols-3 gap-1.5">
          {(['one', 'two', 'three'] as const).map((k, i) => (
            <li
              key={k}
              aria-current={step === i + 1 ? 'step' : undefined}
              className="flex flex-col gap-1.5"
            >
              <span
                className={`h-1 rounded-full ${i < step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-muted)]'}`}
              />
              <span
                className={`text-xs font-semibold ${step === i + 1 ? '' : 'text-[var(--ink-muted)]'}`}
              >
                {i + 1} · {t(`${s}.${k}`)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className={shows(1) ? 'flex flex-col gap-4' : 'hidden'}>
        <label className="text-label-sm flex flex-col gap-1.5">
          {t(`${f}.amount`)}
          <input
            name="amount"
            required
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} mt-0 h-14 text-[1.75rem] font-semibold tabular-nums`}
          />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-label-sm mb-1">{t(`${f}.category`)}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon);
              const col = categoryColour(c.colour);
              return (
                <label
                  key={c.id}
                  className="text-caption flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--surface)] px-1 py-2 text-center font-semibold shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
                >
                  <input
                    type="radio"
                    name="category"
                    value={c.id}
                    required
                    checked={categoryId === c.id}
                    onChange={() => setCategoryId(c.id)}
                    className="sr-only"
                  />
                  <span
                    className="grid size-8 place-items-center rounded-full"
                    style={{ background: col.soft, color: col.fg }}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {c.name}
                </label>
              );
            })}
          </div>
        </fieldset>
        {adding && (
          <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm">
            {t(`${s}.defaults`, { date })}
          </p>
        )}
      </div>

      <div className={shows(2) ? 'flex flex-col gap-4' : 'hidden'}>
        <div className="flex flex-col gap-2">
          <Segmented
            name="paidBy"
            legend={t(`${f}.paidBy`)}
            // The shop pays or a staff member does (owner, 29/10/2026); "Owner" stays only on old
            // expenses that used it.
            options={
              expense?.paidBy === 'owner'
                ? (['owner', 'shop_cash', 'staff'] as const)
                : (['shop_cash', 'staff'] as const)
            }
            labels={t(`${f}.paidByOptions`, { returnObjects: true }) as Record<string, string>}
            value={paidBy}
            onChange={setPaidBy}
          />
          {paidBy === 'staff' && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
              <label className="text-label-sm block">
                {t(`${f}.whoPaid`)}
                <select
                  name="paidByStaff"
                  required
                  value={paidStaff}
                  onChange={(e) => setPaidStaff(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    {t(`${f}.chooseStaff`)}
                  </option>
                  {staff.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <Segmented
                name="giveBack"
                legend={t(`${f}.giveBack`)}
                options={giveBackOptions}
                labels={
                  t(`${f}.giveBackOptions`, { returnObjects: true }) as Record<string, string>
                }
                value={giveBack}
                onChange={setGiveBack}
              />
              {giveBack === 'now' && (
                <p className="text-caption text-[var(--ink-muted)]">
                  {t(`${f}.giveBackNowHint`, { name: nameOf(paidStaff) || '—' })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Segmented
            name="chargedTo"
            legend={t(`${f}.whose`)}
            options={['shop', 'staff', 'not_tracked'] as const}
            labels={t(`${f}.chargedOptions`, { returnObjects: true }) as Record<string, string>}
            value={chargedNow}
            onChange={(v) => {
              setChargedTouched(true);
              setCharged(v);
            }}
          />
          {chargedNow === 'staff' && (
            <label className="text-label-sm block">
              {t(`${f}.staffMember`)}
              <select
                name="chargedToStaff"
                required
                value={chargedStaff}
                onChange={(e) => setChargedStaff(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  {t(`${f}.chooseStaff`)}
                </option>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-caption text-[var(--ink-muted)]">
            {!chargedTouched && autoCharged === 'not_tracked' && smallLimit != null
              ? t(`${f}.smallHint`, { limit: formatINR(smallLimit) })
              : t(`${f}.chargedHint.${chargedNow}`, { month: monthName })}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Segmented
            name="mode"
            legend={t(`${f}.paidWith`)}
            options={['cash', 'upi', 'bank', 'card'] as const}
            labels={t('salary.modes', { returnObjects: true }) as Record<string, string>}
            value={mode}
            onChange={setMode}
          />
          <label className="text-label-sm block">
            {t(`${f}.date`)}
            <input
              name="date"
              required
              {...dateFieldProps}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className={shows(3) ? 'flex flex-col gap-4' : 'hidden'}>
        <label className="text-label-sm block">
          {t(`${f}.note`)}
          <input
            name="note"
            maxLength={200}
            defaultValue={expense?.note ?? ''}
            placeholder={t(`${f}.notePlaceholder`)}
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-label-sm">{t(`${f}.bill`)}</span>
          {expense?.hasBill && (
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/expenses/bill/${expense.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-label-sm text-[var(--accent-ink)] underline"
              >
                {t(`${f}.billView`)}
              </a>
              <label className="text-body flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name="removeBill"
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                {t(`${f}.billRemove`)}
              </label>
            </div>
          )}
          <label
            className={`${quietButtonClass} flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 border-dashed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]`}
          >
            <Camera size={22} aria-hidden="true" />
            {billName ?? (expense?.hasBill ? t(`${f}.billReplace`) : t(`${f}.billAdd`))}
            <input
              type="file"
              name="bill"
              accept="image/*"
              capture="environment"
              onChange={(e) => setBillName(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </label>
          <span className="text-caption text-[var(--ink-muted)]">{t(`${f}.billHint`)}</span>
        </div>

        {adding && (
          <div className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
            <span className="text-xs font-bold tracking-wider text-[var(--ink-muted)] uppercase">
              {t(`${s}.summary`)}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {paise ? formatINR(paise) : '—'} · {category?.name ?? '—'}
            </span>
            <span className="text-sm text-[var(--ink-muted)]">{summary}</span>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {error}
        </p>
      )}

      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => {
                setStepError(null);
                setStep(step - 1);
              }}
              className={`${quietButtonClass} border-0`}
            >
              {t(`${s}.back`)}
            </button>
          )}
          <span className="flex-1" />
          {step < 3 && (
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className={quietButtonClass}
            >
              {pending ? t(`${f}.saving`) : t(`${s}.saveNow`)}
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className={`${buttonClass} inline-flex items-center justify-center gap-2`}
            >
              {t(`${s}.next`)}
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className={`${buttonClass} inline-flex items-center justify-center gap-2`}
            >
              <Check size={20} aria-hidden="true" />
              {pending ? t(`${f}.saving`) : t(`${f}.save`)}
            </button>
          )}
        </div>
      ) : (
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${buttonClass} inline-flex items-center justify-center gap-2`}
        >
          <Check size={20} aria-hidden="true" />
          {pending ? t(`${f}.saving`) : t(`${f}.save`)}
        </button>
      )}

      {expense && canDelete && (
        <div className="flex flex-col gap-1 border-t border-[var(--line)] pt-4">
          <button
            type="button"
            disabled={deleting}
            aria-busy={deleting}
            onClick={() =>
              asking
                ? startDelete(async () => {
                    await deleteExpense(expense.id, expense.date);
                  })
                : setAsking(true)
            }
            className={`${quietButtonClass} w-fit ${asking ? 'border-[var(--danger)] text-[var(--danger)]' : ''}`}
          >
            {asking ? t(`${f}.deleteConfirm`) : t(`${f}.delete`)}
          </button>
          <span className="text-caption text-[var(--ink-muted)]">{t(`${f}.deleteHint`)}</span>
        </div>
      )}
    </form>
  );
}

/**
 * Editing an expense (`?edit=<id>`): the form in a shadcn side sheet over the list. Closing it
 * (×, Escape, the dimmed page) goes back to the period without the `edit` parameter.
 */
export function ExpensePanel({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
