'use client';

import { createContext, useContext, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR, parseRupees } from '@fincrew/core';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';
import { inputClass } from '../../components';
import { addSalaryEntry, removeSalaryEntry } from './actions';

const PersonContext = createContext({ openPay: () => {}, closePay: () => {} });

/** Opens and closes the Pay now form for whatever holds it (`PayNowDialog`). */
export const PayContext = PersonContext.Provider;

/** Inside `PayNowDialog`: close the Pay now form. */
export function usePersonDialog() {
  return useContext(PersonContext);
}

export type AddLessEntry = { id?: string; kind: 'add' | 'less'; name: string; amount: number };

type Kind = AddLessEntry['kind'];

/**
 * Add or less (design "Web · check and finalize, add or less"): a drop-down button to add to this
 * month's salary or take something off, each with a name, as many as needed. Entries are saved at
 * once and the figures around them refresh; they can be removed until the salary is finalized.
 */
export function AddLess({
  year,
  month,
  staffId,
  entries,
  canEdit,
}: {
  year: number;
  month: number;
  staffId: string;
  entries: AddLessEntry[];
  canEdit: boolean;
}) {
  const a = 'salary.addLess';
  const router = useRouter();
  const [form, setForm] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const closeForm = () => {
    setForm(null);
    setName('');
    setAmount('');
    setError(null);
  };

  const save = () => {
    if (!form) return;
    if (!name.trim()) return setError(t(`${a}.needName`));
    const paise = parseRupees(amount);
    if (paise === null || paise <= 0) return setError(t(`${a}.needAmount`));
    start(async () => {
      const r = await addSalaryEntry(year, month, staffId, form, name, paise);
      if (r.ok) {
        toast.success(r.message);
        closeForm();
        router.refresh();
      } else setError(r.error);
    });
  };

  const remove = (entry: AddLessEntry) =>
    start(async () => {
      const r = await removeSalaryEntry(entry.id ?? '', entry.name);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">{t(`${a}.title`)}</span>
          {canEdit && <span className="text-xs text-[var(--ink-muted)]">{t(`${a}.hint`)}</span>}
        </span>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Plus aria-hidden="true" />
                {t(`${a}.button`)}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {(['add', 'less'] as const).map((kind) => (
                <DropdownMenuItem
                  key={kind}
                  className="flex-col items-start gap-0"
                  onSelect={() => {
                    setForm(kind);
                    setError(null);
                  }}
                >
                  <span className="font-semibold">{t(`${a}.${kind}`)}</span>
                  <span className="text-xs text-[var(--ink-muted)]">{t(`${a}.${kind}Hint`)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {form && (
        <form
          className="flex flex-col gap-2 rounded-lg bg-[var(--surface-muted)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <span className="text-sm font-semibold">{t(`${a}.${form}`)}</span>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
            <label className="min-w-0 text-xs font-medium text-[var(--ink-muted)]">
              {t(`${a}.name`)}
              <input
                autoFocus
                maxLength={60}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </label>
            <label className="min-w-0 text-xs font-medium text-[var(--ink-muted)]">
              {t(`${a}.amount`)}
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                placeholder="0.00"
                className={`${inputClass} tabular-nums`}
              />
            </label>
          </div>
          {error && (
            <span role="alert" className="text-xs text-[var(--status-absent)]">
              {error}
            </span>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={closeForm}>
              {t(`${a}.cancel`)}
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? t('salary.working') : t(`${a}.save`)}
            </Button>
          </div>
        </form>
      )}

      {entries.map((e, i) => {
        const add = e.kind === 'add';
        return (
          <div
            key={e.id ?? i}
            className="flex min-h-9 items-center gap-2.5 border-b border-[var(--line)] py-0.5 text-sm"
          >
            <span
              aria-hidden="true"
              className={`grid size-[22px] shrink-0 place-items-center rounded-full ${
                add
                  ? 'bg-[var(--status-present-soft)] text-[var(--status-present)]'
                  : 'bg-[var(--status-absent-soft)] text-[var(--status-absent)]'
              }`}
            >
              {add ? <Plus size={14} /> : <Minus size={14} />}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
            <span
              className={`tabular-nums ${add ? 'text-[var(--status-present)]' : 'text-[var(--status-absent)]'}`}
            >
              {add ? '+' : '−'}
              {formatINR(e.amount)}
            </span>
            {canEdit && e.id && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={t(`${a}.remove`, { name: e.name })}
                onClick={() => remove(e)}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        );
      })}
      {entries.length === 0 && !form && (
        <span className="text-[13px] text-[var(--ink-muted)]">{t(`${a}.none`)}</span>
      )}
    </section>
  );
}
