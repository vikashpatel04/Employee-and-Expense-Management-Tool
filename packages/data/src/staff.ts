import {
  runningBalances,
  type AdvanceCutMode,
  type BusinessDate,
  type LedgerLine,
  type LedgerType,
} from '@fincrew/core';
import type { Supabase } from './client';

export type StaffListItem = {
  id: string;
  name: string;
  phone: string | null;
  joiningDate: string;
  leavingDate: string | null;
  status: 'active' | 'left';
};

/** Everyone on the payroll (staff list), by name; filter and search happen on screen. */
export async function loadStaffList(supabase: Supabase, shopId: string): Promise<StaffListItem[]> {
  const { data } = await supabase
    .from('staff')
    .select('person_id, joining_date, leaving_date, status, people!inner(name, phone)')
    .eq('shop_id', shopId);
  return (data ?? [])
    .map((s) => ({
      id: s.person_id,
      name: s.people.name,
      phone: s.people.phone,
      joiningDate: s.joining_date,
      leavingDate: s.leaving_date,
      status: s.status as 'active' | 'left',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One person's details plus money: ledger balance and advance to recover (needs salary.view). */
export async function loadStaffOverview(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  withMoney: boolean,
) {
  const [{ data: s }, money] = await Promise.all([
    supabase
      .from('staff')
      .select(
        'person_id, joining_date, leaving_date, status, advance_limit_paise, advance_cut_paise, advance_cut_mode, expense_payback, expense_recover, people!inner(name, phone)',
      )
      .eq('person_id', staffId)
      .eq('shop_id', shopId)
      .maybeSingle(),
    withMoney
      ? Promise.all([
          supabase
            .from('ledger_balances')
            .select('balance_paise')
            .eq('staff_id', staffId)
            .maybeSingle(),
          supabase
            .from('advance_balances')
            .select('outstanding_paise')
            .eq('staff_id', staffId)
            .maybeSingle(),
          supabase
            .from('expense_balances')
            .select('payback_paise')
            .eq('staff_id', staffId)
            .maybeSingle(),
        ])
      : null,
  ]);
  if (!s) return null;
  return {
    id: s.person_id,
    name: s.people.name,
    phone: s.people.phone,
    joiningDate: s.joining_date,
    leavingDate: s.leaving_date,
    status: s.status as 'active' | 'left',
    advanceLimit: s.advance_limit_paise == null ? null : Number(s.advance_limit_paise),
    advanceCut: s.advance_cut_paise == null ? null : Number(s.advance_cut_paise),
    advanceMode: s.advance_cut_mode as AdvanceCutMode,
    expensePayback: s.expense_payback,
    expenseRecover: s.expense_recover,
    balance: money ? Number(money[0].data?.balance_paise ?? 0) : null,
    advance: money ? Number(money[1].data?.outstanding_paise ?? 0) : null,
    /** What the shop owes them for expenses they paid (Pay back now / the salary). */
    expenseOwed: money ? Number(money[2].data?.payback_paise ?? 0) : null,
  };
}

export type StaffOverview = NonNullable<Awaited<ReturnType<typeof loadStaffOverview>>>;

export type LedgerEntry = LedgerLine & {
  balance: number;
  note: string | null;
  mode: string | null;
  /** This line has been undone by a reversal. */
  undone: boolean;
};

/** A person's ledger, oldest first, with the running balance after each line (core rules). */
export async function loadLedger(supabase: Supabase, staffId: string): Promise<LedgerEntry[]> {
  const { data } = await supabase
    .from('ledger_entries')
    .select(
      'id, date, type, amount_paise, name, note, payment_mode, adjusts, reverses_id, created_at',
    )
    .eq('staff_id', staffId)
    .order('date')
    .order('created_at');
  const rows = data ?? [];
  const reversed = new Set(rows.map((l) => l.reverses_id).filter(Boolean));
  const extra = new Map(rows.map((l) => [l.id, l]));
  const lines: LedgerLine[] = rows.map((l) => ({
    id: l.id,
    date: l.date,
    type: l.type as LedgerType,
    amount: Number(l.amount_paise),
    name: l.name ?? undefined,
    adjusts: (l.adjusts ?? undefined) as LedgerType | undefined,
  }));
  return runningBalances(lines).map((l) => ({
    ...l,
    note: extra.get(l.id)?.note ?? null,
    mode: extra.get(l.id)?.payment_mode ?? null,
    undone: reversed.has(l.id),
  }));
}

/** Pay settings in effect `today`, their history, allowances, deductions and leave template. */
export async function loadPay(supabase: Supabase, staffId: string, today: BusinessDate) {
  const [{ data: pays }, { data: allowances }, { data: deductions }, { data: templates }] =
    await Promise.all([
      supabase
        .from('pay_settings')
        .select('*')
        .eq('staff_id', staffId)
        .order('effective_from', { ascending: false }),
      supabase.from('allowances').select('*').eq('staff_id', staffId).order('effective_from'),
      supabase.from('fixed_deductions').select('*').eq('staff_id', staffId).order('effective_from'),
      supabase
        .from('staff_leave_templates')
        .select('effective_from, template_id, leave_templates(name)')
        .eq('staff_id', staffId)
        .order('effective_from', { ascending: false }),
    ]);
  const amountOf = (p: NonNullable<typeof pays>[number]) =>
    Number(
      p.pay_type === 'monthly'
        ? p.monthly_salary_paise
        : p.pay_type === 'daily'
          ? p.daily_wage_paise
          : p.hourly_rate_paise,
    );
  const current = (pays ?? []).find((p) => p.effective_from <= today) ?? null;
  const template = (templates ?? []).find((a) => a.effective_from <= today) ?? null;
  const item = (a: {
    id: string;
    name: string;
    amount_paise: number;
    effective_from: string;
    effective_to: string | null;
    prorated?: boolean;
  }) => ({
    id: a.id,
    name: a.name,
    amount: Number(a.amount_paise),
    from: a.effective_from,
    to: a.effective_to,
    prorated: !!a.prorated,
    ended: a.effective_to != null && a.effective_to < today,
  });
  return {
    current: current && {
      payType: current.pay_type as 'monthly' | 'daily' | 'hourly',
      amount: amountOf(current),
      since: current.effective_from,
      overtime: current.overtime_rate_paise == null ? null : Number(current.overtime_rate_paise),
      shiftStart: current.shift_start,
      shiftEnd: current.shift_end,
      grace: current.grace_minutes,
      dayMinutes: current.day_minutes,
      ownRules:
        Object.keys(current.pay_rules_override ?? {}).length +
        Object.keys(current.late_policy_override ?? {}).length,
    },
    history: (pays ?? []).map((p) => ({
      id: p.id,
      since: p.effective_from,
      payType: p.pay_type as 'monthly' | 'daily' | 'hourly',
      amount: amountOf(p),
    })),
    allowances: (allowances ?? []).map(item),
    deductions: (deductions ?? []).map(item),
    template: template && {
      name: template.leave_templates?.name ?? '',
      since: template.effective_from,
    },
  };
}
