import {
  formatDisplayDate,
  formatINR,
  numberInWords,
  type HistoryRow,
  type NumberWords,
  type Paise,
  type PayslipLine,
  type StatementMonth,
} from '@fincrew/core';
import { PAYSLIP_MINUS_LINES, type Translate } from './payslip-text';
import type { StatementView } from './statement';

/**
 * The two statements as a page and as text, shared so the website and the FinCrew app show the
 * same thing (design "Web · statement", "Web · statement, historical"). The page is plain HTML with
 * its own paper colours: it stays light in dark mode, and the app can print it to a PDF as it is.
 */

export type StatementKind = 'statement' | 'historical';

const C = {
  accent: '#0b5d6b',
  accentSoft: '#d9edef',
  ink: '#11171a',
  muted: '#525b62',
  line: '#dde1db',
  strong: '#838b85',
  late: '#a14b06',
  lateSoft: '#fcead1',
  paid: '#13753a',
};
const FONT = `'Anek Latin', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const NUM = 'font-variant-numeric: tabular-nums;';
const CAP = `font-size: 12px; line-height: 16px; color: ${C.muted};`;
const SECTION = `margin: 0; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${C.muted};`;

/** Names and notes are typed by people: nothing they type may become markup. */
const esc = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const monthTitle = (months: readonly string[], m: { year: number; month: number }) =>
  `${months[m.month - 1]} ${m.year}`;

/** −₹1,500.00 / +₹120.00 / ₹30,793.00: the sign is part of the amount shown. */
const signed = (amount: Paise, plus = false) =>
  amount < 0 ? `−${formatINR(-amount)}` : `${plus ? '+' : ''}${formatINR(amount)}`;

function inWords(amount: Paise, t: Translate) {
  const paise = Math.abs(amount);
  const words = t('payslip.words', { returnObjects: true }) as unknown as NumberWords;
  const rupees = numberInWords(Math.floor(paise / 100), words);
  return paise % 100
    ? t('payslip.inWordsPaise', { rupees, paise: numberInWords(paise % 100, words) })
    : t('payslip.inWords', { rupees });
}

/** The heading over the total: who owes whom, and whether it's the Historical view. */
export function statementHeadline(v: StatementView, kind: StatementKind, t: Translate) {
  const { total } = v.statement;
  const name = v.name;
  if (total === 0) return t('statement.settled', { name });
  const soFar = kind === 'historical' ? 'SoFar' : '';
  return t(`statement.${total > 0 ? 'weOwe' : 'owesShop'}${soFar}`, { name });
}

/** A month's dates and days, as the statement shows them. */
export function statementMonthLine(m: StatementMonth, t: Translate) {
  const days = t(m.state === 'running' ? 'statement.daysSoFar' : 'statement.days', {
    payable: m.payableDays,
    employed: m.employedDays,
  });
  const closed = m.newCycleFrom
    ? ` · ${t('statement.closedEarly', { date: formatDisplayDate(m.newCycleFrom) })}`
    : '';
  return `${formatDisplayDate(m.from)} – ${formatDisplayDate(m.to)} · ${days}${closed}`;
}

/** How a month's amount is made up: Salary ₹14,516.00 · Late −₹100.00 · … */
export function statementMonthParts(m: StatementMonth, t: Translate) {
  const label = (l: PayslipLine) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: m.payableDays });
  return m.lines
    .map((l, i) => {
      const minus = PAYSLIP_MINUS_LINES.includes(l.kind);
      return `${label(l)} ${minus ? '−' : i === 0 ? '' : '+'}${formatINR(l.amount)}`;
    })
    .join(' · ');
}

/** The words for one Historical row. */
export function historyRowText(
  row: HistoryRow,
  t: Translate,
  months: readonly string[],
  name: string,
): { title: string; detail: string } {
  const first = firstName(name);
  const mode = row.mode ? t(`salary.modes.${row.mode}`) : '';
  const joined = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  switch (row.kind) {
    case 'salary':
      return row.month
        ? {
            title: t(
              row.state === 'running' ? 'statement.rows.salarySoFar' : 'statement.rows.salary',
              { month: months[row.month.month - 1] },
            ),
            detail: statementMonthLine(row.month, t),
          }
        : { title: t('ledgerTypes.salary_earned'), detail: '' };
    case 'addition':
      return { title: row.name ?? '', detail: t('statement.rows.added') };
    case 'deduction':
      return {
        title: row.name ?? t('ledgerTypes.deduction'),
        detail: row.state === 'final' ? '' : t('statement.rows.takenOff'),
      };
    case 'late':
      return { title: t('ledgerTypes.late_deduction'), detail: '' };
    case 'payment':
      return { title: t('ledgerTypes.salary_payment'), detail: joined(mode, row.note) };
    case 'advance':
      return { title: t('statement.advanceGiven'), detail: joined(mode, row.note) };
    case 'expense':
      return { title: t('statement.rows.expense', { name: first }), detail: joined(row.note) };
    case 'expense_paid':
      return { title: t('ledgerTypes.reimbursement_paid'), detail: joined(mode, row.note) };
    case 'charge':
      return { title: t('statement.rows.charge', { name: first }), detail: joined(row.note) };
    case 'opening':
      return { title: t('ledgerTypes.opening_balance'), detail: joined(row.note) };
    case 'correction':
      return { title: t('ledgerTypes.adjustment'), detail: joined(row.name, row.note) };
    case 'undone':
      return {
        title: t('statement.rows.undone', {
          what: row.reverses ? t(`ledgerTypes.${row.reverses}`) : '',
        }),
        detail: joined(row.note),
      };
  }
}

/** Rows of the Historical view under their calendar month, oldest first. */
export function historyByMonth(rows: readonly HistoryRow[], months: readonly string[]) {
  const groups: { key: string; title: string; rows: HistoryRow[] }[] = [];
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    let group = groups.at(-1);
    if (group?.key !== key) {
      const [year, month] = key.split('-').map(Number) as [number, number];
      group = { key, title: monthTitle(months, { year, month }), rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

export const STATEMENT_SUMMARY_KEYS = [
  'earned',
  'additions',
  'expenses',
  'deductions',
  'paid',
  'advances',
  'other',
] as const;

/** The file a statement is saved as. */
export function statementFileName(v: StatementView, kind: StatementKind, t: Translate) {
  const date = formatDisplayDate(v.today).replace(/\//g, '-');
  return `${t(kind === 'historical' ? 'statement.historicalFile' : 'statement.title')} ${v.name} ${date}`;
}

/** A statement as plain text (WhatsApp): the sums, with the details left to the PDF. */
export function statementShareText(
  v: StatementView,
  kind: StatementKind,
  t: Translate,
  months: readonly string[],
): string {
  const s = v.statement;
  const money = (amount: Paise, plus = false) => signed(amount, plus);
  const final = `${statementHeadline(v, kind, t)}: ${formatINR(Math.abs(s.total))}`;
  if (kind === 'historical') {
    const sum = v.history.summary;
    return [
      `${v.shopName} · ${t('statement.historicalFile')}`,
      `${v.name} · ${formatDisplayDate(v.joiningDate)} – ${formatDisplayDate(v.today)}`,
      '',
      ...STATEMENT_SUMMARY_KEYS.filter((k) => sum[k] !== 0).map(
        (k) =>
          `${t(`statement.summary.${k}`, { name: firstName(v.name) })}: ${money(sum[k], k === 'additions' || k === 'expenses')}`,
      ),
      '',
      final,
    ].join('\n');
  }
  return [
    `${v.shopName} · ${t('statement.title')}`,
    `${v.name} · ${t('statement.asOnDate', { date: formatDisplayDate(v.today) })}`,
    '',
    `${t('statement.salaryLeft')}: ${formatINR(s.salaryLeft)}`,
    ...s.months.map(
      (m) =>
        `  ${monthTitle(months, m)}${m.state === 'finalized' ? '' : ` (${t(`statement.state.${m.state}`)})`}: ${formatINR(m.left)}`,
    ),
    ...(s.advance ? [`${t('statement.advanceLeft')}: −${formatINR(s.advance)}`] : []),
    ...(s.expenseOwed ? [`${t('statement.expensesOwedShort')}: +${formatINR(s.expenseOwed)}`] : []),
    ...(s.expenseCharged
      ? [`${t('statement.expensesChargedShort')}: −${formatINR(s.expenseCharged)}`]
      : []),
    ...(s.other ? [`${t('statement.other')}: ${money(s.other, true)}`] : []),
    '',
    final,
  ].join('\n');
}

const pill = (text: string, final: boolean) =>
  `<span style="display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; line-height: 16px; font-weight: 600; white-space: nowrap; background: ${final ? C.accentSoft : C.lateSoft}; color: ${final ? C.accent : C.late};">${esc(text)}</span>`;

const fact = (label: string, value: string) =>
  `<div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;"><span style="${CAP}">${esc(label)}</span><span style="font-size: 14px; line-height: 20px; font-weight: 600;">${esc(value)}</span></div>`;

function head(v: StatementView, title: string, t: Translate) {
  return `<div aria-hidden="true" style="height: 8px; background: ${C.accent};"></div>
<div style="display: flex; flex-direction: column; gap: 24px; padding: 36px 40px;">
<header style="display: flex; flex-direction: column; gap: 4px;">
<span style="font-size: 24px; line-height: 30px; font-weight: 600;">${esc(v.shopName)}</span>
<span style="font-size: 14px; line-height: 20px; color: ${C.muted};">${esc(title)}</span>
</header>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 24px; padding: 14px 0; border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line};">
${fact(t('statement.employee'), v.name)}
${fact(t('statement.joined'), formatDisplayDate(v.joiningDate))}
${fact(t('statement.payDay'), t('statement.payDayValue', { day: v.payDay }))}
${fact(t('statement.asOn'), formatDisplayDate(v.today))}
</div>`;
}

function hero(v: StatementView, kind: StatementKind, t: Translate) {
  const { total } = v.statement;
  const [rupees, fraction] = formatINR(Math.abs(total)).split('.');
  return `<section style="display: flex; flex-direction: column; gap: 6px; padding: 20px 24px; border-radius: 12px; background: ${C.accentSoft};">
<span style="font-size: 14px; line-height: 20px; font-weight: 600; color: ${C.accent};">${esc(statementHeadline(v, kind, t))}</span>
<span style="font-size: 40px; line-height: 44px; font-weight: 600; ${NUM}">${esc(rupees ?? '')}<span style="font-size: 20px; color: ${C.muted};">.${esc(fraction ?? '')}</span></span>
<span style="${CAP}">${esc(inWords(total, t))}</span>
</section>`;
}

function foot(left: string, v: StatementView, t: Translate) {
  return `<footer style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding-top: 12px; border-top: 1px solid ${C.line}; ${CAP}">
<span>${esc(left)}</span>
<span>${esc(t('statement.madeOn', { date: formatDisplayDate(v.today) }))}</span>
</footer>
</div>`;
}

function statementBody(v: StatementView, t: Translate, months: readonly string[]) {
  const s = v.statement;
  const first = firstName(v.name);
  const td = `padding: 10px 0 10px 12px; border-bottom: 1px solid ${C.line}; text-align: right; vertical-align: top; white-space: nowrap; ${NUM}`;
  const th = `padding: 0 0 6px 12px; text-align: right; font-weight: 500; ${CAP} border-bottom: 1px solid ${C.strong};`;
  const rows = s.months
    .map(
      (m) => `<tr style="break-inside: avoid;">
<td style="padding: 10px 12px 10px 0; border-bottom: 1px solid ${C.line}; vertical-align: top;">
<span style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;"><span style="font-weight: 600;">${esc(monthTitle(months, m))}</span>${pill(t(`statement.state.${m.state}`), m.state === 'finalized')}</span>
<span style="display: block; ${CAP}">${esc(statementMonthLine(m, t))}</span>
<span style="display: block; ${CAP}">${esc(statementMonthParts(m, t))}</span>
</td>
<td style="${td}">${formatINR(m.amount)}</td>
<td style="${td} color: ${C.paid};">${m.paid ? formatINR(m.paid) : '—'}</td>
<td style="${td} font-weight: 600;">${signed(m.left)}</td>
</tr>`,
    )
    .join('\n');

  const list = (
    title: string,
    items: readonly { date: string; left: Paise; note?: string | null; mode?: string | null }[],
    label: (i: (typeof items)[number]) => string,
    total: string,
    amount: string,
  ) => {
    if (items.length === 0) return '';
    const lines = items
      .map(
        (i) =>
          `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid ${C.line};"><span>${esc(`${formatDisplayDate(i.date)} · ${label(i)}`)}</span><span style="${NUM}">${formatINR(i.left)}</span></div>`,
      )
      .join('');
    return `<section style="display: flex; flex-direction: column; gap: 4px; break-inside: avoid;">
<h2 style="${SECTION}">${esc(title)}</h2>
<div>${lines}</div>
<div style="display: flex; justify-content: space-between; gap: 12px; padding-top: 8px; font-weight: 600;"><span>${esc(total)}</span><span style="${NUM}">${amount}</span></div>
</section>`;
  };
  const mode = (m?: string | null) => (m ? t(`salary.modes.${m}`) : '');
  const open = [
    list(
      t('statement.advanceLeft'),
      s.advances,
      (i) => [t('statement.advanceGiven'), mode(i.mode)].filter(Boolean).join(' · '),
      t('statement.advanceLeft'),
      `−${formatINR(s.advance)}`,
    ),
    list(
      t('statement.expensesOwed', { name: first }),
      s.owed,
      (i) => i.note || t('statement.rows.expense', { name: first }),
      t('statement.expensesOwedShort'),
      `+${formatINR(s.expenseOwed)}`,
    ),
    list(
      t('statement.expensesCharged', { name: first }),
      s.charged,
      (i) => i.note || t('statement.rows.charge', { name: first }),
      t('statement.expensesChargedShort'),
      `−${formatINR(s.expenseCharged)}`,
    ),
  ].filter(Boolean);

  const add = (label: string, amount: string) =>
    `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0;"><span style="color: ${C.muted};">${esc(label)}</span><span style="${NUM}">${amount}</span></div>`;

  return `<section style="display: flex; flex-direction: column; gap: 8px;">
<h2 style="${SECTION}">${esc(t('statement.salaryLeft'))}</h2>
<table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 20px;">
<thead><tr>
<th style="padding: 0 12px 6px 0; text-align: left; font-weight: 500; ${CAP} border-bottom: 1px solid ${C.strong};">${esc(t('statement.cols.month'))}</th>
<th style="${th}">${esc(t('statement.cols.amount'))}</th><th style="${th}">${esc(t('statement.cols.paid'))}</th><th style="${th}">${esc(t('statement.cols.left'))}</th>
</tr></thead>
<tbody>
${rows}
<tr><td colspan="3" style="padding: 10px 0 0; font-weight: 600;">${esc(t('statement.salaryLeft'))}</td><td style="padding: 10px 0 0 12px; text-align: right; font-weight: 600; ${NUM}">${signed(s.salaryLeft)}</td></tr>
</tbody>
</table>
</section>
${open.length ? `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; font-size: 14px; line-height: 20px;">${open.join('\n')}</div>` : ''}
<section style="display: flex; flex-direction: column; margin-left: auto; width: 50%; min-width: 280px; font-size: 14px; line-height: 20px; break-inside: avoid;">
<h2 style="${SECTION} padding-bottom: 6px;">${esc(t('statement.addsUp'))}</h2>
${add(t('statement.salaryLeft'), signed(s.salaryLeft))}
${s.advance ? add(t('statement.advanceLeft'), `−${formatINR(s.advance)}`) : ''}
${s.expenseOwed ? add(t('statement.expensesOwedShort'), `+${formatINR(s.expenseOwed)}`) : ''}
${s.expenseCharged ? add(t('statement.expensesChargedShort'), `−${formatINR(s.expenseCharged)}`) : ''}
${s.other ? add(t('statement.other'), signed(s.other, true)) : ''}
<div style="display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; padding-top: 10px; border-top: 1px solid ${C.strong}; font-weight: 600;"><span>${esc(statementHeadline(v, 'statement', t))}</span><span style="font-size: 18px; ${NUM}">${formatINR(Math.abs(s.total))}</span></div>
</section>`;
}

function historicalBody(v: StatementView, t: Translate, months: readonly string[]) {
  const sum = v.history.summary;
  const first = firstName(v.name);
  const tiles = STATEMENT_SUMMARY_KEYS.filter((k) => k !== 'other' || sum.other !== 0)
    .map(
      (k) =>
        `<div style="display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid ${C.line}; border-radius: 6px;"><span style="${CAP}">${esc(t(`statement.summary.${k}`, { name: first }))}</span><span style="font-size: 16px; line-height: 22px; font-weight: 600; ${NUM}">${signed(sum[k], k === 'additions' || k === 'expenses')}</span></div>`,
    )
    .join('');
  const cell = `padding: 7px 0 7px 12px; border-bottom: 1px solid ${C.line}; text-align: right; vertical-align: top; white-space: nowrap; ${NUM}`;
  const body = historyByMonth(v.history.rows, months)
    .map((group) => {
      const lines = group.rows
        .map((row) => {
          const { title, detail } = historyRowText(row, t, months, v.name);
          const tag =
            row.state === 'final' ? '' : ` ${pill(t(`statement.state.${row.state}`), false)}`;
          return `<tr style="break-inside: avoid;">
<td style="padding: 7px 12px 7px 0; border-bottom: 1px solid ${C.line}; vertical-align: top; white-space: nowrap; ${NUM}">${formatDisplayDate(row.date)}</td>
<td style="padding: 7px 0; border-bottom: 1px solid ${C.line}; vertical-align: top;"><span style="font-weight: 500;">${esc(title)}</span>${tag}${detail ? `<span style="display: block; ${CAP}">${esc(detail)}</span>` : ''}</td>
<td style="${cell}">${row.amount > 0 ? formatINR(row.amount) : ''}</td>
<td style="${cell}">${row.amount < 0 ? formatINR(-row.amount) : ''}</td>
<td style="${cell} font-weight: 600;">${signed(row.balance)}</td>
</tr>`;
        })
        .join('\n');
      return `<tr style="break-after: avoid;"><td colspan="5" style="padding: 14px 0 6px; font-size: 13px; line-height: 18px; font-weight: 600; border-bottom: 1px solid ${C.strong};">${esc(group.title)}</td></tr>\n${lines}`;
    })
    .join('\n');
  const th = `padding: 0 0 6px 12px; text-align: right; font-weight: 500; ${CAP}`;
  return `<section style="display: flex; flex-direction: column; gap: 8px; break-inside: avoid;">
<h2 style="${SECTION}">${esc(t('statement.everything'))}</h2>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">${tiles}</div>
</section>
<section style="display: flex; flex-direction: column; gap: 8px;">
<h2 style="${SECTION}">${esc(t('statement.lineByLine', { name: first }))}</h2>
<table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 18px;">
<thead style="display: table-header-group;"><tr>
<th style="padding: 0 12px 6px 0; text-align: left; font-weight: 500; ${CAP}">${esc(t('statement.cols.date'))}</th>
<th style="padding: 0 0 6px; text-align: left; font-weight: 500; ${CAP}">${esc(t('statement.cols.details'))}</th>
<th style="${th}">${esc(t('statement.cols.added'))}</th><th style="${th}">${esc(t('statement.cols.takenOff'))}</th><th style="${th}">${esc(t('statement.cols.balance'))}</th>
</tr></thead>
<tbody>
${body}
<tr><td colspan="4" style="padding: 12px 0 0; font-size: 14px; font-weight: 600;">${esc(statementHeadline(v, 'statement', t))}</td><td style="padding: 12px 0 0 12px; text-align: right; font-size: 16px; font-weight: 600; ${NUM}">${formatINR(Math.abs(v.statement.total))}</td></tr>
</tbody>
</table>
</section>`;
}

/** The statement as HTML to place in a page. Everything people typed is escaped. */
export function statementDocumentHtml(
  v: StatementView,
  kind: StatementKind,
  t: Translate,
  months: readonly string[],
): string {
  const title =
    kind === 'historical'
      ? t('statement.historicalTitle', {
          from: formatDisplayDate(v.joiningDate),
          to: formatDisplayDate(v.today),
        })
      : t('statement.whatWeOwe');
  return `<div style="background: #ffffff; color: ${C.ink}; font-family: ${FONT}; font-size: 14px; line-height: 20px;">
${head(v, title, t)}
${hero(v, kind, t)}
${kind === 'historical' ? historicalBody(v, t, months) : statementBody(v, t, months)}
${foot(t(kind === 'historical' ? 'statement.footHistorical' : 'statement.footStatement'), v, t)}
</div>`;
}

/** A whole A4 page, for the app to print to a PDF. */
export function statementPrintHtml(
  v: StatementView,
  kind: StatementKind,
  t: Translate,
  months: readonly string[],
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(statementFileName(v, kind, t))}</title>
<link href="https://fonts.googleapis.com/css2?family=Anek+Latin:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; background: #fff; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${statementDocumentHtml(v, kind, t, months)}</body>
</html>`;
}
