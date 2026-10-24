'use server';

import { revalidatePath } from 'next/cache';
import type { Json } from '@fincrew/db';
import { computeMonth, paidByPayslip, sameJson } from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (reason: string): ActionResult => ({
  ok: false,
  error: t('salary.errors.failed', { reason }),
});

async function salaryRunner() {
  const me = await requireMe();
  if (!me || !me.permissions.includes('salary.run')) return null;
  return { me, supabase: await createClient() };
}

/**
 * Work out (or work out again) every payslip of a month with packages/core. A draft is updated in
 * place; a finalized payslip gets a new revision only when something changed (finalizing that
 * posts just the differences to the ledger).
 */
export async function runSalary(year: number, month: number): Promise<ActionResult> {
  const ctx = await salaryRunner();
  if (!ctx) return { ok: false, error: t('salary.errors.noPermission') };
  const { me, supabase } = ctx;

  let { data: run } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('shop_id', me.shopId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!run) {
    const { data, error } = await supabase
      .from('salary_runs')
      .insert({ shop_id: me.shopId, year, month, created_by: me.personId })
      .select('id')
      .single();
    if (error) return fail(error.message);
    run = data;
  }

  const [people, { data: existing }] = await Promise.all([
    computeMonth(supabase, me.shopId, year, month),
    supabase
      .from('payslips')
      .select('id, staff_id, revision, status, lines, advance_cut_paise')
      .eq('run_id', run.id)
      .order('revision', { ascending: false }),
  ]);
  const latest = new Map<string, NonNullable<typeof existing>[number]>();
  for (const p of existing ?? []) if (!latest.has(p.staff_id)) latest.set(p.staff_id, p);

  let created = 0;
  let updated = 0;
  for (const p of people) {
    const r = p.result;
    const warnings = [
      ...r.warnings,
      ...(p.leaveOverBalance ? [{ code: 'paid_leave_over_balance' }] : []),
    ];
    // Core results are plain JSON; jsonb columns store them as-is.
    const json = (v: unknown) => v as Json;
    const row = {
      lines: json(r.lines),
      summary: json(r.summary),
      warnings: json(warnings),
      leave: json(p.leave),
      gross_paise: r.gross,
      deductions_paise: r.deductions,
      net_before_advance_paise: r.netBeforeAdvance,
      advance_cut_paise: r.advanceCut,
      net_pay_paise: r.netPay,
    };
    const prev = latest.get(p.staffId);
    if (prev?.status === 'draft') {
      const { error } = await supabase.from('payslips').update(row).eq('id', prev.id);
      if (error) return fail(error.message);
      updated++;
    } else if (
      !prev ||
      !sameJson(prev.lines, r.lines) ||
      Number(prev.advance_cut_paise) !== r.advanceCut
    ) {
      const { error } = await supabase
        .from('payslips')
        .insert({ ...row, shop_id: me.shopId, run_id: run.id, staff_id: p.staffId });
      if (error) return fail(error.message);
      created++;
    }
  }

  revalidatePath('/salary');
  return { ok: true, message: t('salary.done.run', { created, updated }) };
}

/** Finalize one draft, or every draft of the run: posts each payslip to the ledger. */
export async function finalizeSalary(runId: string, payslipId?: string): Promise<ActionResult> {
  const ctx = await salaryRunner();
  if (!ctx) return { ok: false, error: t('salary.errors.noPermission') };
  let query = ctx.supabase.from('payslips').select('id').eq('run_id', runId).eq('status', 'draft');
  if (payslipId) query = query.eq('id', payslipId);
  const { data: drafts } = await query;
  for (const d of drafts ?? []) {
    const { error } = await ctx.supabase.rpc('finalize_payslip', { p_payslip: d.id });
    if (error) return fail(error.message);
  }
  revalidatePath('/salary');
  return { ok: true, message: t('salary.done.finalized', { count: drafts?.length ?? 0 }) };
}

/** Pay what's left of finalized payslips (one, or all in the run when `payslipId` is null). */
export async function paySalary(
  runId: string,
  payslipId: string | null,
  mode: string,
): Promise<ActionResult> {
  const ctx = await salaryRunner();
  if (!ctx) return { ok: false, error: t('salary.errors.noPermission') };
  if (!['cash', 'upi', 'bank', 'card'].includes(mode)) return fail(mode);
  const { me, supabase } = ctx;

  let query = supabase
    .from('payslips')
    .select('id, staff_id, revision, net_pay_paise')
    .eq('run_id', runId)
    .eq('status', 'finalized')
    .order('revision', { ascending: false });
  if (payslipId) query = query.eq('id', payslipId);
  const { data: slips } = await query;
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.staff_id)) latest.set(s.staff_id, s);
  const ids = [...latest.values()].map((s) => s.id);
  const paid = await paidByPayslip(supabase, ids);

  let count = 0;
  for (const s of latest.values()) {
    const left = Number(s.net_pay_paise) - (paid.get(s.id) ?? 0);
    if (left <= 0) continue;
    const { error } = await supabase.from('ledger_entries').insert({
      shop_id: me.shopId,
      staff_id: s.staff_id,
      date: todayIST(),
      type: 'salary_payment',
      amount_paise: -left,
      payment_mode: mode,
      ref_table: 'payslips',
      ref_id: s.id,
    });
    if (error) return fail(error.message);
    count++;
  }
  revalidatePath('/salary');
  return { ok: true, message: t('salary.done.paid', { count }) };
}
