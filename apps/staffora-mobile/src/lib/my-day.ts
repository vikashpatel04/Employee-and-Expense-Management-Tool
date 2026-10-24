import { businessDateOf, monthOf, type BusinessDate } from '@fincrew/core';
import {
  loadAttendanceMonth,
  loadPay,
  toShopRules,
  type GridCell,
  type GridRow,
} from '@fincrew/data';
import { deviceId } from './auth';
import { supabase } from './supabase';

export type MyDay = {
  today: BusinessDate;
  cell: GridCell | null;
  row: GridRow | null;
  /** Minutes from midnight, when the person has a shift. */
  shift: { start: number; end: number } | null;
  selfAttendance: boolean;
  /** The shop's minimum time between check-in and check-out (its attendance code settings). */
  minGapMinutes: number;
};

/**
 * Today and this month for the signed-in staff member, worked out by the same shared code as
 * FinCrew (`loadAttendanceMonth`, `loadPay`); RLS returns only their own rows.
 */
export async function loadMyDay(shopId: string, personId: string): Promise<MyDay> {
  const today = businessDateOf(new Date());
  const { year, month } = monthOf(today);
  const [monthData, pay, { data: me }, { data: shop }] = await Promise.all([
    loadAttendanceMonth(supabase, shopId, year, month, today),
    loadPay(supabase, personId, today),
    supabase.from('staff').select('self_attendance').eq('person_id', personId).maybeSingle(),
    supabase.from('shops').select('settings').eq('id', shopId).maybeSingle(),
  ]);
  const row = monthData.rows.find((r) => r.staffId === personId) ?? null;
  const cur = pay.current;
  return {
    today,
    row,
    cell: row?.cells.find((c) => c.date === today) ?? null,
    shift:
      cur && cur.shiftStart != null && cur.shiftEnd != null
        ? { start: cur.shiftStart, end: cur.shiftEnd }
        : null,
    selfAttendance: !!me?.self_attendance,
    minGapMinutes: toShopRules(shop?.settings).attendanceCode.minGapMinutes,
  };
}

export type CheckReply =
  { ok: true; kind: 'in' | 'out'; at: string } | { ok: false; reason: string; retryAt?: string };

/** Check in or out with the code (typed or scanned); the database decides (`check_in`). */
export async function checkIn(
  shopId: string,
  code: string,
  method: 'scan' | 'typed',
): Promise<CheckReply> {
  const { data, error } = await supabase.rpc('check_in', {
    p_shop: shopId,
    p_code: code,
    p_method: method,
    p_device: await deviceId(),
  });
  if (error) return { ok: false, reason: 'failed', retryAt: error.message };
  return data as CheckReply;
}
