import { describe, expect, it } from 'vitest';
import {
  evaluateDays,
  paidLeaveUsed,
  scheduledDay,
  summarizeDays,
  type AttendanceRecord,
  type Holiday,
} from './attendance';
import { monthEnd, monthStart } from './dates';
import type { LeaveTemplateVersion } from './leave';

// October 2026: 31 days, the 1st is a Thursday. Sundays: 4, 11, 18, 25.
const OCT = { from: monthStart(2026, 10), to: monthEnd(2026, 10) };

const sundayPaid: LeaveTemplateVersion = {
  effectiveFrom: '2026-01-01',
  weeklyOffs: [{ weekday: 0, paid: true }],
  paidLeavesPerMonth: 2,
  carryOver: { mode: 'lapse' },
  sandwichRule: false,
};

/** Everyone present on every working day of October, except the dates given. */
function presentAllMonth(
  except: Record<string, AttendanceRecord['status']> = {},
): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if ([4, 11, 18, 25].includes(d) && !(date in except)) continue;
    out.push({ date, status: except[date] ?? 'present' });
  }
  return out;
}

function run(opts: {
  records?: AttendanceRecord[];
  holidays?: Holiday[];
  template?: LeaveTemplateVersion;
  joiningDate?: string;
  leavingDate?: string;
  extraWorkingDayPay?: boolean;
  from?: string;
  to?: string;
}) {
  const template = opts.template ?? sundayPaid;
  return evaluateDays({
    from: opts.from ?? OCT.from,
    to: opts.to ?? OCT.to,
    joiningDate: opts.joiningDate ?? '2025-01-01',
    leavingDate: opts.leavingDate,
    templateOn: () => template,
    holidays: opts.holidays ?? [],
    records: opts.records ?? [],
    extraWorkingDayPay: opts.extraWorkingDayPay ?? true,
  });
}

describe('scheduledDay', () => {
  it('marks weekly offs from the template, with their paid flag', () => {
    expect(scheduledDay('2026-10-04', sundayPaid, new Map())).toEqual({
      date: '2026-10-04',
      kind: 'weekly_off',
      paid: true,
    });
    expect(scheduledDay('2026-10-05', sundayPaid, new Map()).kind).toBe('working');
  });

  it('a shop holiday wins over a weekly off on the same day', () => {
    const holidays = new Map([['2026-10-04', { date: '2026-10-04', paid: false }]]);
    expect(scheduledDay('2026-10-04', sundayPaid, holidays)).toEqual({
      date: '2026-10-04',
      kind: 'holiday',
      paid: false,
    });
  });

  it('with no template every day is a working day', () => {
    expect(scheduledDay('2026-10-04', undefined, new Map()).kind).toBe('working');
  });
});

describe('evaluateDays: a full normal month', () => {
  it('pays every day: 27 present + 4 paid Sundays = 31', () => {
    const s = summarizeDays(run({ records: presentAllMonth() }));
    expect(s).toMatchObject({
      employedDays: 31,
      present: 27,
      paidWeeklyOff: 4,
      unmarked: 0,
      payableDays: 31,
    });
  });

  it('fills weekly offs in automatically and leaves missing working days unmarked', () => {
    const days = run({ records: [] });
    expect(days.find((d) => d.date === '2026-10-04')).toMatchObject({
      status: 'weekly_off',
      source: 'auto',
      baseUnits: 2,
    });
    expect(days.find((d) => d.date === '2026-10-05')).toMatchObject({
      status: 'unmarked',
      source: 'none',
      baseUnits: 0,
    });
    expect(summarizeDays(days)).toMatchObject({ unmarked: 27, payableDays: 4 });
  });
});

describe('statuses', () => {
  it('half day pays half, paid leave pays, absent and unpaid leave do not', () => {
    const s = summarizeDays(
      run({
        records: presentAllMonth({
          '2026-10-05': 'half_day',
          '2026-10-06': 'paid_leave',
          '2026-10-07': 'absent',
          '2026-10-08': 'unpaid_leave',
        }),
      }),
    );
    expect(s).toMatchObject({
      present: 23,
      halfDay: 1,
      paidLeave: 1,
      absent: 1,
      unpaidLeave: 1,
      payableDays: 23 + 0.5 + 1 + 4,
    });
  });

  it('unpaid weekly offs are not payable', () => {
    const s = summarizeDays(
      run({
        records: presentAllMonth(),
        template: { ...sundayPaid, weeklyOffs: [{ weekday: 0, paid: false }] },
      }),
    );
    expect(s).toMatchObject({ unpaidWeeklyOff: 4, paidWeeklyOff: 0, payableDays: 27 });
  });

  it('a template with no weekly offs makes every day a working day', () => {
    const s = summarizeDays(run({ records: [], template: { ...sundayPaid, weeklyOffs: [] } }));
    expect(s.unmarked).toBe(31);
  });

  it('counts paid leave used on working days only', () => {
    const days = run({
      records: presentAllMonth({ '2026-10-06': 'paid_leave', '2026-10-09': 'paid_leave' }),
    });
    expect(paidLeaveUsed(days)).toBe(2);
  });
});

describe('holidays', () => {
  it('paid holidays are payable, unpaid are not', () => {
    const s = summarizeDays(
      run({
        records: presentAllMonth().filter((r) => !['2026-10-02', '2026-10-20'].includes(r.date)),
        holidays: [
          { date: '2026-10-02', paid: true },
          { date: '2026-10-20', paid: false },
        ],
      }),
    );
    expect(s).toMatchObject({
      paidHoliday: 1,
      unpaidHoliday: 1,
      present: 25,
      payableDays: 25 + 4 + 1,
    });
  });
});

describe('extra working days (present on a weekly off or holiday)', () => {
  it('keeps the paid off day and adds an extra day when the setting is on', () => {
    const days = run({ records: presentAllMonth({ '2026-10-04': 'present' }) });
    expect(days.find((d) => d.date === '2026-10-04')).toMatchObject({
      status: 'present',
      baseUnits: 2,
      extraUnits: 2,
    });
    expect(summarizeDays(days)).toMatchObject({ extraWorkingDays: 1, payableDays: 32 });
  });

  it('a half day on a holiday adds half an extra day', () => {
    const days = run({
      records: [...presentAllMonth(), { date: '2026-10-04', status: 'half_day' }],
    });
    expect(summarizeDays(days)).toMatchObject({ extraWorkingDays: 0.5, payableDays: 31.5 });
  });

  it('adds nothing extra when the setting is off', () => {
    const days = run({
      records: presentAllMonth({ '2026-10-04': 'present' }),
      extraWorkingDayPay: false,
    });
    expect(summarizeDays(days)).toMatchObject({ extraWorkingDays: 0, payableDays: 31 });
  });

  it('on an unpaid off day, working pays only the extra day', () => {
    const days = run({
      records: presentAllMonth({ '2026-10-04': 'present' }),
      template: { ...sundayPaid, weeklyOffs: [{ weekday: 0, paid: false }] },
    });
    expect(summarizeDays(days)).toMatchObject({ extraWorkingDays: 1, payableDays: 28 });
  });

  it('other marks on an off day are treated as the off day itself', () => {
    const days = run({ records: presentAllMonth({ '2026-10-04': 'absent' }) });
    expect(days.find((d) => d.date === '2026-10-04')).toMatchObject({
      status: 'weekly_off',
      baseUnits: 2,
    });
  });
});

describe('joining and leaving mid-month', () => {
  it('only days from joining to leaving count', () => {
    const days = run({
      records: presentAllMonth(),
      joiningDate: '2026-10-10',
      leavingDate: '2026-10-20',
    });
    const s = summarizeDays(days);
    // 10..20 = 11 days: Sundays 11 and 18, 9 working days
    expect(s).toMatchObject({ employedDays: 11, present: 9, paidWeeklyOff: 2, payableDays: 11 });
    expect(days.find((d) => d.date === '2026-10-04')).toMatchObject({
      status: 'not_employed',
      baseUnits: 0,
    });
  });
});

describe('sandwich rule', () => {
  const sandwich = { ...sundayPaid, sandwichRule: true };

  it('is off by default', () => {
    const s = summarizeDays(
      run({ records: presentAllMonth({ '2026-10-03': 'absent', '2026-10-05': 'absent' }) }),
    );
    expect(s).toMatchObject({ sandwiched: 0, paidWeeklyOff: 4 });
  });

  it('absent on the working days before and after a paid off makes the off unpaid', () => {
    const days = run({
      template: sandwich,
      records: presentAllMonth({ '2026-10-03': 'absent', '2026-10-05': 'absent' }),
    });
    expect(days.find((d) => d.date === '2026-10-04')).toMatchObject({
      sandwiched: true,
      baseUnits: 0,
    });
    expect(summarizeDays(days)).toMatchObject({ sandwiched: 1, payableDays: 31 - 3 });
  });

  it('absent on only one side does not sandwich', () => {
    const s = summarizeDays(
      run({ template: sandwich, records: presentAllMonth({ '2026-10-03': 'absent' }) }),
    );
    expect(s.sandwiched).toBe(0);
  });

  it('unpaid leave or a half day on a side does not count as absent', () => {
    const s = summarizeDays(
      run({
        template: sandwich,
        records: presentAllMonth({ '2026-10-03': 'unpaid_leave', '2026-10-05': 'absent' }),
      }),
    );
    expect(s.sandwiched).toBe(0);
  });

  it('looks past other off days and holidays to the nearest working days', () => {
    const satSun = {
      ...sandwich,
      weeklyOffs: [
        { weekday: 6, paid: true },
        { weekday: 0, paid: true },
      ],
    };
    const records = presentAllMonth({ '2026-10-02': 'absent', '2026-10-05': 'absent' }).filter(
      (r) => r.date !== '2026-10-03',
    );
    const days = run({ template: satSun, records });
    expect(days.filter((d) => d.sandwiched).map((d) => d.date)).toEqual([
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('uses records from outside the month for offs at the month edge', () => {
    // Nov 1 2026 is a Sunday: absent Sat Oct 31 and Mon Nov 2.
    const days = run({
      template: sandwich,
      from: '2026-11-01',
      to: '2026-11-30',
      records: [
        { date: '2026-10-31', status: 'absent' },
        { date: '2026-11-02', status: 'absent' },
      ],
    });
    expect(days[0]).toMatchObject({ date: '2026-11-01', sandwiched: true });
  });

  it('an unmarked neighbour does not sandwich', () => {
    const records = presentAllMonth({ '2026-10-03': 'absent' }).filter(
      (r) => r.date !== '2026-10-05',
    );
    const s = summarizeDays(run({ template: sandwich, records }));
    expect(s.sandwiched).toBe(0);
  });

  it('never applies to holidays or unpaid offs, or when the person worked the off day', () => {
    const records = presentAllMonth({
      '2026-10-03': 'absent',
      '2026-10-05': 'absent',
      '2026-10-04': 'present',
    });
    expect(summarizeDays(run({ template: sandwich, records })).sandwiched).toBe(0);
  });
});
