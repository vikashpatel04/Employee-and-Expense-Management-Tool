// Generates packages/ui/src/tokens.generated.ts and packages/ui/src/tokens.css from the design
// system snapshot packages/ui/design/tokens.json (docs/DESIGN.md explains how to refresh it).
//
//   pnpm ui:tokens          write the generated files
//   pnpm ui:tokens --check  fail if they're out of date (CI)
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'packages/ui/design/tokens.json';
const OUT_TS = 'packages/ui/src/tokens.generated.ts';
const OUT_CSS = 'packages/ui/src/tokens.css';

const t = JSON.parse(readFileSync(SRC, 'utf8'));
const themeIds = t.color.themes.map((th) => th.id);
if (themeIds.join() !== 'light,dark')
  throw new Error(`Expected themes light,dark; got ${themeIds}`);

// Staffora swaps the accent aliases (design system README: "AppScope app=staffora").
const STAFFORA_ACCENT = {
  accent: 'staffora',
  'accent-strong': 'staffora-strong',
  'accent-soft': 'staffora-soft',
  'accent-ink': 'staffora-ink',
  'on-accent': 'on-staffora',
};

const colors = new Map(t.color.tokens.map((c) => [c.name, c]));
const aliasOf = (value) =>
  typeof value === 'string' && /^\{[^}]+\}$/.test(value) ? value.slice(1, -1) : null;

function resolve(name, theme, app, seen = new Set()) {
  if (app === 'staffora' && STAFFORA_ACCENT[name]) name = STAFFORA_ACCENT[name];
  if (seen.has(name)) throw new Error(`Alias loop at ${name}`);
  seen.add(name);
  const tok = colors.get(name);
  if (!tok) throw new Error(`Unknown colour token ${name}`);
  const value = typeof tok.value === 'object' ? (tok.value[theme] ?? tok.value.light) : tok.value;
  const target = aliasOf(value);
  return target ? resolve(target, theme, app, seen) : value;
}

const px = (v) => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v));
  if (!m) throw new Error(`Expected px, got ${v}`);
  return Number(m[1]);
};
const numberMap = (family) => Object.fromEntries(family.tokens.map((x) => [x.name, px(x.value)]));

const names = t.color.tokens.map((c) => c.name);
const palette = (theme, app) => Object.fromEntries(names.map((n) => [n, resolve(n, theme, app)]));
const themes = {
  fincrew: { light: palette('light', 'fincrew'), dark: palette('dark', 'fincrew') },
  staffora: { light: palette('light', 'staffora'), dark: palette('dark', 'staffora') },
};

const textStyles = {};
for (const g of t.type.groups) {
  for (const s of g.styles) {
    textStyles[s.name] = {
      family: g.family,
      fontSize: px(s.fontSize),
      lineHeight: px(s.lineHeight),
      fontWeight: Number(s.fontWeight),
      ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}),
      tabularNums: g.family === 'num',
    };
  }
}

const header = (c) =>
  `${c} ${t.name} v${t.version}: generated from packages/ui/design/tokens.json by scripts/ui-tokens.mjs. Do not edit.`;

// ---------- TypeScript ----------
const ts = `// ${header('').trim()}
/* eslint-disable */

export const colorNames = ${JSON.stringify(names)} as const;
export type ColorName = (typeof colorNames)[number];
export type Palette = Record<ColorName, string>;
export type AppName = 'fincrew' | 'staffora';
export type ThemeName = 'light' | 'dark';

/** Every colour resolved per app (accent) and theme. Use for React Native and charts. */
export const themes: Record<AppName, Record<ThemeName, Palette>> = ${JSON.stringify(themes, null, 2)};

/** Pixel values. */
export const space = ${JSON.stringify(numberMap(t.spacing), null, 2)} as const;
export const radius = ${JSON.stringify(numberMap(t.radius), null, 2)} as const;
export const size = ${JSON.stringify(numberMap(t.size), null, 2)} as const;
export const opacity = ${JSON.stringify(Object.fromEntries(t.opacity.tokens.map((x) => [x.name, Number(x.value)])), null, 2)} as const;

/** CSS box-shadow strings per theme (web). */
export const shadow = ${JSON.stringify(Object.fromEntries(t.shadow.tokens.map((x) => [x.name, x.value])), null, 2)} as const;

export const fontFamilies = ${JSON.stringify(t.type.families, null, 2)} as const;

export type TextStyle = {
  family: keyof typeof fontFamilies;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing?: string;
  tabularNums: boolean;
};
export const textStyles = ${JSON.stringify(textStyles, null, 2)} satisfies Record<string, TextStyle>;
export type TextStyleName = keyof typeof textStyles;
`;

// ---------- CSS ----------
const cssVar = (name, theme) => {
  const tok = colors.get(name);
  const value = typeof tok.value === 'object' ? (tok.value[theme] ?? tok.value.light) : tok.value;
  const target = aliasOf(value);
  return target ? `var(--${target})` : value;
};
const isAlias = (name) =>
  aliasOf(typeof colors.get(name).value === 'object' ? null : colors.get(name).value);
const themed = (theme) =>
  names
    .filter((n) => !isAlias(n) && typeof colors.get(n).value === 'object')
    .map((n) => `  --${n}: ${cssVar(n, theme)};`)
    .concat(
      t.shadow.tokens.map(
        (x) => `  --${x.name}: ${typeof x.value === 'object' ? x.value[theme] : x.value};`,
      ),
    )
    .join('\n');

const lightRoot = [
  ...names.map((n) => `  --${n}: ${cssVar(n, 'light')};`),
  ...t.shadow.tokens.map(
    (x) => `  --${x.name}: ${typeof x.value === 'object' ? x.value.light : x.value};`,
  ),
  ...['spacing', 'radius', 'size'].flatMap((f) =>
    t[f].tokens.map((x) => `  --${x.name}: ${x.value};`),
  ),
  ...t.opacity.tokens.map((x) => `  --${x.name}: ${x.value};`),
  ...Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`),
  '  color-scheme: light;',
].join('\n');

const textClasses = Object.entries(textStyles)
  .map(
    ([n, s]) =>
      `.text-${n} {\n  font-family: var(--font-${s.family});\n  font-size: ${s.fontSize}px;\n  line-height: ${s.lineHeight}px;\n  font-weight: ${s.fontWeight};${s.letterSpacing ? `\n  letter-spacing: ${s.letterSpacing};` : ''}${s.tabularNums ? '\n  font-variant-numeric: tabular-nums;' : ''}\n}`,
  )
  .join('\n\n');

const css = `${header('/*')} */

/* Light values; aliases (accent, money-*, danger) point at other variables, so they follow the theme. */
:root {
${lightRoot}
}

/* Dark: the system setting, unless the user picked light; or an explicit dark choice. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${themed('dark').replace(/^/gm, '  ')}
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
${themed('dark')}
  color-scheme: dark;
}

/* Staffora screens: wrap in class="app-staffora" to switch the accent to Marigold. */
.app-staffora {
${Object.entries(STAFFORA_ACCENT)
  .map(([a, s]) => `  --${a}: var(--${s});`)
  .join('\n')}
}

/* Text styles */
${textClasses}
`;

const check = process.argv.includes('--check');
let stale = false;
for (const [file, content] of [
  [OUT_TS, ts],
  [OUT_CSS, css],
]) {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {}
  if (current === content) continue;
  if (check) {
    console.error(`${file} is out of date: run pnpm ui:tokens`);
    stale = true;
  } else {
    writeFileSync(file, content);
    console.log(`Wrote ${file}`);
  }
}
if (stale) process.exit(1);
if (check) console.log('UI tokens up to date');
