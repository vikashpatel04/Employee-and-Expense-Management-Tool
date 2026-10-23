import { describe, expect, it } from 'vitest';
import type { AttendanceRecord } from './attendance';
import { DEFAULT_LATE_POLICY } from './late';
import type { LeaveTemplateVersion } from './leave';
import { calculateSalary, type PaySettings, type SalaryInput } from './salary';

// October 2026: 31 days, Sundays 4, 11, 18, 25.
const SUNDAYS = [4, 11, 18, 25];
const d = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

const sundayPaid: LeaveTemplateVersion = {
  effectiveFrom: '2025-01-01',
  weeklyOffs: [{ weekday: 0, paid: true }],
  paidLeavesPerMonth: 2,
  carryOver: { mode: 'lapse' },
  sandwichRule: false,
};

const shift = { start: 9 * 60 + 30, end: 20 * 60 + 30, graceMinutes: 10 }; // 660 min

const monthly = (amount: number, effectiveFrom = '2025-01-01'): PaySettings => ({
  effectiveFrom,
  payType: 'monthly',
  monthlySalary: amount,
  shift,
});

function workingDays(
  overrides: Record<number, Partial<AttendanceRecord>> = {},
): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  for (let day = 1; day <= 31; day++) {
    if (SUNDAYS.includes(day) && !(day in overrides)) continue;
    out.push({
      date: d(day),
      status: 'present',
      checkIn: shift.start,
      checkOut: shift.end,
      ...overrides[day],
    });
  }
  return out;
}

function input(over: Partial<SalaryInput> = {}): SalaryInput {
  return {
    year: 2026,
    month: 10,
    joiningDate: '2025-01-01',
    paySettings: [monthly(3_000_000)],
    templateOn: () => sundayPaid,
    holidays: [],
    records: workingDays(),
    allowances: [],
    deductions: [],
    shop: { latePolicy: DEFAULT_LATE_POLICY, extraWorkingDayPay: true },
    ...over,
  };
}

const line = (r: ReturnType<typeof calculateSalary>, kind: string, name?: string) =>
  r.lines.find((l) => l.kind === kind && (name === undefined || l.name === name))?.amount;

describe('monthly salary', () => {
  it('a full month pays exactly the monthly salary', () => {
    const r = calculateSalary(input());
    expect(r.summary.payableDays).toBe(31);
    expect(r).toMatchObject({
      earned: 3_000_000,
      gross: 3_000_000,
      deductions: 0,
      netPay: 3_000_000,
    });
    expect(r.warnings).toEqual([]);
  });

  it('day rate = monthly ÷ actual days in the month (absent 2 of 31)', () => {
    const r = calculateSalary(
      input({ records: workingDays({ 5: { status: 'absent' }, 6: { status: 'absent' } }) }),
    );
    // 30,000 × 29 / 31 = 28,064.52 → ₹28,065
    expect(r.earned).toBe(2_806_500);
  });

  it('a 28-day February still pays the full salary for a full month', () => {
    const feb: AttendanceRecord[] = [];
    for (let day = 1; day <= 28; day++) {
      const date = `2026-02-${String(day).padStart(2, '0')}`;
      if ([1, 8, 15, 22].includes(day)) continue; // Sundays
      feb.push({ date, status: 'present' });
    }
    const r = calculateSalary(input({ month: 2, records: feb }));
    expect(r.earned).toBe(3_000_000);
  });

  it('a mid-month pay change splits the month and rounds once', () => {
    const r = calculateSalary(
      input({ paySettings: [monthly(3_000_000), monthly(3_600_000, '2026-10-16')] }),
    );
    // 30,000 × 15/31 + 36,000 × 16/31 = 33,096.77 → ₹33,097
    expect(r.earned).toBe(3_309_700);
  });

  it('a mid-month joiner is paid only from the joining date', () => {
    const r = calculateSalary(input({ joiningDate: '2026-10-10' }));
    // 10..31 = 22 days, all payable: 30,000 × 22/31 = 21,290.32 → ₹21,290
    expect(r.summary.employedDays).toBe(22);
    expect(r.earned).toBe(2_129_000);
  });

  it('an extra working day on a Sunday adds a day at the day rate', () => {
    const r = calculateSalary(input({ records: workingDays({ 4: { status: 'present' } }) }));
    // 32 / 31 × 30,000 = 30,967.74 → ₹30,968
    expect(r.earned).toBe(3_096_800);
  });

  it('warns about unmarked working days and treats them as unpaid', () => {
    const r = calculateSalary(input({ records: workingDays().filter((x) => x.date !== d(5)) }));
    expect(r.summary.unmarked).toBe(1);
    expect(r.warnings).toContainEqual({ code: 'unmarked_days', count: 1 });
  });
});

describe('daily-wage and hourly staff', () => {
  const daily = (wage: number): PaySettings => ({
    effectiveFrom: '2025-01-01',
    payType: 'daily',
    dailyWage: wage,
    shift,
  });

  it('daily wage × payable days, weekly offs paid when the template says so', () => {
    expect(calculateSalary(input({ paySettings: [daily(80_000)] })).earned).toBe(31 * 80_000);
  });

  it('unpaid weekly offs are not paid for daily-wage staff', () => {
    const unpaidSundays = { ...sundayPaid, weeklyOffs: [{ weekday: 0, paid: false }] };
    const r = calculateSalary(
      input({ paySettings: [daily(80_000)], templateOn: () => unpaidSundays }),
    );
    expect(r.earned).toBe(27 * 80_000);
  });

  it('hourly: hours worked × hourly rate, from check-in and check-out', () => {
    const hourly: PaySettings = {
      effectiveFrom: '2025-01-01',
      payType: 'hourly',
      hourlyRate: 10_000,
    };
    const records: AttendanceRecord[] = [
      { date: d(1), status: 'present', checkIn: 9 * 60 + 30, checkOut: 18 * 60 + 30 }, // 9 h
      { date: d(2), status: 'present', checkIn: 10 * 60, checkOut: 14 * 60 + 20 }, // 4 h 20
      { date: d(3), status: 'present', checkIn: 10 * 60 }, // no check-out
    ];
    const r = calculateSalary(input({ paySettings: [hourly], records }));
    // 13 h 20 min × ₹100 = ₹1,333.33 → ₹1,333
    expect(r.earned).toBe(133_300);
    expect(r.warnings).toContainEqual({ code: 'missing_check_out', count: 1 });
  });
});

describe('overtime, allowances, leave payout, deductions', () => {
  it('overtime = hours × overtime rate', () => {
    const r = calculateSalary(
      input({
        paySettings: [{ ...monthly(3_000_000), overtimeRate: 12_000 }],
        records: workingDays({ 5: { overtimeMinutes: 90 } }),
      }),
    );
    expect(line(r, 'overtime')).toBe(18_000);
    expect(r.gross).toBe(3_018_000);
  });

  it('fixed allowance is paid in full; prorated follows payable days', () => {
    const r = calculateSalary(
      input({
        records: workingDays({ 5: { status: 'absent' }, 6: { status: 'absent' } }),
        allowances: [
          { name: 'Travel', amount: 100_000, prorated: false, effectiveFrom: '2025-01-01' },
          { name: 'Food', amount: 100_000, prorated: true, effectiveFrom: '2025-01-01' },
        ],
      }),
    );
    expect(line(r, 'allowance', 'Travel')).toBe(100_000);
    // 1,000 × 29/31 = 935.48 → ₹935
    expect(line(r, 'allowance', 'Food')).toBe(93_500);
  });

  it('an allowance that starts mid-month covers only its days', () => {
    const r = calculateSalary(
      input({
        allowances: [
          { name: 'Travel', amount: 100_000, prorated: false, effectiveFrom: '2026-10-16' },
        ],
      }),
    );
    // 1,000 × 16/31 = 516.13 → ₹516
    expect(line(r, 'allowance', 'Travel')).toBe(51_600);
  });

  it('a mid-month joiner gets full allowances for a fully attended stint', () => {
    const r = calculateSalary(
      input({
        joiningDate: '2026-10-10',
        allowances: [
          { name: 'Travel', amount: 100_000, prorated: false, effectiveFrom: '2025-01-01' },
          { name: 'Food', amount: 100_000, prorated: true, effectiveFrom: '2025-01-01' },
        ],
      }),
    );
    expect(line(r, 'allowance', 'Travel')).toBe(100_000);
    expect(line(r, 'allowance', 'Food')).toBe(100_000);
  });

  it('prorated allowances never exceed the full amount, even with extra days', () => {
    const r = calculateSalary(
      input({
        records: workingDays({ 4: { status: 'present' }, 11: { status: 'present' } }),
        allowances: [
          { name: 'Food', amount: 100_000, prorated: true, effectiveFrom: '2025-01-01' },
        ],
      }),
    );
    expect(line(r, 'allowance', 'Food')).toBe(100_000);
  });

  it('leave payout is paid at the day rate of the month', () => {
    const r = calculateSalary(input({ leavePayoutDays: 2 }));
    // 2 × 30,000/31 = 1,935.48 → ₹1,935
    expect(line(r, 'leave_payout')).toBe(193_500);
    expect(r.gross).toBe(3_000_000 + 193_500);
  });

  it('fixed deductions reduce net pay', () => {
    const r = calculateSalary(
      input({ deductions: [{ name: 'PF', amount: 180_000, effectiveFrom: '2025-01-01' }] }),
    );
    expect(line(r, 'deduction', 'PF')).toBe(180_000);
    expect(r).toMatchObject({
      deductions: 180_000,
      netBeforeAdvance: 2_820_000,
      netPay: 2_820_000,
    });
  });
});

describe('late policy in salary', () => {
  const deduct = { ...DEFAULT_LATE_POLICY, mode: 'deduct' as const };
  const late15 = (days: number[]) =>
    Object.fromEntries(days.map((day) => [day, { checkIn: shift.start + 15 }]));

  it('notice only: late days are reported, nothing is charged', () => {
    const r = calculateSalary(input({ records: workingDays(late15([1, 2, 3, 5, 6])) }));
    expect(r.late.filter((l) => l.outcome === 'noticed')).toHaveLength(5);
    expect(line(r, 'late_deduction')).toBeUndefined();
  });

  it('deduct: late days after the free ones are charged per minute', () => {
    const r = calculateSalary(
      input({
        shop: { latePolicy: deduct, extraWorkingDayPay: true },
        records: workingDays(late15([1, 2, 3, 5, 6])),
      }),
    );
    // 2 charged days × 15 min = 30 min × (30,000/31 ÷ 660) = ₹43.99 → ₹44
    expect(line(r, 'late_deduction')).toBe(4_400);
    expect(r.netPay).toBe(3_000_000 - 4_400);
  });

  it('far too late turns the day into a half day', () => {
    const r = calculateSalary(
      input({
        shop: { latePolicy: deduct, extraWorkingDayPay: true },
        records: workingDays({ 5: { checkIn: shift.start + 130 } }),
      }),
    );
    expect(r.summary.payableDays).toBe(30.5);
    // 30,000 × 30.5/31 = 29,516.13 → ₹29,516
    expect(r.earned).toBe(2_951_600);
    expect(line(r, 'late_deduction')).toBeUndefined();
  });

  it("a staff member's override beats the shop policy", () => {
    const r = calculateSalary(
      input({
        paySettings: [
          { ...monthly(3_000_000), latePolicyOverride: { mode: 'deduct', freeLateDays: 0 } },
        ],
        records: workingDays(late15([1])),
      }),
    );
    // 15 min × (30,000/31 ÷ 660) = ₹21.99 → ₹22
    expect(line(r, 'late_deduction')).toBe(2_200);
  });

  it('staff without a shift are never late', () => {
    const r = calculateSalary(
      input({
        paySettings: [
          { effectiveFrom: '2025-01-01', payType: 'monthly', monthlySalary: 3_000_000 },
        ],
        shop: { latePolicy: deduct, extraWorkingDayPay: true },
        records: workingDays(late15([1, 2, 3, 5, 6])),
      }),
    );
    expect(r.late).toEqual([]);
  });
});

describe('advance cut', () => {
  it('takes the scheduled cut', () => {
    const r = calculateSalary(
      input({ advance: { scheduledCut: 500_000, outstanding: 2_000_000 } }),
    );
    expect(r).toMatchObject({ advanceCut: 500_000, netPay: 2_500_000 });
  });

  it('never cuts more than is outstanding', () => {
    const r = calculateSalary(input({ advance: { scheduledCut: 500_000, outstanding: 300_000 } }));
    expect(r.advanceCut).toBe(300_000);
  });

  it('is capped at net pay before the advance, so net pay is never negative from it', () => {
    const r = calculateSalary(
      input({
        // 2 present days + 4 paid Sundays = 6/31 × 30,000 = ₹5,806, less than the ₹10,000 cut
        records: workingDays().slice(0, 2),
        advance: { scheduledCut: 1_000_000, outstanding: 2_000_000 },
      }),
    );
    expect(r.netBeforeAdvance).toBe(580_600);
    expect(r.advanceCut).toBe(580_600);
    expect(r.netPay).toBe(0);
  });
});

describe('totals and lines', () => {
  it('every line is rounded to the rupee and totals add up from the rounded lines', () => {
    const r = calculateSalary(
      input({
        paySettings: [{ ...monthly(3_333_333), overtimeRate: 12_345 }],
        records: workingDays({
          5: { status: 'absent', overtimeMinutes: 0 },
          6: { overtimeMinutes: 37 },
        }),
        allowances: [{ name: 'Food', amount: 77_777, prorated: true, effectiveFrom: '2025-01-01' }],
        deductions: [{ name: 'PF', amount: 12_345, effectiveFrom: '2025-01-01' }],
        advance: { scheduledCut: 100_000, outstanding: 100_000 },
      }),
    );
    for (const l of r.lines) expect(l.amount % 100).toBe(0);
    const sum = (kinds: string[]) =>
      r.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
    expect(r.gross).toBe(sum(['earned', 'overtime', 'allowance', 'leave_payout']));
    expect(r.deductions).toBe(sum(['deduction', 'late_deduction']));
    expect(r.netPay).toBe(r.gross - r.deductions - r.advanceCut);
  });

  it('warns when deductions exceed earnings', () => {
    const r = calculateSalary(
      input({
        records: [],
        templateOn: () => ({ ...sundayPaid, weeklyOffs: [] }),
        deductions: [{ name: 'PF', amount: 180_000, effectiveFrom: '2025-01-01' }],
      }),
    );
    expect(r.netPay).toBeLessThan(0);
    expect(r.warnings).toContainEqual({ code: 'negative_net_pay' });
  });

  it('warns about employed days with no pay settings', () => {
    const r = calculateSalary(input({ paySettings: [monthly(3_000_000, '2026-10-11')] }));
    expect(r.warnings).toContainEqual({ code: 'no_pay_settings', count: 10 });
  });

  it('someone who left before the month gets an empty payslip', () => {
    const r = calculateSalary(input({ leavingDate: '2026-09-30' }));
    expect(r).toMatchObject({ gross: 0, netPay: 0, lines: [] });
  });
});
