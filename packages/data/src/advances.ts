import {
  parseDisplayDate,
  parseRupees,
  type AdvanceCutMode,
  type BusinessDate,
} from '@fincrew/core';
import type { Supabase } from './client';
import { PAYMENT_MODES } from './expense-write';

export type AdvanceBalance = {
  staffId: string;
  name: string;
  outstanding: number;
  /** Monthly cut (used when mode is fixed) and limit; null = none set / no limit. */
  cut: number | null;
  mode: AdvanceCutMode;
  limit: number | null;
};

/**
 * Everyone who still owes advances (`rows`, biggest first) with the shop total; `all` has every
 * person's balance, cut and limit (for the give-advance form).
 */
export async function loadAdvanceBalances(supabase: Supabase, shopId: string) {
  const [{ data: balances }, { data: staff }] = await Promise.all([
    supabase
      .from('advance_balances')
      .select(
        'staff_id, outstanding_paise, advance_limit_paise, advance_cut_paise, advance_cut_mode',
      )
      .eq('shop_id', shopId),
    supabase.from('staff').select('person_id, people!inner(name)').eq('shop_id', shopId),
  ]);
  const names = new Map((staff ?? []).map((s) => [s.person_id, s.people.name]));
  const all: AdvanceBalance[] = (balances ?? []).map((b) => ({
    staffId: b.staff_id!,
    name: names.get(b.staff_id!) ?? '',
    outstanding: Number(b.outstanding_paise ?? 0),
    cut: b.advance_cut_paise == null ? null : Number(b.advance_cut_paise),
    mode: (b.advance_cut_mode ?? 'all') as AdvanceCutMode,
    limit: b.advance_limit_paise == null ? null : Number(b.advance_limit_paise),
  }));
  const rows = all.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  return { rows, all, total: rows.reduce((a, r) => a + r.outstanding, 0) };
}

export type AdvanceWriteResult =
  | { ok: true; kind: 'given' | 'repaid'; id: string }
  | { ok: false; reason: 'no_permission' | 'amount' | 'date' | 'over_limit' }
  | { ok: false; reason: 'failed'; message: string };

/**
 * Give an advance or record cash repaid (needs advances.give). The database posts the ledger line
 * and refuses an advance past the person's limit unless `confirmOverLimit` (PLAN §4.7): the
 * screen then asks and sends it again confirmed.
 */
export async function recordAdvance(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    staffId: string;
    kind: 'given' | 'repaid';
    /** As typed: rupees and DD/MM/YYYY. */
    amount: string;
    date: string;
    mode: string;
    note?: string | null;
    confirmOverLimit?: boolean;
  },
): Promise<AdvanceWriteResult> {
  if (!input.permissions.includes('advances.give')) return { ok: false, reason: 'no_permission' };
  const kind = input.kind === 'repaid' ? 'repaid' : 'given';
  const amount = parseRupees(input.amount.trim());
  if (!amount) return { ok: false, reason: 'amount' };
  const date = parseDisplayDate(input.date.trim());
  if (!date) return { ok: false, reason: 'date' };
  const mode = PAYMENT_MODES.find((m) => m === input.mode) ?? 'cash';

  const { data, error } = await supabase
    .from('advances')
    .insert({
      shop_id: input.shopId,
      staff_id: input.staffId,
      date,
      kind,
      amount_paise: amount,
      payment_mode: mode,
      note: input.note?.trim() || null,
      over_limit_confirmed: !!input.confirmOverLimit,
    })
    .select('id')
    .single();
  if (error) {
    if (error.hint === 'over_limit') return { ok: false, reason: 'over_limit' };
    return { ok: false, reason: 'failed', message: error.message };
  }
  return { ok: true, kind, id: data.id };
}

/** What the shop still owes a person for expenses they paid (to pay back now or with salary). */
export async function loadExpenseOwed(supabase: Supabase, staffId: string): Promise<number> {
  const { data } = await supabase
    .from('expense_balances')
    .select('payback_paise')
    .eq('staff_id', staffId)
    .maybeSingle();
  return Number(data?.payback_paise ?? 0);
}

export type PayBackResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_permission' | 'amount' | 'date' | 'too_much' }
  | { ok: false; reason: 'failed'; message: string };

/**
 * Pay a staff member back now for expenses they paid for the shop (needs salary.run; owner,
 * 29/10/2026): a `reimbursement_paid` ledger line, so the salary no longer pays it. The database
 * refuses more than the shop owes them for expenses; undo it like a payment.
 */
export async function payBackExpenses(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    staffId: string;
    /** As typed: rupees and DD/MM/YYYY. */
    amount: string;
    date: string;
    mode: string;
    note?: string | null;
  },
): Promise<PayBackResult> {
  if (!input.permissions.includes('salary.run')) return { ok: false, reason: 'no_permission' };
  const amount = parseRupees(input.amount.trim());
  if (!amount) return { ok: false, reason: 'amount' };
  const date = parseDisplayDate(input.date.trim());
  if (!date) return { ok: false, reason: 'date' };
  const mode = PAYMENT_MODES.find((m) => m === input.mode) ?? 'cash';
  const { data, error } = await supabase
    .from('ledger_entries')
    .insert({
      shop_id: input.shopId,
      staff_id: input.staffId,
      date,
      type: 'reimbursement_paid',
      amount_paise: -amount,
      payment_mode: mode,
      note: input.note?.trim() || null,
    })
    .select('id')
    .single();
  if (error) {
    if (/more than the shop owes/.test(error.message)) return { ok: false, reason: 'too_much' };
    return { ok: false, reason: 'failed', message: error.message };
  }
  return { ok: true, id: data.id };
}

/**
 * Undo a ledger line (payment or advance) with an exact reversal, once (needs
 * salary.undo_payment; PLAN §4.7). The database refuses a second reversal.
 */
export async function undoLedgerLine(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    staffId: string;
    lineId: string;
    today: BusinessDate;
  },
): Promise<
  | { ok: true }
  | { ok: false; reason: 'no_permission' }
  | { ok: false; reason: 'failed'; message: string }
> {
  if (!input.permissions.includes('salary.undo_payment'))
    return { ok: false, reason: 'no_permission' };
  const { data: line } = await supabase
    .from('ledger_entries')
    .select('amount_paise, staff_id')
    .eq('id', input.lineId)
    .maybeSingle();
  if (!line || line.staff_id !== input.staffId)
    return { ok: false, reason: 'failed', message: '—' };
  const { error } = await supabase.from('ledger_entries').insert({
    shop_id: input.shopId,
    staff_id: input.staffId,
    date: input.today,
    type: 'reversal',
    amount_paise: -Number(line.amount_paise),
    reverses_id: input.lineId,
  });
  if (error) return { ok: false, reason: 'failed', message: error.message };
  return { ok: true };
}
