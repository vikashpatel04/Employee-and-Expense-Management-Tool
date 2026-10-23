import { describe, expect, it } from 'vitest';
import { ATTENDANCE_STATUSES } from '@fincrew/core';
import { colorNames, moneyToken, statusTokens, textStyles, themes, type ColorName } from './index';

const hex = /^#[0-9a-f]{6}$|^rgba?\(/i;

describe('resolved themes', () => {
  it('every colour resolves to a real value in every app and theme', () => {
    for (const app of ['fincrew', 'staffora'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const name of colorNames)
          expect(themes[app][theme][name], `${app}/${theme}/${name}`).toMatch(hex);
      }
    }
  });

  it('accent follows the app: Peacock for FinCrew, Marigold for Staffora', () => {
    expect(themes.fincrew.light.accent).toBe(themes.fincrew.light.fincrew);
    expect(themes.staffora.light.accent).toBe(themes.staffora.light.staffora);
    expect(themes.staffora.dark['on-accent']).toBe(themes.staffora.dark['on-staffora']);
    expect(themes.staffora.light['accent-ink']).toBe(themes.staffora.light['staffora-ink']);
  });

  it('aliases follow the theme (money-owed is the late colour in light and dark)', () => {
    expect(themes.fincrew.dark['money-owed']).toBe(themes.fincrew.dark['status-late']);
    expect(themes.fincrew.light['money-owed']).toBe(themes.fincrew.light['status-late']);
    expect(themes.fincrew.dark['money-owed']).not.toBe(themes.fincrew.light['money-owed']);
  });
});

describe('status and money helpers', () => {
  it('every attendance status (plus late, unmarked) has a colour token and icon', () => {
    for (const s of [...ATTENDANCE_STATUSES, 'late', 'unmarked'] as const) {
      const { fg, bg, icon } = statusTokens(s);
      expect(colorNames).toContain(fg);
      if (bg) expect(colorNames).toContain(bg);
      expect(icon).toBeTruthy();
    }
    expect(statusTokens('half_day')).toEqual({
      fg: 'status-half-day',
      bg: 'status-half-day-soft',
      icon: 'half',
    });
    expect(statusTokens('unmarked').bg).toBeNull();
  });

  it('money states map to tokens', () => {
    const names: readonly string[] = colorNames;
    for (const m of ['owed', 'paid', 'advance', 'deduction'] as const)
      expect(names).toContain(moneyToken(m) as ColorName);
  });
});

describe('text styles', () => {
  it('money and code styles use tabular figures; nothing is smaller than 12px', () => {
    for (const [name, s] of Object.entries(textStyles)) {
      expect(s.fontSize, name).toBeGreaterThanOrEqual(12);
      expect(s.tabularNums, name).toBe(name.startsWith('money-') || name === 'code-digits');
    }
  });
});
