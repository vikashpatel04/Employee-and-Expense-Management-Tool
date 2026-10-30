import {
  addDays,
  businessDateOf,
  compareDates,
  formatDisplayDate,
  monthEnd,
  monthOf,
  monthStart,
  moneyNow,
  type AdvanceCutMode,
  type BusinessDate,
} from '@fincrew/core';
import type { Supabase } from './client';
import {
  loadAdvanceBalances,
  recordAdvance,
  undoLedgerLine,
  type AdvanceWriteResult,
} from './advances';
import { loadAttendanceMonth } from './attendance-month';
import { writeAttendance, type AttendanceWriteResult } from './attendance-write';
import { PAYMENT_MODES } from './expense-write';
import { paidLeaveShortfall } from './paid-leave';
import { loadMyPayslips } from './salary-run';
import { computeMonth } from './salary-month';
import { loadStaffOverview } from './staff';

// ---------------------------------------------------------------------------
// Attendance code (needs attendance.code; docs/features/staff-self-service.md)
// ---------------------------------------------------------------------------

export type AttendanceCode = { code: string; validFrom: string; nextChange: string | null };

/** Today's code (made on first use after the daily change), or null without permission. */
export async function loadAttendanceCode(
  supabase: Supabase,
  shopId: string,
): Promise<AttendanceCode | null> {
  const { data, error } = await supabase.rpc('attendance_code', { p_shop: shopId });
  return error ? null : (data as AttendanceCode);
}

/** A new code now; the old one (and its QR) stops working. */
export async function regenerateAttendanceCode(
  supabase: Supabase,
  shopId: string,
): Promise<AttendanceCode | null> {
  const { data, error } = await supabase.rpc('regenerate_attendance_code', { p_shop: shopId });
  return error ? null : (data as AttendanceCode);
}

export type CheckInRow = {
  staffId: string;
  name: string;
  /** Instants as ISO strings. */
  checkIn: string | null;
  checkOut: string | null;
  method: 'scan' | 'typed' | null;
  lateMinutes?: number;
};

/**
 * Today's self check-ins for the code screen: who checked in / out by code and how, minutes
 * late (same rule as the grid), and the attempts that were refused.
 */
export async function loadCheckIns(supabase: Supabase, shopId: string, today: BusinessDate) {
  const from = new Date(`${today}T00:00:00+05:30`).toISOString();
  const to = new Date(`${addDays(today, 1)}T00:00:00+05:30`).toISOString();
  const [{ data: scans }, month] = await Promise.all([
    supabase
      .from('attendance_scans')
      .select('staff_id, at, kind, method, result, staff!inner(people!inner(name))')
      .eq('shop_id', shopId)
      .gte('at', from)
      .lt('at', to)
      .order('at'),
    loadAttendanceMonth(supabase, shopId, monthOf(today).year, monthOf(today).month, today),
  ]);
  const cells = new Map(month.rows.map((r) => [r.staffId, r.cells.find((c) => c.date === today)]));
  const rows = new Map<string, CheckInRow>();
  const refused: { name: string; at: string; result: string }[] = [];
  for (const s of scans ?? []) {
    const name = s.staff.people.name;
    if (s.result !== 'accepted') {
      refused.push({ name, at: s.at, result: s.result });
      continue;
    }
    const row = rows.get(s.staff_id) ?? {
      staffId: s.staff_id,
      name,
      checkIn: null,
      checkOut: null,
      method: null,
      lateMinutes: cells.get(s.staff_id)?.lateMinutes,
    };
    if (s.kind === 'in') {
      row.checkIn = s.at;
      row.method = s.method as 'scan' | 'typed';
    } else row.checkOut = s.at;
    rows.set(s.staff_id, row);
  }
  const working = month.rows.filter((r) => {
    const st = cells.get(r.staffId)?.status;
    return (
      st && st !== 'not_employed' && st !== 'future' && st !== 'weekly_off' && st !== 'holiday'
    );
  }).length;
  return {
    rows: [...rows.values()].sort((a, b) => (b.checkIn ?? '').localeCompare(a.checkIn ?? '')),
    refused,
    working,
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type RequestItem = {
  id: string;
  staffId: string;
  name: string;
  kind: 'leave' | 'advance';
  from: string | null;
  to: string | null;
  amount: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  leaveStatus: 'paid_leave' | 'unpaid_leave' | null;
  /** The advance an approved advance request gave. */
  advanceId: string | null;
};

/** What helps decide: paid leave left for the days asked, or the advance state. */
export type RequestContext =
  | { kind: 'leave'; days: number; paidLeft: number | null }
  | {
      kind: 'advance';
      outstanding: number;
      limit: number | null;
      cut: number | null;
      mode: AdvanceCutMode;
    };

/** Leave days asked for, inclusive. */
export const requestDays = (from: string, to: string) => {
  const days: string[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) days.push(d);
  return days;
};

/**
 * Requests in a shop that this person may see (deciders: everyone's; staff: their own),
 * waiting ones oldest first, decided ones newest first (last 100).
 */
export async function loadRequests(
  supabase: Supabase,
  shopId: string,
  which: 'pending' | 'decided',
): Promise<RequestItem[]> {
  let q = supabase
    .from('requests')
    .select(
      '*, staff!inner(people!inner(name)), decider:people!requests_shop_id_decided_by_fkey(name)',
    )
    .eq('shop_id', shopId);
  q =
    which === 'pending'
      ? q.eq('status', 'pending').order('created_at', { ascending: true })
      : q.neq('status', 'pending').order('decided_at', { ascending: false }).limit(100);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    name: r.staff.people.name,
    kind: r.kind as RequestItem['kind'],
    from: r.from_date,
    to: r.to_date,
    amount: r.amount_paise == null ? null : Number(r.amount_paise),
    note: r.note,
    status: r.status as RequestItem['status'],
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedBy: r.decider?.name ?? null,
    decisionNote: r.decision_note,
    leaveStatus: r.leave_status as RequestItem['leaveStatus'],
    advanceId: r.advance_id,
  }));
}

/** Context for each waiting request (paid leave left; advance owed / limit / cut). */
export async function loadRequestContext(
  supabase: Supabase,
  shopId: string,
  items: RequestItem[],
): Promise<Map<string, RequestContext>> {
  const out = new Map<string, RequestContext>();
  const advances = items.some((i) => i.kind === 'advance')
    ? new Map((await loadAdvanceBalances(supabase, shopId)).all.map((b) => [b.staffId, b]))
    : new Map();
  for (const i of items) {
    if (i.kind === 'advance') {
      const b = advances.get(i.staffId);
      out.set(i.id, {
        kind: 'advance',
        outstanding: b?.outstanding ?? 0,
        limit: b?.limit ?? null,
        cut: b?.cut ?? null,
        mode: b?.mode ?? 'all',
      });
    } else if (i.from && i.to) {
      const days = requestDays(i.from, i.to);
      const short = await paidLeaveShortfall(
        supabase,
        shopId,
        days.map((date) => ({ staffId: i.staffId, date })),
      );
      out.set(i.id, { kind: 'leave', days: days.length, paidLeft: short ? short.left : null });
    }
  }
  return out;
}

/** How many requests are waiting (the dashboard / Today banner). */
export async function countPendingRequests(supabase: Supabase, shopId: string) {
  const { count } = await supabase
    .from('requests')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('status', 'pending');
  return count ?? 0;
}

export type DecideResult =
  | { ok: true }
  | { ok: false; reason: 'no_permission' | 'not_pending' }
  | Exclude<AttendanceWriteResult, { ok: true }>
  | Exclude<AdvanceWriteResult, { ok: true }>
  | { ok: false; reason: 'failed'; message: string };

/**
 * Approve or reject a waiting request (needs requests.decide). Approving leave marks the days
 * (`writeAttendance`, paid leave within the balance, future days allowed); approving an advance
 * gives it today (`recordAdvance`, the limit asks to confirm). Then the request is closed with
 * what was done.
 */
export async function decideRequest(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    today: BusinessDate;
    request: Pick<RequestItem, 'id' | 'staffId' | 'kind' | 'from' | 'to' | 'amount'>;
    decision: 'approve' | 'reject';
    leaveStatus?: 'paid_leave' | 'unpaid_leave';
    mode?: string;
    confirmOverLimit?: boolean;
    note?: string | null;
  },
): Promise<DecideResult> {
  const { request: r, shopId } = input;
  if (!input.permissions.includes('requests.decide')) return { ok: false, reason: 'no_permission' };
  const decisionNote = input.note?.trim() || null;

  let update: {
    status: string;
    leave_status?: string;
    advance_id?: string;
    decision_note: string | null;
  } = {
    status: 'rejected',
    decision_note: decisionNote,
  };
  if (input.decision === 'approve') {
    if (r.kind === 'leave' && r.from && r.to) {
      const leaveStatus = input.leaveStatus ?? 'paid_leave';
      const w = await writeAttendance(supabase, {
        shopId,
        cells: requestDays(r.from, r.to).map((date) => ({ staffId: r.staffId, date })),
        status: leaveStatus,
        today: input.today,
        permissions: input.permissions,
        allowFuture: true,
      });
      if (!w.ok) return w;
      update = { status: 'approved', leave_status: leaveStatus, decision_note: decisionNote };
    } else if (r.kind === 'advance' && r.amount) {
      const a = await recordAdvance(supabase, {
        shopId,
        permissions: input.permissions,
        staffId: r.staffId,
        kind: 'given',
        amount: (r.amount / 100).toFixed(2),
        date: formatDisplayDate(input.today),
        mode: PAYMENT_MODES.find((m) => m === input.mode) ?? 'cash',
        note: decisionNote,
        confirmOverLimit: input.confirmOverLimit,
      });
      if (!a.ok) return a;
      update = { status: 'approved', advance_id: a.id, decision_note: decisionNote };
    }
  }
  const { data, error } = await supabase
    .from('requests')
    .update(update)
    .eq('id', r.id)
    .eq('status', 'pending')
    .select('id');
  if (error) return { ok: false, reason: 'failed', message: error.message };
  if (!data?.length) return { ok: false, reason: 'not_pending' };
  return { ok: true };
}

/**
 * Reject a request that was approved earlier (needs requests.decide; owner 30/10/2026). What the
 * approval did is undone first: leave days still marked with the approved leave are cleared
 * (attendance.mark, and attendance.edit_past for past days); an advance is undone with an exact
 * reversal (salary.undo_payment), refused once part of it has been recovered. Then the request
 * is closed as rejected. Safe to try again: an undone advance is not undone twice.
 */
export async function rejectApprovedRequest(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    today: BusinessDate;
    requestId: string;
    note?: string | null;
  },
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: 'no_permission' | 'not_approved' | 'past' | 'attendance' | 'undo' | 'recovered';
    }
  | { ok: false; reason: 'failed'; message: string }
> {
  const { shopId, permissions, today } = input;
  if (!permissions.includes('requests.decide')) return { ok: false, reason: 'no_permission' };
  const { data: r } = await supabase
    .from('requests')
    .select('id, staff_id, kind, from_date, to_date, status, leave_status, advance_id')
    .eq('id', input.requestId)
    .eq('shop_id', shopId)
    .maybeSingle();
  if (!r || r.status !== 'approved') return { ok: false, reason: 'not_approved' };

  if (r.kind === 'leave' && r.from_date && r.to_date && r.leave_status) {
    if (!permissions.includes('attendance.mark')) return { ok: false, reason: 'attendance' };
    if (compareDates(r.from_date, today) < 0 && !permissions.includes('attendance.edit_past'))
      return { ok: false, reason: 'past' };
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('shop_id', shopId)
      .eq('staff_id', r.staff_id)
      .eq('status', r.leave_status)
      .gte('date', r.from_date)
      .lte('date', r.to_date);
    if (error) return { ok: false, reason: 'failed', message: error.message };
  }

  if (r.kind === 'advance' && r.advance_id) {
    const { data: line } = await supabase
      .from('ledger_entries')
      .select('id, amount_paise')
      .eq('ref_table', 'advances')
      .eq('ref_id', r.advance_id)
      .maybeSingle();
    if (!line) return { ok: false, reason: 'failed', message: '—' };
    const { data: reversal } = await supabase
      .from('ledger_entries')
      .select('id')
      .eq('reverses_id', line.id)
      .maybeSingle();
    if (!reversal) {
      if (!permissions.includes('salary.undo_payment')) return { ok: false, reason: 'undo' };
      const { data: bal } = await supabase
        .from('advance_balances')
        .select('outstanding_paise')
        .eq('staff_id', r.staff_id)
        .maybeSingle();
      if (Number(bal?.outstanding_paise ?? 0) < -Number(line.amount_paise))
        return { ok: false, reason: 'recovered' };
      const u = await undoLedgerLine(supabase, {
        shopId,
        permissions,
        staffId: r.staff_id,
        lineId: line.id,
        today,
      });
      if (!u.ok) return u.reason === 'no_permission' ? { ok: false, reason: 'undo' } : u;
    }
  }

  const { data, error } = await supabase
    .from('requests')
    .update({ status: 'rejected', decision_note: input.note?.trim() || null })
    .eq('id', r.id)
    .eq('status', 'approved')
    .select('id');
  if (error) return { ok: false, reason: 'failed', message: error.message };
  if (!data?.length) return { ok: false, reason: 'not_approved' };
  return { ok: true };
}

/**
 * Staffora: ask for leave (dates) or an advance (paise) for yourself. Leave on a day already in
 * a waiting or approved leave request, or already marked as leave, is refused (`duplicate`); the
 * database checks the same.
 */
export async function askRequest(
  supabase: Supabase,
  input: { shopId: string; staffId: string; note?: string | null } & (
    { kind: 'leave'; from: BusinessDate; to: BusinessDate } | { kind: 'advance'; amount: number }
  ),
): Promise<{ ok: true } | { ok: false; reason: 'duplicate' | 'failed'; message: string }> {
  if (input.kind === 'leave') {
    const [{ data: asked }, { data: marked }] = await Promise.all([
      supabase
        .from('requests')
        .select('id')
        .eq('staff_id', input.staffId)
        .eq('kind', 'leave')
        .in('status', ['pending', 'approved'])
        .lte('from_date', input.to)
        .gte('to_date', input.from)
        .limit(1),
      supabase
        .from('attendance')
        .select('date')
        .eq('staff_id', input.staffId)
        .in('status', ['paid_leave', 'unpaid_leave'])
        .gte('date', input.from)
        .lte('date', input.to)
        .limit(1),
    ]);
    if (asked?.length || marked?.length) return { ok: false, reason: 'duplicate', message: '' };
  }
  const { error } = await supabase.from('requests').insert({
    shop_id: input.shopId,
    staff_id: input.staffId,
    kind: input.kind,
    from_date: input.kind === 'leave' ? input.from : null,
    to_date: input.kind === 'leave' ? input.to : null,
    amount_paise: input.kind === 'advance' ? input.amount : null,
    note: input.note?.trim() || null,
  });
  if (!error) return { ok: true };
  return {
    ok: false,
    reason: error.code === '23505' ? 'duplicate' : 'failed',
    message: error.message,
  };
}

/** Staffora: cancel your own waiting request. */
export async function cancelRequest(supabase: Supabase, requestId: string) {
  const { data, error } = await supabase
    .from('requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  return !error && (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Staffora sign-in (needs staff.edit)
// ---------------------------------------------------------------------------

export type StaffLogin = {
  personId: string;
  hasPin: boolean;
  locked: boolean;
  waitUntil: string | null;
  phoneBound: boolean;
};

/** Sign-in state per person (not the owner); empty without staff.edit. */
export async function loadStaffLogins(supabase: Supabase, shopId: string) {
  const { data } = await supabase.rpc('staff_logins', { p_shop: shopId });
  return new Map<string, StaffLogin>(
    (data ?? []).map((r) => [
      r.person_id,
      {
        personId: r.person_id,
        hasPin: r.has_pin,
        locked: r.locked,
        waitUntil: r.wait_until,
        phoneBound: r.phone_bound,
      },
    ]),
  );
}

/** Forgot the PIN: remove it; the person sets a new one in Staffora on their phone. */
export async function resetPin(supabase: Supabase, personId: string) {
  return !(await supabase.rpc('reset_pin', { p_person: personId })).error;
}

export async function unlockLogin(supabase: Supabase, personId: string) {
  return !(await supabase.rpc('unlock_login', { p_person: personId })).error;
}

export async function resetStaffPhone(supabase: Supabase, personId: string) {
  return !(await supabase.rpc('reset_staff_phone', { p_person: personId })).error;
}

/** Turn checking in with the attendance code on or off for a person (needs staff.edit). */
export async function setSelfAttendance(supabase: Supabase, staffId: string, on: boolean) {
  const { data, error } = await supabase
    .from('staff')
    .update({ self_attendance: on })
    .eq('person_id', staffId)
    .select('person_id');
  return !error && (data ?? []).length > 0;
}

/** "In 13 h 45 min"-style helper input: minutes until an instant (never negative). */
export const minutesUntil = (iso: string, now = new Date()) =>
  Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 60_000));

/** The business date of an ISO instant (IST). */
export const dateOfInstant = (iso: string) => businessDateOf(new Date(iso));

// ---------------------------------------------------------------------------
// Staffora money (owner 30/10/2026)
// ---------------------------------------------------------------------------

/**
 * Staffora's Money card: where my money stands right now (core `moneyNow`): my ledger balance
 * (finalized salary, advances, expenses, payments) plus the salary so far of each month not
 * finalized yet: this month, and last month while it has marked days and no finalized payslip.
 * Each such month is worked out live with the shared salary rules (`computeMonth`; RLS gives
 * staff only their own rows), so it is "Not finalized yet" and changes until the shop
 * finalizes it. Once paid, the balance is 0 and only the new month's salary so far remains.
 */
export async function loadMyMoney(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  today: BusinessDate,
) {
  const current = monthOf(today);
  const prev =
    current.month === 1
      ? { year: current.year - 1, month: 12 }
      : { year: current.year, month: current.month - 1 };
  const [overview, payslips, { data: prevMarked }] = await Promise.all([
    loadStaffOverview(supabase, shopId, staffId, true),
    loadMyPayslips(supabase, staffId),
    supabase
      .from('attendance')
      .select('date')
      .eq('staff_id', staffId)
      .gte('date', monthStart(prev.year, prev.month))
      .lte('date', monthEnd(prev.year, prev.month))
      .limit(1),
  ]);
  if (!overview) return null;
  const finalized = new Set(payslips.map((p) => p.year * 12 + p.month));
  const open = [...(prevMarked?.length ? [prev] : []), current].filter(
    (m) => !finalized.has(m.year * 12 + m.month),
  );
  const months = (
    await Promise.all(
      open.map(async (m) => {
        const mine = (await computeMonth(supabase, shopId, m.year, m.month)).find(
          (p) => p.staffId === staffId,
        );
        return mine
          ? {
              ...m,
              amount: mine.result.netBeforeAdvance,
              payableDays: mine.result.summary.payableDays,
              employedDays: mine.result.summary.employedDays,
            }
          : null;
      }),
    )
  ).filter((m) => m !== null);
  return {
    overview,
    months,
    now: moneyNow({
      balance: overview.balance ?? 0,
      advance: overview.advance ?? 0,
      expenseOwed: overview.expenseOwed ?? 0,
      expenseCharged: overview.expenseCharged ?? 0,
      unfinalized: months.map((m) => m.amount),
    }),
  };
}
