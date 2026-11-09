'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  formatDisplayDate,
  formatINR,
  paiseToInput,
  parseDisplayDate,
  parseRupees,
} from '@fincrew/core';
import { t } from '@/lib/i18n';
import { inputClass } from '../../components';
import type { ActionResult } from './actions';

/** Runs a bound server action; the result shows as a toast and the page refreshes. */
function useRunner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(r.message);
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  return [pending, run] as const;
}

/**
 * A button that runs a bound server action (work out, finalize). With `confirm` it asks first
 * in a dialog: finalizing posts permanent ledger lines.
 */
export function ActionButton({
  action,
  label,
  working,
  variant = 'secondary',
  disabled,
  confirm,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  working: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  confirm?: { title: string; body: string };
}) {
  const [pending, run] = useRunner();
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      variant={variant === 'primary' ? 'default' : 'outline'}
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={confirm ? undefined : () => run(action)}
    >
      {pending ? working : label}
    </Button>
  );
  if (!confirm) return button;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            aria-busy={pending}
            onClick={(e) => {
              e.preventDefault();
              run(action, () => setOpen(false));
            }}
          >
            {pending ? working : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Pay button → dialog with how it was paid, then Pay; `pay(mode)` is a bound server action. */
export function PayControl({
  pay,
  label,
  modeLabel,
  modes,
  working,
  title,
  body,
  variant = 'primary',
  today,
  due,
}: {
  pay: (mode: string, date: string, amount: number | null) => Promise<ActionResult>;
  label: string;
  modeLabel: string;
  modes: Record<string, string>;
  working: string;
  title: string;
  body: string;
  variant?: 'primary' | 'secondary';
  /** Today, the default Paid on. */
  today: string;
  /** One person's still to pay: shows an amount field to pay part of it. */
  due?: number;
}) {
  const [mode, setMode] = useState('cash');
  const [paidOn, setPaidOn] = useState(formatDisplayDate(today));
  const [amount, setAmount] = useState(due ? paiseToInput(due) : '');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, run] = useRunner();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant === 'primary' ? 'default' : 'outline'}>
          <IndianRupee aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {due !== undefined && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-amount">{t('salary.payNow.amount')}</Label>
            <input
              id="pay-amount"
              value={amount}
              inputMode="decimal"
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className={`${inputClass} mt-0 tabular-nums`}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-date">{t('salary.payNow.paidOn')}</Label>
          <input
            id="pay-date"
            value={paidOn}
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            onChange={(e) => {
              setPaidOn(e.target.value);
              setError(null);
            }}
            className={`${inputClass} mt-0 tabular-nums`}
          />
          <span className="text-xs text-[var(--ink-muted)]">
            {t('salary.payNow.paidOnHint', { date: formatDisplayDate(today) })}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-mode">{modeLabel}</Label>
          <select
            id="pay-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className={inputClass}
          >
            {Object.entries(modes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <span role="alert" className="text-xs text-[var(--status-absent)]">
            {error}
          </span>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              const date = parseDisplayDate(paidOn);
              if (!date) return setError(t('salary.payNow.problems.date'));
              if (date > today)
                return setError(
                  t('salary.payNow.problems.future', { today: formatDisplayDate(today) }),
                );
              const part = due !== undefined ? parseRupees(amount) : null;
              if (due !== undefined && (part === null || part <= 0 || part > due))
                return setError(t('salary.payNow.problems.payAmount', { amount: formatINR(due) }));
              run(
                () => pay(mode, date, part !== null && part < (due ?? 0) ? part : null),
                () => setOpen(false),
              );
            }}
          >
            {pending ? working : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
