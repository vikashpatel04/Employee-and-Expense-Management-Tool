'use server';

import { revalidatePath } from 'next/cache';
import { decideRequest, rejectApprovedRequest, type DecideResult } from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type DecideState = { error?: string; done?: string; needsConfirm?: boolean };

/** A refused decision → the message the card shows. */
function message(r: Exclude<DecideResult, { ok: true }>): DecideState {
  const e = 'requests.errors';
  switch (r.reason) {
    case 'no_permission':
      return { error: t(`${e}.noPermission`) };
    case 'not_pending':
      return { error: t(`${e}.notPending`) };
    case 'leave':
      return { error: t(`${e}.leave`, { name: r.name, left: r.left }) };
    case 'past':
      return { error: t(`${e}.past`) };
    case 'over_limit':
      return { needsConfirm: true };
    case 'failed':
      return { error: t(`${e}.failed`, { reason: r.message }) };
    default:
      return { error: t(`${e}.failed`, { reason: r.reason }) };
  }
}

/**
 * Approve or reject a waiting request with the shared rules (`decideRequest` in
 * `@fincrew/data`): leave marks the days, an advance is given today.
 */
export async function decideAction(input: {
  requestId: string;
  decision: 'approve' | 'reject';
  leaveStatus?: 'paid_leave' | 'unpaid_leave';
  mode?: string;
  note?: string;
  confirmOverLimit?: boolean;
}): Promise<DecideState> {
  const me = await requireMe();
  if (!me) return { error: t('requests.errors.noPermission') };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('requests')
    .select('id, staff_id, kind, from_date, to_date, amount_paise, staff!inner(people!inner(name))')
    .eq('id', input.requestId)
    .eq('shop_id', me.shopId)
    .maybeSingle();
  if (!row) return { error: t('requests.errors.notPending') };
  const r = await decideRequest(supabase, {
    shopId: me.shopId,
    permissions: me.permissions,
    today: todayIST(),
    request: {
      id: row.id,
      staffId: row.staff_id,
      kind: row.kind as 'leave' | 'advance',
      from: row.from_date,
      to: row.to_date,
      amount: row.amount_paise == null ? null : Number(row.amount_paise),
    },
    decision: input.decision,
    leaveStatus: input.leaveStatus,
    mode: input.mode,
    note: input.note,
    confirmOverLimit: input.confirmOverLimit,
  });
  if (!r.ok) {
    const m = message(r);
    if (m.needsConfirm) m.error = t('requests.overLimit', { name: row.staff.people.name });
    return m;
  }
  revalidatePath('/requests');
  revalidatePath('/', 'layout');
  return {
    done: t(input.decision === 'approve' ? 'requests.done.approved' : 'requests.done.rejected'),
  };
}

/**
 * Reject a request that was approved earlier (`rejectApprovedRequest` in `@fincrew/data`): the
 * leave marks are cleared or the advance is undone first.
 */
export async function rejectLaterAction(requestId: string): Promise<DecideState> {
  const me = await requireMe();
  if (!me) return { error: t('requests.errors.noPermission') };
  const r = await rejectApprovedRequest(await createClient(), {
    shopId: me.shopId,
    permissions: me.permissions,
    today: todayIST(),
    requestId,
  });
  const e = 'requests.errors';
  if (!r.ok) {
    switch (r.reason) {
      case 'no_permission':
        return { error: t(`${e}.noPermission`) };
      case 'not_approved':
        return { error: t(`${e}.notApproved`) };
      case 'past':
        return { error: t(`${e}.past`) };
      case 'attendance':
        return { error: t(`${e}.attendance`) };
      case 'undo':
        return { error: t(`${e}.undo`) };
      case 'recovered':
        return { error: t(`${e}.recovered`) };
      default:
        return { error: t(`${e}.failed`, { reason: r.message }) };
    }
  }
  revalidatePath('/requests');
  revalidatePath('/', 'layout');
  return { done: t('requests.done.rejectedLater') };
}
