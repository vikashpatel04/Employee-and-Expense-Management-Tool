import { parseDisplayDate, parseRupees, type BusinessDate } from '@fincrew/core';
import type { Supabase } from './client';
import { PAYMENT_MODES } from './expense-write';

export type AdvanceBalance = {
  staffId: string;
  name: string;
  outstanding: number;
  /** Monthly cut and limit; null = decide at each salary run / no limit. */
  cut: number | null;
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
      .select('staff_id, outstanding_paise, advance_limit_paise, advance_cut_paise')
      .eq('shop_id', shopId),
    supabase.from('staff').select('person_id, people!inner(name)').eq('shop_id', shopId),
  ]);
  const names = new Map((staff ?? []).map((s) => [s.person_id, s.people.name]));
  const all: AdvanceBalance[] = (balances ?? []).map((b) => ({
    staffId: b.staff_id!,
    name: names.get(b.staff_id!) ?? '',
    outstanding: Number(b.outstanding_paise ?? 0),
    cut: b.advance_cut_paise == null ? null : Number(b.advance_cut_paise),
    limit: b.advance_limit_paise == null ? null : Number(b.advance_limit_paise),
  }));
  const rows = all.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  return { rows, all, total: rows.reduce((a, r) => a + r.outstanding, 0) };
}

export type AdvanceWriteResult =
  | { ok: true; kind: 'given' | 'repaid' }
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

  const { error } = await supabase.from('advances').insert({
    shop_id: input.shopId,
    staff_id: input.staffId,
    date,
    kind,
    amount_paise: amount,
    payment_mode: mode,
    note: input.note?.trim() || null,
    over_limit_confirmed: !!input.confirmOverLimit,
  });
  if (error) {
    if (error.hint === 'over_limit') return { ok: false, reason: 'over_limit' };
    return { ok: false, reason: 'failed', message: error.message };
  }
  return { ok: true, kind };
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
