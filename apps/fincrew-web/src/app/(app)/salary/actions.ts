'use server';

import { revalidatePath } from 'next/cache';
import {
  finalizeSalary as finalizeShared,
  paySalary as payShared,
  type SalaryWriteResult,
} from '@fincrew/data';
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

/** Pay what's left of finalized payslips (one, or all in the run when `payslipId` is null). */
export async function paySalary(
  runId: string,
  payslipId: string | null,
  mode: string,
): Promise<ActionResult> {
  return withRunner(
    (supabase, me) => payShared(supabase, { ...me, runId, payslipId, mode, today: todayIST() }),
    (r) => t('salary.done.paid', { count: r.count }),
  );
}
