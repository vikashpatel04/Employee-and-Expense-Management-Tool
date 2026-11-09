'use server';

import { revalidatePath } from 'next/cache';
import {
  addSalaryEntry as addEntryShared,
  finalizeSalary as finalizeShared,
  payEarly as payEarlyShared,
  paySalary as payShared,
  previewNewCycle,
  removeSalaryEntry as removeEntryShared,
  startNewCycle as startNewCycleShared,
  type NewCyclePreview,
  type SalaryEntry,
  type SalaryWriteResult,
} from '@fincrew/data';
import type { BusinessDate } from '@fincrew/core';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** The shared salary steps (`@fincrew/data`) with the website's messages. */
async function withRunner(
  step: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    me: NonNullable<Awaited<ReturnType<typeof requireMe>>>,
  ) => Promise<SalaryWriteResult>,
  done: (r: Extract<SalaryWriteResult, { ok: true }>) => string,
): Promise<ActionResult> {
  const me = await requireMe();
  if (!me) return { ok: false, error: t('salary.errors.noPermission') };
  const r = await step(await createClient(), me);
  if (!r.ok)
    return {
      ok: false,
      error:
        r.reason === 'no_permission'
          ? t('salary.errors.noPermission')
          : t('salary.errors.failed', { reason: r.message }),
    };
  revalidatePath('/salary');
  return { ok: true, message: done(r) };
}

/**
 * Finalize these people's salary for the month (live figures saved and locked; see
 * `finalizeSalary` in `@fincrew/data`): posts each payslip to the ledger.
 */
export async function finalizeSalary(
  year: number,
  month: number,
  staffIds: string[],
): Promise<ActionResult> {
  return withRunner(
    (supabase, me) => finalizeShared(supabase, { ...me, year, month, staffIds }),
    (r) => t('salary.done.finalized', { count: r.count }),
  );
}

/** Add a named amount to one month's salary, or take one off. `amount` is in paise. */
export async function addSalaryEntry(
  year: number,
  month: number,
  staffId: string,
  kind: SalaryEntry['kind'],
  name: string,
  amount: number,
): Promise<ActionResult> {
  return withRunner(
    (supabase, me) => addEntryShared(supabase, { ...me, year, month, staffId, kind, name, amount }),
    () => t(`salary.addLess.${kind === 'add' ? 'added' : 'taken'}`, { name: name.trim() }),
  );
}

/** Remove an add or less entry, until the salary is finalized. */
export async function removeSalaryEntry(id: string, name: string): Promise<ActionResult> {
  return withRunner(
    (supabase, me) => removeEntryShared(supabase, { ...me, id }),
    () => t('salary.addLess.removed', { name }),
  );
}

/**
 * Pay what's left of finalized payslips (one, or all in the run when `payslipId` is null), dated
 * `date` (Paid on). `amount` (paise, one payslip only) pays part of it.
 */
export async function paySalary(
  runId: string,
  payslipId: string | null,
  mode: string,
  date: BusinessDate,
  amount: number | null = null,
): Promise<ActionResult> {
  return withRunner(
    (supabase, me) =>
      payShared(supabase, { ...me, runId, payslipId, mode, date, amount, today: todayIST() }),
    (r) => t('salary.done.paid', { count: r.count }),
  );
}

/** Pay now, keeping the pay day: any amount towards a salary not finalized yet. */
export async function payEarly(
  year: number,
  month: number,
  staffId: string,
  amount: number,
  date: BusinessDate,
  mode: string,
): Promise<ActionResult> {
  return withRunner(
    (supabase, me) =>
      payEarlyShared(supabase, {
        ...me,
        staffId,
        year,
        month,
        amount,
        date,
        mode,
        today: todayIST(),
      }),
    () => t('salary.done.paid', { count: 1 }),
  );
}

/** Pay now with a new cycle: pay up to `upTo`, finalize, move the pay day to the day after, pay. */
export async function startNewCycle(
  year: number,
  month: number,
  staffId: string,
  upTo: BusinessDate,
  paidOn: BusinessDate,
  mode: string,
): Promise<ActionResult> {
  return withRunner(
    (supabase, me) =>
      startNewCycleShared(supabase, {
        ...me,
        staffId,
        year,
        month,
        upTo,
        paidOn,
        mode,
        today: todayIST(),
      }),
    () => t('salary.done.finalized', { count: 1 }),
  );
}

/** What paying up to `upTo` with a new cycle after would mean, for the Pay now form (reads only). */
export async function previewCycle(
  year: number,
  month: number,
  staffId: string,
  upTo: BusinessDate,
): Promise<NewCyclePreview> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('salary.run'))
    return { ok: false, reason: 'not_found' } as NewCyclePreview;
  return previewNewCycle(await createClient(), me.shopId, staffId, year, month, upTo, todayIST());
}
