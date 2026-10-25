'use client';

import { PendingLink as Link } from '@/components/app/pending-link';
import { startTransition, useActionState, useEffect, useState, useTransition } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useRouter } from 'next/navigation';
import { Camera, Check, X } from 'lucide-react';
import {
  defaultChargedTo,
  formatDisplayDate,
  formatINR,
  paiseToInput,
  parseRupees,
} from '@fincrew/core';
import { compressImage } from '@/lib/compress-image';
import { categoryIcon } from '@/lib/expense-style';
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
 * Add or edit an expense (design: "Web · expenses", side panel). Paid by / Charged to follow
 * PLAN §4.8; below the shop's small-expense limit "Charged to" starts as Not tracked until the
 * person picks one. The bill photo is shrunk here before it's sent.
 */
export function ExpenseForm({
  expense,
  categories,
  staff,
  today,
  monthName,
  smallLimit,
  closeHref,
  canDelete,
}: {
  expense: FormExpense | null;
  categories: { id: string; name: string; icon: string }[];
  staff: { id: string; name: string }[];
  today: string;
  monthName: string;
  smallLimit: number | null;
  /** Unused since the form moved into a dialog / sheet (Escape is theirs); kept for callers. */
  closeHref?: string;
  canDelete: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ExpenseState, FormData>(
    saveExpense.bind(null, expense?.id ?? null),
    {},
  );
  const [prepError, setPrepError] = useState<string | null>(null);
  const [amount, setAmount] = useState(expense ? paiseToInput(expense.amount) : '');
  const [paidBy, setPaidBy] = useState(
    (expense?.paidBy ?? 'owner') as 'owner' | 'shop_cash' | 'staff',
  );
  const [charged, setCharged] = useState(
    (expense?.chargedTo ?? 'shop') as 'shop' | 'staff' | 'not_tracked',
  );
  const [chargedTouched, setChargedTouched] = useState(!!expense);
  const [mode, setMode] = useState((expense?.mode ?? 'cash') as 'cash' | 'upi' | 'bank' | 'card');
  const [billName, setBillName] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [asking, setAsking] = useState(false);

  const paise = parseRupees(amount);
  const autoCharged =
    paise && smallLimit != null ? defaultChargedTo(paise, smallLimit) : ('shop' as const);
  const chargedNow = chargedTouched ? charged : autoCharged;

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

  const error = prepError ?? state.error;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-label-sm block">
          {t(`${f}.amount`)}
          <input
            name="amount"
            required
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} text-money-md`}
          />
        </label>
        <label className="text-label-sm block">
          {t(`${f}.date`)}
          <input
            name="date"
            required
            {...dateFieldProps}
            defaultValue={formatDisplayDate(expense?.date ?? today)}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-label-sm mb-1">{t(`${f}.category`)}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            return (
              <label
                key={c.id}
                className="text-caption flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--surface)] px-1 py-2 text-center font-semibold shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:text-[var(--accent-ink)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
              >
                <input
                  type="radio"
                  name="category"
                  value={c.id}
                  required
                  defaultChecked={expense?.categoryId === c.id}
                  className="sr-only"
                />
                <Icon size={20} aria-hidden="true" />
                {c.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Segmented
          name="paidBy"
          legend={t(`${f}.paidBy`)}
          options={['owner', 'shop_cash', 'staff'] as const}
          labels={t(`${f}.paidByOptions`, { returnObjects: true }) as Record<string, string>}
          value={paidBy}
          onChange={setPaidBy}
        />
        {paidBy === 'staff' && (
          <>
            <label className="text-label-sm block">
              {t(`${f}.whoPaid`)}
              <select
                name="paidByStaff"
                required
                defaultValue={expense?.paidByStaff ?? ''}
                className={inputClass}
              >
                <option value="" disabled>
                  {t(`${f}.chooseStaff`)}
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-body flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                name="reimburse"
                defaultChecked={expense ? expense.reimburse : true}
                className="h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              {t(`${f}.reimburse`)}
            </label>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Segmented
          name="chargedTo"
          legend={t(`${f}.chargedTo`)}
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
              defaultValue={expense?.chargedToStaff ?? ''}
              className={inputClass}
            >
              <option value="" disabled>
                {t(`${f}.chooseStaff`)}
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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

      <Segmented
        name="mode"
        legend={t(`${f}.paidWith`)}
        options={['cash', 'upi', 'bank', 'card'] as const}
        labels={t('salary.modes', { returnObjects: true }) as Record<string, string>}
        value={mode}
        onChange={setMode}
      />

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
              <input type="checkbox" name="removeBill" className="h-5 w-5 accent-[var(--accent)]" />
              {t(`${f}.billRemove`)}
            </label>
          </div>
        )}
        <label
          className={`${quietButtonClass} flex min-h-14 cursor-pointer items-center justify-center gap-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]`}
        >
          <Camera size={20} aria-hidden="true" />
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

      {error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`${buttonClass} inline-flex items-center justify-center gap-2`}
      >
        <Check size={20} aria-hidden="true" />
        {pending ? t(`${f}.saving`) : t(`${f}.save`)}
      </button>

      {expense && canDelete && (
        <div className="flex flex-col gap-1 border-t border-[var(--line)] pt-4">
          <button
            type="button"
            disabled={deleting}
            aria-busy={deleting}
            onClick={() =>
              asking
                ? startDelete(async () => {
                    await deleteExpense(expense.id, expense.date.slice(0, 7));
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
 * (×, Escape, the dimmed page) goes back to the month without the `edit` parameter.
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
