// FinCrew Design System v1: generated from packages/ui/design/tokens.json by scripts/ui-tokens.mjs. Do not edit.
/* eslint-disable */

export const colorNames = ["canvas","surface","surface-muted","surface-pressed","line","line-strong","ink","ink-muted","ink-subtle","scrim","fincrew","fincrew-strong","fincrew-soft","on-fincrew","staffora","staffora-strong","staffora-ink","staffora-soft","on-staffora","accent","accent-strong","accent-soft","accent-ink","on-accent","focus","status-present","status-present-soft","status-half-day","status-half-day-soft","status-absent","status-absent-soft","status-paid-leave","status-paid-leave-soft","status-unpaid-leave","status-unpaid-leave-soft","status-weekly-off","status-weekly-off-soft","status-holiday","status-holiday-soft","status-late","status-late-soft","status-unmarked","money-owed","money-paid","money-advance","money-deduction","danger","on-danger"] as const;
export type ColorName = (typeof colorNames)[number];
export type Palette = Record<ColorName, string>;
export type AppName = 'fincrew' | 'staffora';
export type ThemeName = 'light' | 'dark';

/** Every colour resolved per app (accent) and theme. Use for React Native and charts. */
export const themes: Record<AppName, Record<ThemeName, Palette>> = {
  "fincrew": {
    "light": {
      "canvas": "#f1f3f0",
      "surface": "#ffffff",
      "surface-muted": "#e7eae5",
      "surface-pressed": "#dde1db",
      "line": "#dde1db",
      "line-strong": "#838b85",
      "ink": "#11171a",
      "ink-muted": "#525b62",
      "ink-subtle": "#656e75",
      "scrim": "rgba(8, 12, 14, 0.48)",
      "fincrew": "#0b5d6b",
      "fincrew-strong": "#08494f",
      "fincrew-soft": "#d9edef",
      "on-fincrew": "#ffffff",
      "staffora": "#f2a30f",
      "staffora-strong": "#d98c00",
      "staffora-ink": "#7a4800",
      "staffora-soft": "#fdefd0",
      "on-staffora": "#271900",
      "accent": "#0b5d6b",
      "accent-strong": "#08494f",
      "accent-soft": "#d9edef",
      "accent-ink": "#0b5d6b",
      "on-accent": "#ffffff",
      "focus": "#1a5fd6",
      "status-present": "#13753a",
      "status-present-soft": "#dcf1e2",
      "status-half-day": "#566a0b",
      "status-half-day-soft": "#ecf1d0",
      "status-absent": "#bb2727",
      "status-absent-soft": "#fbe3e1",
      "status-paid-leave": "#1d53bd",
      "status-paid-leave-soft": "#e1e9fb",
      "status-unpaid-leave": "#6640b5",
      "status-unpaid-leave-soft": "#ece5fa",
      "status-weekly-off": "#535d67",
      "status-weekly-off-soft": "#e7eaed",
      "status-holiday": "#9e2270",
      "status-holiday-soft": "#f8e0ee",
      "status-late": "#a14b06",
      "status-late-soft": "#fcead1",
      "status-unmarked": "#656e75",
      "money-owed": "#a14b06",
      "money-paid": "#13753a",
      "money-advance": "#1d53bd",
      "money-deduction": "#525b62",
      "danger": "#bb2727",
      "on-danger": "#ffffff"
    },
    "dark": {
      "canvas": "#0c1013",
      "surface": "#151a1e",
      "surface-muted": "#20272c",
      "surface-pressed": "#2a3238",
      "line": "#283037",
      "line-strong": "#68737c",
      "ink": "#edf0f1",
      "ink-muted": "#a5afb6",
      "ink-subtle": "#8c969e",
      "scrim": "rgba(0, 0, 0, 0.6)",
      "fincrew": "#5cc6d2",
      "fincrew-strong": "#86d7e0",
      "fincrew-soft": "#11343a",
      "on-fincrew": "#04232a",
      "staffora": "#ffba3d",
      "staffora-strong": "#ffcb6b",
      "staffora-ink": "#ffc65a",
      "staffora-soft": "#392908",
      "on-staffora": "#271900",
      "accent": "#5cc6d2",
      "accent-strong": "#86d7e0",
      "accent-soft": "#11343a",
      "accent-ink": "#5cc6d2",
      "on-accent": "#04232a",
      "focus": "#8fb8ff",
      "status-present": "#66d48e",
      "status-present-soft": "#12301f",
      "status-half-day": "#c4d96c",
      "status-half-day-soft": "#262e0f",
      "status-absent": "#ff9188",
      "status-absent-soft": "#3c1716",
      "status-paid-leave": "#93b5ff",
      "status-paid-leave-soft": "#152649",
      "status-unpaid-leave": "#c0a6ff",
      "status-unpaid-leave-soft": "#291d47",
      "status-weekly-off": "#aab4be",
      "status-weekly-off-soft": "#232a31",
      "status-holiday": "#f595d0",
      "status-holiday-soft": "#3b1530",
      "status-late": "#ffb468",
      "status-late-soft": "#392509",
      "status-unmarked": "#8c969e",
      "money-owed": "#ffb468",
      "money-paid": "#66d48e",
      "money-advance": "#93b5ff",
      "money-deduction": "#a5afb6",
      "danger": "#ff9188",
      "on-danger": "#2a0b0a"
    }
  },
  "staffora": {
    "light": {
      "canvas": "#f1f3f0",
      "surface": "#ffffff",
      "surface-muted": "#e7eae5",
      "surface-pressed": "#dde1db",
      "line": "#dde1db",
      "line-strong": "#838b85",
      "ink": "#11171a",
      "ink-muted": "#525b62",
      "ink-subtle": "#656e75",
      "scrim": "rgba(8, 12, 14, 0.48)",
      "fincrew": "#0b5d6b",
      "fincrew-strong": "#08494f",
      "fincrew-soft": "#d9edef",
      "on-fincrew": "#ffffff",
      "staffora": "#f2a30f",
      "staffora-strong": "#d98c00",
      "staffora-ink": "#7a4800",
      "staffora-soft": "#fdefd0",
      "on-staffora": "#271900",
      "accent": "#f2a30f",
      "accent-strong": "#d98c00",
      "accent-soft": "#fdefd0",
      "accent-ink": "#7a4800",
      "on-accent": "#271900",
      "focus": "#1a5fd6",
      "status-present": "#13753a",
      "status-present-soft": "#dcf1e2",
      "status-half-day": "#566a0b",
      "status-half-day-soft": "#ecf1d0",
      "status-absent": "#bb2727",
      "status-absent-soft": "#fbe3e1",
      "status-paid-leave": "#1d53bd",
      "status-paid-leave-soft": "#e1e9fb",
      "status-unpaid-leave": "#6640b5",
      "status-unpaid-leave-soft": "#ece5fa",
      "status-weekly-off": "#535d67",
      "status-weekly-off-soft": "#e7eaed",
      "status-holiday": "#9e2270",
      "status-holiday-soft": "#f8e0ee",
      "status-late": "#a14b06",
      "status-late-soft": "#fcead1",
      "status-unmarked": "#656e75",
      "money-owed": "#a14b06",
      "money-paid": "#13753a",
      "money-advance": "#1d53bd",
      "money-deduction": "#525b62",
      "danger": "#bb2727",
      "on-danger": "#ffffff"
    },
    "dark": {
      "canvas": "#0c1013",
      "surface": "#151a1e",
      "surface-muted": "#20272c",
      "surface-pressed": "#2a3238",
      "line": "#283037",
      "line-strong": "#68737c",
      "ink": "#edf0f1",
      "ink-muted": "#a5afb6",
      "ink-subtle": "#8c969e",
      "scrim": "rgba(0, 0, 0, 0.6)",
      "fincrew": "#5cc6d2",
      "fincrew-strong": "#86d7e0",
      "fincrew-soft": "#11343a",
      "on-fincrew": "#04232a",
      "staffora": "#ffba3d",
      "staffora-strong": "#ffcb6b",
      "staffora-ink": "#ffc65a",
      "staffora-soft": "#392908",
      "on-staffora": "#271900",
      "accent": "#ffba3d",
      "accent-strong": "#ffcb6b",
      "accent-soft": "#392908",
      "accent-ink": "#ffc65a",
      "on-accent": "#271900",
      "focus": "#8fb8ff",
      "status-present": "#66d48e",
      "status-present-soft": "#12301f",
      "status-half-day": "#c4d96c",
      "status-half-day-soft": "#262e0f",
      "status-absent": "#ff9188",
      "status-absent-soft": "#3c1716",
      "status-paid-leave": "#93b5ff",
      "status-paid-leave-soft": "#152649",
      "status-unpaid-leave": "#c0a6ff",
      "status-unpaid-leave-soft": "#291d47",
      "status-weekly-off": "#aab4be",
      "status-weekly-off-soft": "#232a31",
      "status-holiday": "#f595d0",
      "status-holiday-soft": "#3b1530",
      "status-late": "#ffb468",
      "status-late-soft": "#392509",
      "status-unmarked": "#8c969e",
      "money-owed": "#ffb468",
      "money-paid": "#66d48e",
      "money-advance": "#93b5ff",
      "money-deduction": "#a5afb6",
      "danger": "#ff9188",
      "on-danger": "#2a0b0a"
    }
  }
};

/** Pixel values. */
export const space = {
  "space-1": 4,
  "space-2": 8,
  "space-3": 12,
  "space-4": 16,
  "space-5": 20,
  "space-6": 24,
  "space-8": 32,
  "space-10": 40,
  "space-12": 48
} as const;
export const radius = {
  "radius-xs": 6,
  "radius-sm": 10,
  "radius-md": 14,
  "radius-lg": 20,
  "radius-xl": 28,
  "radius-pill": 999
} as const;
export const size = {
  "tap-min": 48,
  "tap-primary": 56,
  "row-min": 72,
  "keypad-key": 64,
  "tab-bar": 64,
  "avatar": 44,
  "icon": 24,
  "icon-sm": 16,
  "content-max": 480
} as const;
export const opacity = {
  "opacity-disabled": 0.45
} as const;

/** CSS box-shadow strings per theme (web). */
export const shadow = {
  "elevation-1": {
    "light": "0 1px 2px rgba(17, 23, 26, 0.06), 0 0 0 1px rgba(17, 23, 26, 0.05)",
    "dark": "0 0 0 1px rgba(255, 255, 255, 0.06)"
  },
  "elevation-2": {
    "light": "0 6px 20px rgba(17, 23, 26, 0.08), 0 1px 3px rgba(17, 23, 26, 0.06)",
    "dark": "0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.07)"
  },
  "elevation-3": {
    "light": "0 -10px 40px rgba(17, 23, 26, 0.16)",
    "dark": "0 -10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)"
  }
} as const;

export const fontFamilies = {
  "sans": "\"Anek Latin\", \"Anek Tamil\", \"Anek Devanagari\", \"Noto Sans Tamil\", \"Noto Sans Devanagari\", system-ui, sans-serif",
  "num": "\"Anek Latin\", \"Anek Tamil\", \"Anek Devanagari\", \"Noto Sans Tamil\", \"Noto Sans Devanagari\", system-ui, sans-serif",
  "ta": "\"Anek Tamil\", \"Anek Latin\", \"Anek Tamil\", \"Anek Devanagari\", \"Noto Sans Tamil\", \"Noto Sans Devanagari\", system-ui, sans-serif",
  "hi": "\"Anek Devanagari\", \"Anek Latin\", \"Anek Tamil\", \"Anek Devanagari\", \"Noto Sans Tamil\", \"Noto Sans Devanagari\", system-ui, sans-serif"
} as const;

export type TextStyle = {
  family: keyof typeof fontFamilies;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing?: string;
  tabularNums: boolean;
};
export const textStyles = {
  "money-hero": {
    "family": "num",
    "fontSize": 48,
    "lineHeight": 52,
    "fontWeight": 600,
    "letterSpacing": "-0.01em",
    "tabularNums": true
  },
  "money-lg": {
    "family": "num",
    "fontSize": 32,
    "lineHeight": 38,
    "fontWeight": 600,
    "tabularNums": true
  },
  "money-md": {
    "family": "num",
    "fontSize": 20,
    "lineHeight": 26,
    "fontWeight": 600,
    "tabularNums": true
  },
  "money-sm": {
    "family": "num",
    "fontSize": 15,
    "lineHeight": 20,
    "fontWeight": 500,
    "tabularNums": true
  },
  "code-digits": {
    "family": "num",
    "fontSize": 44,
    "lineHeight": 48,
    "fontWeight": 600,
    "letterSpacing": "0.02em",
    "tabularNums": true
  },
  "title-xl": {
    "family": "sans",
    "fontSize": 28,
    "lineHeight": 34,
    "fontWeight": 600,
    "tabularNums": false
  },
  "title-lg": {
    "family": "sans",
    "fontSize": 22,
    "lineHeight": 28,
    "fontWeight": 600,
    "tabularNums": false
  },
  "title-md": {
    "family": "sans",
    "fontSize": 18,
    "lineHeight": 24,
    "fontWeight": 600,
    "tabularNums": false
  },
  "body-lg": {
    "family": "sans",
    "fontSize": 17,
    "lineHeight": 26,
    "fontWeight": 400,
    "tabularNums": false
  },
  "body": {
    "family": "sans",
    "fontSize": 15,
    "lineHeight": 22,
    "fontWeight": 400,
    "tabularNums": false
  },
  "label": {
    "family": "sans",
    "fontSize": 17,
    "lineHeight": 22,
    "fontWeight": 600,
    "tabularNums": false
  },
  "label-sm": {
    "family": "sans",
    "fontSize": 15,
    "lineHeight": 20,
    "fontWeight": 600,
    "tabularNums": false
  },
  "caption": {
    "family": "sans",
    "fontSize": 13,
    "lineHeight": 18,
    "fontWeight": 500,
    "tabularNums": false
  },
  "micro": {
    "family": "sans",
    "fontSize": 12,
    "lineHeight": 16,
    "fontWeight": 600,
    "tabularNums": false
  }
} satisfies Record<string, TextStyle>;
export type TextStyleName = keyof typeof textStyles;
