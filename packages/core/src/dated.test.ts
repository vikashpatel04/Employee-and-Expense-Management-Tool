import { describe, expect, it } from 'vitest';
import { effectiveOn, segments } from './dated';

const versions = [
  { effectiveFrom: '2026-01-01', v: 'a' },
  { effectiveFrom: '2026-03-15', v: 'b' },
  { effectiveFrom: '2026-02-01', v: 'c' }, // unsorted on purpose
];

describe('effectiveOn', () => {
  it('picks the latest version starting on or before the date', () => {
    expect(effectiveOn(versions, '2026-01-31')?.v).toBe('a');
    expect(effectiveOn(versions, '2026-02-01')?.v).toBe('c');
    expect(effectiveOn(versions, '2026-03-14')?.v).toBe('c');
    expect(effectiveOn(versions, '2026-03-15')?.v).toBe('b');
  });

  it('returns undefined before the first version', () => {
    expect(effectiveOn(versions, '2025-12-31')).toBeUndefined();
  });

  it('rejects two versions with the same start date', () => {
    expect(() =>
      effectiveOn(
        [
          { effectiveFrom: '2026-01-01', v: 1 },
          { effectiveFrom: '2026-01-01', v: 2 },
        ],
        '2026-01-05',
      ),
    ).toThrow(/same date/);
  });
});

describe('segments', () => {
  it('splits a range at each change date', () => {
    expect(segments(versions, '2026-03-01', '2026-03-31')).toEqual([
      { from: '2026-03-01', to: '2026-03-14', item: versions[2] },
      { from: '2026-03-15', to: '2026-03-31', item: versions[1] },
    ]);
  });

  it('leaves out days before the first version', () => {
    expect(segments(versions, '2025-12-30', '2026-01-02')).toEqual([
      { from: '2026-01-01', to: '2026-01-02', item: versions[0] },
    ]);
  });
});
